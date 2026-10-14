# Land humidity-flux correction for SpeedyWeather 0.23.0.
# Copyright (c) 2020 Milan Kloewer; (c) 2021 The SpeedyWeather.jl Contributors;
# (c) 2022 Fred Kucharski and Franco Molteni for SPEEDY parametrization schemes.
# Modified 2026-10-13. EUPL-1.2: convection-LICENSE.txt.
# Derived from src/parameterizations/surface_fluxes/humidity.jl. Only the
# moisture deficit changes; storage, weighting, snow, drag and timing are native.

export DewAwareLandHumidityFlux

"""Preserve SPEEDY's positive evaporation and admit dew only above saturation
at the land surface temperature. Soil moisture availability limits evaporation;
it does not amplify dew or create condensation over an unsaturated surface.
No prognostic or diagnostic variables are added. Parameters remain in `inner`.
"""
struct DewAwareLandHumidityFlux{F} <: SW.AbstractSurfaceHumidityFlux
    inner::F
end
DewAwareLandHumidityFlux(sg::SW.SpectralGrid;kwargs...)=DewAwareLandHumidityFlux(SW.SurfaceLandHumidityFlux(sg;kwargs...))
SW.variables(f::DewAwareLandHumidityFlux)=SW.variables(f.inner)
SW.initialize!(f::DewAwareLandHumidityFlux,m::SW.PrimitiveWet)=SW.initialize!(f.inner,m)

function SW.surface_humidity_flux!(ij,vars,f::DewAwareLandHumidityFlux,model)
    inner=f.inner
    land_stepper=SW.time_stepper(model.time_stepping,:land)
    soil_temperature=SW.get_prognostic_step(vars.prognostic.land.soil_temperature,land_stepper,inner)
    T=soil_temperature[ij,1]
    snow=SW.get_prognostic_step(vars.prognostic.land.snow_depth,land_stepper,inner)[ij]
    alpha=vars.parameterizations.land.soil_moisture_availability[ij]
    ps=vars.parameterizations.surface_pressure[ij]
    qs=SW.saturation_humidity(T,ps,model.atmosphere)
    rho=vars.parameterizations.surface_air_density[ij]
    wind=vars.parameterizations.surface_wind_speed[ij]
    land_fraction=model.land_sea_mask.land_fraction[ij]
    surface=model.geometry.nlayers
    q=SW.get_prognostic_step(vars.grid.humidity,model.time_stepping,inner)[ij,surface]
    d=vars.parameterizations.boundary_layer_drag[ij]
    drag=inner.use_boundary_layer_drag ? d : inner.drag

    # Original SPEEDY eq. 55/57 positive branch is unchanged. For actual dew,
    # use the saturated surface deficit, independent of evaporation stress.
    deficit=q>qs ? qs-q : max(alpha*qs-q,zero(q))
    flux=ifelse(isfinite(T)&&isfinite(alpha),rho*drag*wind*deficit,zero(T))
    flux/=1+snow/inner.snow_insulation_depth
    vars.parameterizations.land.surface_humidity_flux[ij]=flux
    flux*=land_fraction
    vars.parameterizations.surface_humidity_flux[ij]+=flux
    dqdt=SW.get_tendency_step(vars.tendencies.grid.humidity,model.time_stepping,inner)
    dqdt[ij,surface]+=SW.surface_flux_to_tendency(flux,ps,model)
    return nothing
end
