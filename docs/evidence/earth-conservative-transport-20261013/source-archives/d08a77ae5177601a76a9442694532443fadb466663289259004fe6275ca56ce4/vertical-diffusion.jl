# Experiment-only replacement for SpeedyWeather's vertical exchange operator.
# Integration follows SpeedyWeather.jl (EUPL-1.2):
# Copyright (c) 2020 Milan Kloewer for SpeedyWeather.jl
# Copyright (c) 2021 The SpeedyWeather.jl Contributors for SpeedyWeather.jl
# Copyright (c) 2022 Fred Kucharski and Franco Molteni for SPEEDY parametrization schemes
# Modified 2026-10-13. See LICENSE-SpeedyWeather.txt in this directory.
module ConservativeVerticalMixing
import SpeedyWeather as SW
export ConservativeVerticalDiffusion, sigma_conductance, implicit_column_diffusion!

"""Conservative implicit sigma exchange; optional shared surface-aware Ri (CPU)."""
struct ConservativeVerticalDiffusion{D,R} <: SW.AbstractVerticalDiffusion
    inner::D
    richardson::R
end
function ConservativeVerticalDiffusion(native::SW.BulkRichardsonDiffusion; surface_aware=false)
    scope = parentmodule(@__MODULE__)
    surface_aware && !isdefined(scope, :boundary_layer_richardson) &&
        error("include boundary-layer.jl before requesting surface_aware=true")
    ri = surface_aware ? getfield(scope, :boundary_layer_richardson) : nothing
    return ConservativeVerticalDiffusion(native, ri)
end
ConservativeVerticalDiffusion(sg::SW.SpectralGrid; surface_aware=false, kwargs...) =
    ConservativeVerticalDiffusion(SW.BulkRichardsonDiffusion(sg; kwargs...); surface_aware)
SW.variables(d::ConservativeVerticalDiffusion) = (SW.variables(d.inner)...,
    SW.ParameterizationVariable(:vertical_mixing_active, SW.Grid2D(); units="1",
        desc="One when at least one interior vertical mixing conductance is positive"))
function SW.initialize!(d::ConservativeVerticalDiffusion, model::SW.PrimitiveEquation)
    model.architecture isa SW.CPU || error("ConservativeVerticalDiffusion currently supports CPU only")
    model.geometry.vertical_coordinates isa SW.SigmaCoordinates ||
        error("ConservativeVerticalDiffusion requires pure sigma coordinates")
    return SW.initialize!(d.inner, model)
end

function diffusion_coefficients!(ij, vars, d::ConservativeVerticalDiffusion, model)
    native = d.inner
    ts, atmosphere = model.time_stepping, model.atmosphere
    if d.richardson === nothing
        return SW.get_diffusion_coefficients!(ij, vars, native, ts, atmosphere,
            model.planet, model.orography, model.geopotential)
    end
    # Native coefficient formulas retained; only Ri's surface reference and
    # height datum come from the shared Frierson eq.15/16 helper.
    n = model.geometry.nlayers
    Ri, K = vars.scratch.grid.a, vars.scratch.grid.b
    for k in 1:n
        Ri[ij, k] = d.richardson(ij, k, vars, native, model)
        K[ij, k] = 0
    end
    Ri_c = native.critical_Richardson
    k_top = n
    while k_top > 0 && Ri[ij, k_top] < Ri_c
        k_top -= 1
    end
    k_top += 1
    vars.parameterizations.boundary_layer_height[ij] = k_top
    if k_top <= n
        g = model.planet.gravity
        fb, z0, kappa = native.surface_layer_fraction, native.roughness_length, native.von_Karman
        Z = atmosphere.reference_temperature * model.geopotential.Δp_geopot_full[n] / g
        logZ_z0 = log(Z / z0)
        phi = vars.dynamics.geopotential
        orog = model.orography.orography[ij]
        h = max(phi[ij, k_top] / g - orog, 0)
        Ri_N = clamp(Ri[ij, n], 0, Ri_c)
        sqrtC = (kappa / logZ_z0) * (1 - Ri_N / Ri_c)
        u = SW.get_prognostic_step(vars.grid.u, ts, native)
        v = SW.get_prognostic_step(vars.grid.v, ts, native)
        K0 = kappa * sqrt(u[ij, n]^2 + v[ij, n]^2) * sqrtC
        for k in k_top:n
            z = max(phi[ij, k] / g - orog, z0)
            Kk = K0 * min(z, fb * h)
            Kk *= z < fb * h ? one(K0) : SW.zfac(z, h, fb)
            Kk *= Ri[ij, k_top] <= 0 ? one(K0) : SW.Rifac(Ri[ij, k_top], Ri_c, logZ_z0)
            K[ij, k] = Kk
        end
    end
    return K, k_top
end

