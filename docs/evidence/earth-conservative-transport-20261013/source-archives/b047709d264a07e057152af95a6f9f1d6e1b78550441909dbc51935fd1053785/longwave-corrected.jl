# SPDX-License-Identifier: EUPL-1.2
# Optional extension of SpeedyWeather.jl qRu16 OneBandLongwaveRadiativeTransfer.
# Native authors: Milan Kloewer (2020), SpeedyWeather.jl Contributors (2021).
# EUPL text: cloud-LICENSE-SpeedyWeather.txt. Added 2026-10-13.
# Only restores reflected downward LW at the gray surface; no coefficients change.
import SpeedyWeather

"""
    ReflectingLongwaveRadiativeTransfer(sg; kwargs...)

Use the native one-band solver and complete its gray-surface boundary:
U_surface = emissivity * sigma * T_surface^4 + (1-emissivity) * D_surface.
The atmosphere is non-scattering, so its downward solution is unchanged.
The additional upward reflected beam is absorbed using the same transmissivity.
Keywords and diagnostic variables are inherited from the native solver.
"""
struct ReflectingLongwaveRadiativeTransfer{C} <: SpeedyWeather.AbstractLongwaveRadiativeTransfer
    inner::C
end

ReflectingLongwaveRadiativeTransfer(sg::SpeedyWeather.SpectralGrid;kwargs...) =
    ReflectingLongwaveRadiativeTransfer(SpeedyWeather.OneBandLongwaveRadiativeTransfer(sg;kwargs...))
SpeedyWeather.initialize!(r::ReflectingLongwaveRadiativeTransfer,m::SpeedyWeather.AbstractModel) = SpeedyWeather.initialize!(r.inner,m)
SpeedyWeather.variables(r::ReflectingLongwaveRadiativeTransfer) = SpeedyWeather.variables(r.inner)

function SpeedyWeather.longwave_radiative_transfer!(ij,vars,t,r::ReflectingLongwaveRadiativeTransfer,model)
    SpeedyWeather.longwave_radiative_transfer!(ij,vars,t,r.inner,model)
    p=vars.parameterizations
    down=p.surface_longwave_down[ij]
    reflected_ocean=(1-r.inner.emissivity_ocean)*down
    reflected_land=(1-r.inner.emissivity_land)*down
    # Preserve every native value exactly for black surfaces or zero downwelling LW.
    iszero(reflected_ocean) && iszero(reflected_land) && return nothing

    land=model.land_sea_mask.land_fraction[ij]
    # Mix reflectivities before applying the common beam, preserving the exact
    # perfect-reflector limit even in a mixed land/ocean grid cell.
    reflectivity=(1-land)*(1-r.inner.emissivity_ocean)+land*(1-r.inner.emissivity_land)
    reflected=reflectivity*down
    p.ocean.surface_longwave_up[ij]+=reflected_ocean
    p.land.surface_longwave_up[ij]+=reflected_land
    p.surface_longwave_up[ij]+=reflected

    dTdt=SpeedyWeather.get_tendency_step(vars.tendencies.grid.temperature,model.time_stepping,r.inner)
    ps=p.surface_pressure[ij]
    cp=model.atmosphere.heat_capacity
    for k in size(dTdt,2):-1:1
        out=reflected*t[ij,k]
        dTdt[ij,k]+=SpeedyWeather.flux_to_tendency((reflected-out)/cp,ps,k,model)
        reflected=out
    end
    p.outgoing_longwave[ij]+=reflected
    return nothing
end
