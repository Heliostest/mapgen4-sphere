# Derived from SpeedyWeather 0.23.0 large_scale_condensation.jl (EUPL-1.2).
# Copyright (c) 2020 Milan Kloewer; (c) 2021 The SpeedyWeather.jl Contributors;
# (c) 2022 Fred Kucharski and Franco Molteni for SPEEDY parametrization schemes.
# Modified 2026-10-13. Licence and warranty disclaimer: LICENSE-SpeedyWeather.txt.
# The installed package and previous experiment are unchanged.
# Native reevaporation subtracts its pre-relaxation amount from falling rain,
# but adds only the implicit/relaxed amount to vapour. This wrapper uses the
# actual signed humidity change for both sides of the internal water exchange.
struct ConservativeCondensation{T} <: SW.AbstractCondensation
    inner::T
end
ConservativeCondensation(sg::SW.SpectralGrid)=ConservativeCondensation(SW.ImplicitCondensation(sg))
SW.variables(c::ConservativeCondensation)=SW.variables(c.inner)
SW.initialize!(c::ConservativeCondensation,m::SW.PrimitiveEquation)=SW.initialize!(c.inner,m)
function SW.parameterization!(ij,v,c::ConservativeCondensation,m)
    conservative_condensation!(ij,v,c.inner,m.geometry,m.planet,m.atmosphere,m.time_stepping)
