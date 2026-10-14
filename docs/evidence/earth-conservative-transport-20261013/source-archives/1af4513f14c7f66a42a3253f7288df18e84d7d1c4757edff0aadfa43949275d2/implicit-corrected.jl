# Experimental, optional repair of the dry thermal semi-implicit split.
# Adapted operator setup from SpeedyWeather 0.23.0, EUPL-1.2.
# Copyright (c) 2020 Milan Kloewer; (c) 2021 The SpeedyWeather.jl Contributors;
# (c) 2022 Fred Kucharski and Franco Molteni. Modified 2026-10-13.
# License: ../earth-speedy-moisture-monsoon-20261013/LICENSE-SpeedyWeather.txt.
# No installed methods are replaced; this dispatches only on the new component.
using LinearAlgebra

struct ConsistentImplicitPrimitiveEquation{I} <: SW.AbstractImplicit
    inner::I
    enabled::Bool
end
function ConsistentImplicitPrimitiveEquation(sg;centering=1.0,enabled=true)
    sg.architecture isa SW.CPU || throw(ArgumentError("experimental implicit repair is CPU-only"))
    (centering==0 || 0.5<=centering<=1) || throw(ArgumentError("centering must be 0 or in [0.5,1]"))
    ConsistentImplicitPrimitiveEquation(SW.ImplicitPrimitiveEquation(sg;centering),enabled)
end
Base.getproperty(c::ConsistentImplicitPrimitiveEquation,s::Symbol)=
    s in (:inner,:enabled) ? getfield(c,s) : getproperty(getfield(c,:inner),s)
Base.propertynames(c::ConsistentImplicitPrimitiveEquation,private::Bool=false)=
    (:inner,:enabled,propertynames(getfield(c,:inner),private)...)

function SW.variables(c::ConsistentImplicitPrimitiveEquation)
    (SW.variables(c.inner)...,
        SW.ScratchVariable(:implicit_background_temperature,SW.GridXYZ(),namespace=:grid),
        SW.ScratchVariable(:implicit_background_tendency,SW.GridXYZ(),namespace=:grid),
        SW.ScratchVariable(:implicit_background_tendency,SW.SpectralXYZ()))
end

function SW.initialize!(c::ConsistentImplicitPrimitiveEquation,m::SW.PrimitiveEquation)
    m.time_stepping isa SW.Leapfrog || throw(ArgumentError("experimental repair requires Leapfrog"))
    m.vertical_advection isa SW.CenteredVerticalAdvection{<:Any,1} ||
        throw(ArgumentError("experimental repair requires second-order centered vertical advection"))
    m.geometry.vertical_coordinates isa SW.SigmaCoordinates ||
        throw(ArgumentError("experimental repair requires pure sigma coordinates"))
    first(m.geometry.σ_levels_half)==0 || throw(ArgumentError("model top must be sigma=0"))
    nothing
end

"""Exact Jacobian of the native second-order centered background vertical advection.

w[k+1/2] = sum_r (sigma_half[k+1]-1[r<=k])*ds[r]*D[r].
Temperature tendency = -(w_b*(T_b-T_k)+w_a*(T_k-T_a))/(2ds[k]).
This is a transport operator, not an adiabatic conversion or water correction.
"""
function background_advection_matrix(T,half,ds)
    n=length(T);V=zeros(eltype(T),n,n)
    for k in 1:n,r in 1:n
        below=k<n ? (T[k+1]-T[k])*(half[k+1]-(r<=k))*ds[r] : zero(eltype(T))
        above=k>1 ? (T[k]-T[k-1])*(half[k]-(r<k))*ds[r] : zero(eltype(T))
        V[k,r]=-(below+above)/(2ds[k])
    end
    V
end

function SW.initialize!(c::ConsistentImplicitPrimitiveEquation,dt::Real,T::AbstractVector,
        g::SW.AbstractGeometry,geopot::SW.AbstractGeopotential,A::SW.AbstractAtmosphere,
        adiab::SW.AbstractAdiabaticConversion)
    p=c.inner;n=p.nlayers;ds=g.σ_levels_thick
    p.temp_profile .= T
    fill!(p.R,0)
    for k in 1:n
        p.R[1:k,k] .= -geopot.Δp_geopot_full[k]
        p.R[1:k-1,k] .-= geopot.Δp_geopot_half[k]
    end
    p.U .= -A.R_dry .* T
    p.W .= -ds
    p.L0 .= 1 ./ (2 .* ds)
    p.L2 .= A.κ .* T .* adiab.σ_lnp_A
    p.L4 .= A.κ .* T .* adiab.σ_lnp_B
    fill!(p.L3,0)
    for k in 1:n,r in 1:k-1;p.L3[k,r]=ds[r];end
    V=background_advection_matrix(T,g.σ_levels_half,ds)
    p.L .= V + Diagonal(p.L2)*p.L3 + Diagonal(p.L4)
    xi=(c.enabled ? p.centering : zero(p.centering))*dt
    eye=Matrix{eltype(T)}(I,n,n)
    fill!(p.S⁻¹,0)  # retain native unused final spectral row
    for l in 1:p.truncation
        eigenvalue=-l*(l-1)
        p.S .= eye .- xi^2*eigenvalue.*(p.R*p.L+p.U*p.W')
        p.S⁻¹[l,:,:] .= inv(p.S)
    end
    nothing
end

function SW.reinitialize!(c::ConsistentImplicitPrimitiveEquation,m::SW.PrimitiveEquation,v::SW.Variables)
    dt=SW.time_step(m.time_stepping,v.prognostic.clock)
    c.Δt[]==dt && return nothing
    SW.initialize!(c,m)  # native model defers implicit initialization to this hook
    SW.initialize!(c,dt/v.prognostic.scale[],v.dynamics.average_temperature_profile,
        m.geometry,m.geopotential,m.atmosphere,m.adiabatic_conversion)
    c.Δt[]=dt
    nothing
end

"""Restore only the background temperature advection omitted by the native split.

Native w already contains the current dynamics time level and radius scaling.
The scratch tendency is reset each call; add it once before implicit correction.
No humidity, pressure, momentum, or prognostic state is changed here.
"""
function add_background_temperature_advection!(v,c::ConsistentImplicitPrimitiveEquation,m)
    background=v.scratch.grid.implicit_background_temperature
    tendency=v.scratch.grid.implicit_background_tendency
    spectral=v.scratch.implicit_background_tendency
    background.data .= c.temp_profile'
    fill!(tendency,0)
    SW._vertical_advection!(tendency,1,v.dynamics.w,background,1,m.geometry.σ_levels_thick,m.vertical_advection)
    SW.transform!(spectral,tendency,m.spectral_transform)
    target=SW.get_tendency_step(v.tendencies.temperature,m.time_stepping,c)
    target .+= spectral
    nothing
end

function SW.implicit_correction!(v::SW.Variables,c::ConsistentImplicitPrimitiveEquation,
        ts::SW.AbstractLeapfrog,m::SW.PrimitiveEquation)
    add_background_temperature_advection!(v,c,m)
    c.enabled && c.centering!=0 && SW.implicit_correction!(v,c.inner,ts,m)
    nothing
end