"""
Interior conductances K_sigma / delta_sigma [s^-1]. Hydrostatic balance gives
d_sigma/d_z = -g*sigma/(R_d*T_virtual), so density-weighted height diffusion
(1/rho)*d_z(rho*K_z*d_z(x)) becomes d_sigma(K_sigma*d_sigma(x)), where
K_sigma = (g*sigma/(R_d*T_virtual))^2*K_z. K_z is in m^2/s.
Interpolate K_z and T_virtual to each actual interface before converting units.
The diagnosed boundary-layer top and the atmosphere's outer boundaries are sealed.
"""
function sigma_conductance(Kz, sigma, half, Tv, gravity, R_d; k_top=1)
    n = length(sigma)
    length(Kz) == length(Tv) == n && length(half) == n + 1 || throw(DimensionMismatch())
    all(diff(sigma) .> 0) && all(diff(half) .> 0) || throw(ArgumentError("sigma must increase"))
    all(isfinite, Kz) && all(Kz .>= 0) || throw(ArgumentError("K_z must be finite and nonnegative"))
    all(isfinite, Tv) && all(Tv .> 0) || throw(ArgumentError("virtual temperature must be positive"))
    c = zeros(promote_type(eltype(Kz), eltype(sigma)), max(n - 1, 0))
    for k in max(1, k_top):(n - 1)
        spacing = sigma[k + 1] - sigma[k]
        weight = (half[k + 1] - sigma[k]) / spacing
        0 <= weight <= 1 || throw(ArgumentError("interface must lie between centres"))
        Kh = (1 - weight) * Kz[k] + weight * Kz[k + 1]
        Th = (1 - weight) * Tv[k] + weight * Tv[k + 1]
        c[k] = (gravity * half[k + 1] / (R_d * Th))^2 * Kh / spacing
    end
    return c
end

"""
Accumulate a backward-Euler diffusion tendency for one column. `mass` is delta_sigma,
`conductance` has n-1 entries and `dt` is the actual prognostic update interval [s].
Shared interface fluxes conserve sum(mass .* x); no clipping or global correction.
`conversion=1/cp` converts dry-static-energy flux into a temperature tendency.
"""
function implicit_column_diffusion!(tend, x, conductance, mass, dt; conversion=1)
    n = length(x)
    length(tend) == length(mass) == n && length(conductance) == max(n - 1, 0) || throw(DimensionMismatch())
    isfinite(dt) && dt > 0 || throw(ArgumentError("dt must be positive and finite"))
    all(isfinite, mass) && all(mass .> 0) || throw(ArgumentError("layer masses must be positive"))
    all(isfinite, conductance) && all(conductance .>= 0) || throw(ArgumentError("conductances must be nonnegative"))
    n <= 1 && return nothing
    # Symmetric mass-form system: (M + dt*L) x_new = M*x_old.
    diag = mass .+ dt .* ([zero(dt); conductance] .+ [conductance; zero(dt)])
    solved = mass .* x
    for k in 2:n
        off = -dt * conductance[k - 1]
        ratio = off / diag[k - 1]
        diag[k] -= ratio * off
        solved[k] -= ratio * solved[k - 1]
    end
    solved[n] /= diag[n]
    for k in (n - 1):-1:1
        solved[k] = (solved[k] + dt * conductance[k] * solved[k + 1]) / diag[k]
    end
    # Recover tendencies from paired fluxes, avoiding cancellation in (new-old)/dt.
    for k in 1:(n - 1)
        flux = conversion * conductance[k] * (solved[k + 1] - solved[k])
        tend[k] += flux / mass[k]
        tend[k + 1] -= flux / mass[k + 1]
    end
    return nothing
end

function SW.parameterization!(ij, vars, d::ConservativeVerticalDiffusion, model)
    native = d.inner
    vars.parameterizations.vertical_mixing_active[ij] = 0
    any((native.diffuse_momentum, native.diffuse_static_energy, native.diffuse_humidity)) || return nothing
    ts, atmosphere = model.time_stepping, model.atmosphere
    K, k_top = diffusion_coefficients!(ij, vars, d, model)
    sigma, half = model.geometry.σ_levels_full, model.geometry.σ_levels_half
    mass = model.geometry.σ_levels_thick
    dt = SW.time_step(ts, vars.prognostic.clock)
    T = SW.get_prognostic_step(vars.grid.temperature, ts, d)
    wet = atmosphere isa SW.AbstractWetAtmosphere
    q = wet ? SW.get_prognostic_step(vars.grid.humidity, ts, d) : nothing
    Tv = [SW.virtual_temperature(T[ij, k], wet ? q[ij, k] : zero(T[ij, k]), atmosphere) for k in eachindex(sigma)]
    c = sigma_conductance(view(K, ij, :), sigma, half, Tv, model.planet.gravity, atmosphere.R_dry; k_top)
    vars.parameterizations.vertical_mixing_active[ij] = any(>(0), c) ? 1 : 0
    if native.diffuse_momentum
        for key in (:u, :v)
            x = SW.get_prognostic_step(getproperty(vars.grid, key), ts, d)
            tend = SW.get_tendency_step(getproperty(vars.tendencies.grid, key), ts, d)
            implicit_column_diffusion!(view(tend, ij, :), view(x, ij, :), c, mass, dt)
        end
    end
    if wet && native.diffuse_humidity
        tend = SW.get_tendency_step(vars.tendencies.grid.humidity, ts, d)
        implicit_column_diffusion!(view(tend, ij, :), view(q, ij, :), c, mass, dt)
    end
    if native.diffuse_static_energy
        cp = atmosphere.heat_capacity
        s = [cp * T[ij, k] + vars.dynamics.geopotential[ij, k] for k in eachindex(sigma)]
        tend = SW.get_tendency_step(vars.tendencies.grid.temperature, ts, d)
        implicit_column_diffusion!(view(tend, ij, :), s, c, mass, dt; conversion=inv(cp))
    end
    return nothing
end
end
using .ConservativeVerticalMixing: ConservativeVerticalDiffusion