end
using SpeedyWeather: get_prognostic_step, get_tendency_step, pressure, pressure_thickness, saturation_humidity
function conservative_condensation!(
        ij,
        vars,
        condensation::SW.ImplicitCondensation,
        geometry::SW.Geometry,
        planet::SW.AbstractPlanet,
        atmosphere::SW.AbstractAtmosphere,
        time_stepping,
    )
    # use previous time step for more stable Euler forward step of the parameterizations
    temp = get_prognostic_step(vars.grid.temperature, time_stepping, condensation)                  # temperature [K]
    humid = get_prognostic_step(vars.grid.humidity, time_stepping, condensation)                    # specific humidity [kg/kg]
    temp_tend = get_tendency_step(vars.tendencies.grid.temperature, time_stepping, condensation)    # temperature tendency [K/s]
    humid_tend = get_tendency_step(vars.tendencies.grid.humidity, time_stepping, condensation)      # specific humidity tendency [kg/kg/s]
    nlayers = size(temp, 2)

    # precompute scaling constants to minimize divisions (used to convert between humidity [kg/kg] and precipitation [m])
    pₛ = vars.parameterizations.surface_pressure[ij]    # surface pressure [Pa]
    (; Δt) = time_stepping                              # time step [s]
    coord = geometry.vertical_coordinates
    ρ = atmosphere.water_density                        # air density [kg/m³]
    gρ = planet.gravity * ρ                             # [m/s² * kg/m³]

    # thermodynamics
    Lᵥ = atmosphere.latent_heat_condensation            # latent heat of vaporization
    Lᵢ = atmosphere.latent_heat_fusion                  # latent heat of fusion
    cₚ = atmosphere.heat_capacity                       # heat capacity
    Rᵥ = atmosphere.R_vapor                             # gas constant for water vapor
    Lᵥ_cₚ = Lᵥ / cₚ
    Lᵢ_cₚ = Lᵢ / cₚ
    cₚ_Lᵢ = cₚ / Lᵢ

    (; time_scale, relative_humidity_threshold, freezing_threshold, melting_threshold) = condensation
    let_it_snow = condensation.snow                     # flag to switch snow on/off
    rain_flux_down = zero(eltype(temp))                 # start with zero rain/snow flux at top of atmosphere
    snow_flux_down = zero(eltype(temp))                 # both have units of [m/s] (precipitation)

    for k in 1:nlayers

        # Condensation from humidity in this layer (for a negative humidity tendency)
        # relative to threshold that can be <100%, e.g. 95%
        pₖ = pressure(k, pₛ, coord)
        sat_humid_k = saturation_humidity(temp[ij, k], pₖ, atmosphere)
        δq_cond = sat_humid_k * relative_humidity_threshold - humid[ij, k]

        # skip if no condensation has occurred yet in this layer or above
        if δq_cond < 0 || snow_flux_down > 0 || rain_flux_down > 0

            # 0. convert between humidity tendency [kg/kg/s] and precipitation amount [m] or rate [m/s]
            Δp = pressure_thickness(k, pₛ, coord)           # pressure thickness of layer Δp times 1/g/ρ [m]
            Δp_gρ = Δp / gρ
            Δp_Δtgρ = Δp_gρ / Δt                            # pressure thickness of layer Δp times 1/Δt/g/ρ [m/s]
            Δtgρ_Δp = inv(Δp_Δtgρ)                          # [s/m]

            # 1. Melting of snow from layer above
            δT_melt = max(temp[ij, k] - melting_threshold, 0)   # only if temperature above melting threshold
            E_avail = cₚ_Lᵢ * δT_melt                       # available energy [1] in multiples of latent heat [J/kg of air] for melting
            melt_rate_max = E_avail * Δp_Δtgρ               # max rate of snow melt [m/s]
            melt_rate = min(snow_flux_down, melt_rate_max)  # cap to snow flux [m/s], don't melt more than available
            snow_flux_down -= melt_rate                     # move melted snow to rain
            rain_flux_down += melt_rate                     # this can evaporate now too
            δq_melt = melt_rate * Δtgρ_Δp                   # convert back to humidity increase over timestep [kg/kg]
            δT = -Lᵢ_cₚ * δq_melt / Δt                      # latent heat required for melting [K/s] (explicit in time)
            # don't use δq_melt as humidity tendency as it's only snow->rain

            # 2. Reevaporation and condensation
            dq = sat_humid_k - humid[ij, k]                 # reevaporation relative to 100% humidity
            r = condensation.reevaporation * max(dq, 0)     # reevaporation efficiency [1], scale linearly with dryness
            rain_evaporated = min(r, 1) * rain_flux_down    # [m/s], min(r, 1) to not evaporate more than available
            # Delay subtracting rain until the actual implicit vapour increment is known.
            δq_evap = rain_evaporated * Δtgρ_Δp             # convert to humidity tendency over timestep [kg/kg]
            δq = min(0, δq_cond) + δq_evap                  # [kg/kg] sum with condensation (negative) and evaporation (positive)
            # division by timestep for tendency below

            # Solve for melting of snow, condensation, reevaporation (and possibly sublimation) implicitly in time
            # implicit correction, Frierson et al. 2006 eq. (21)
            # derivative of qsat wrt to temp
            T = temp[ij, k] + Δt * δT                       # use temperature after melting [K] in gradient
            dqsat_dT = sat_humid_k * relative_humidity_threshold * Lᵥ / (Rᵥ * T^2)    # Clausius-Clapeyron [1/K]
            δq /= ((1 + Lᵥ_cₚ * dqsat_dT) * time_scale * Δt)
            δq = min(δq, rain_flux_down * Δtgρ_Δp / Δt) # positive vapour source cannot exceed available liquid
            rain_flux_down -= max(δq, 0) * Δp_gρ # use the SAME actual mass as the humidity tendency
            δT -= Lᵥ_cₚ * δq                                # add latent heat release to melting for enthalpy conservation

            # If there is large-scale condensation at a level higher (i.e. smaller k) than
            # the cloud-top previously diagnosed due to convection, then increase the cloud-top
            # Fortran SPEEDY documentation Page 7 (last sentence)
            vars.parameterizations.cloud_top[ij] = min(vars.parameterizations.cloud_top[ij], k)

            # 2. Precipitation (rain) due to large-scale condensation [kg/m²/s] /ρ for [m/s]
            δq_rain = min(0, δq)                # precipitation only for negative humidity tendency
            rain = Δp_gρ * -δq_rain             # precipitation rain [m/s] on this layer k, Formula 4
            snow = zero(rain)                   # start with zero snow but potentially swap below

            # decide whether to turn precip into snow (all rain freezes to snow)
            rain, snow = let_it_snow && temp[ij, k] < freezing_threshold ? (snow, rain) : (rain, snow)
            rain_flux_down += rain              # accumulate into downward fluxes [m/s] (used in layer below)
            snow_flux_down += snow              # accumulate into downward fluxes [m/s] (used in layer below)

            # latent heat release when freezing for enthalpy conservation
            δT -= (snow > 0) * Lᵢ_cₚ * δq_rain  # snow for negative δq (condensation then freezing)

            # only accumulate into humid_tend now to allow humid_tend != 0 before this scheme is called
            humid_tend[ij, k] += δq             # [kg/kg/s]
            temp_tend[ij, k] += δT              # [K/s]
        end
    end

    # avoid negative precipitation from rounding errors
    rain_flux_down = max(rain_flux_down, 0)
    snow_flux_down = max(snow_flux_down, 0)

    # precipitation from rain/snow [m] during time step whatever is fluxed out
    vars.parameterizations.rain_large_scale[ij] += Δt * rain_flux_down
    vars.parameterizations.snow_large_scale[ij] += Δt * snow_flux_down

    # and the rain/snow fall rate [m/s]
    vars.parameterizations.rain_rate_large_scale[ij] = rain_flux_down
    vars.parameterizations.snow_rate_large_scale[ij] = snow_flux_down

    # accumulate into total rain/snow rate including convection [m/s]
    vars.parameterizations.rain_rate[ij] += rain_flux_down
    vars.parameterizations.snow_rate[ij] += snow_flux_down

    return nothing
end
