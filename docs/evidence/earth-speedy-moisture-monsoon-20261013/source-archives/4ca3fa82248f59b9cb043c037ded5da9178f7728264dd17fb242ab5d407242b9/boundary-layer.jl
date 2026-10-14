# Experiment-local correction of the independent surface reference in Ri_a.
# Frierson et al. (2006), eqs. 12-16; https://doi.org/10.1175/JAS3753.1
# No changes to native air extrapolation, roughness, coefficients or flux accounting.
using SpeedyWeather

struct SurfaceAwareBoundaryLayer{B} <: SpeedyWeather.AbstractBoundaryLayer
    inner::B
end
SurfaceAwareBoundaryLayer(sg::SpeedyWeather.SpectralGrid)=SurfaceAwareBoundaryLayer(SpeedyWeather.BoundaryLayer(sg))
SpeedyWeather.variables(b::SurfaceAwareBoundaryLayer)=(SpeedyWeather.variables(b.inner)...,
    SpeedyWeather.ParameterizationVariable(:surface_bulk_richardson,SpeedyWeather.Grid2D();units="1",desc="Surface-referenced bulk Richardson number"),
    SpeedyWeather.ParameterizationVariable(:surface_virtual_temperature,SpeedyWeather.Grid2D();units="K",desc="Land/ocean area-weighted surface virtual temperature"))
SpeedyWeather.initialize!(b::SurfaceAwareBoundaryLayer,model::SpeedyWeather.AbstractModel)=SpeedyWeather.initialize!(b.inner,model)

"""Virtual surface temperature from the same surface reservoirs used by native fluxes.
Land effective humidity is alpha*qsat; ocean humidity is qsat. Ice/snow insulation
belongs to the native heat/moisture fluxes, not a second thermodynamic weighting.
There is no separate ice-skin temperature in this model, so none is invented here."""
@inline function surface_virtual_temperature(ij,vars,model)
    l=model.land_sea_mask.land_fraction[ij]
    ps=vars.parameterizations.surface_pressure[ij]
    a=model.atmosphere
    wet=a isa SpeedyWeather.AbstractWetAtmosphere
    value=zero(ps)
    if l<1
        c=model.surface_heat_flux.ocean
        T=SpeedyWeather.get_prognostic_step(vars.prognostic.ocean.sea_surface_temperature,SpeedyWeather.time_stepper(model.time_stepping,:ocean),c)[ij]
        q=wet ? SpeedyWeather.saturation_humidity(T,ps,a) : zero(T)
        value+=(1-l)*SpeedyWeather.virtual_temperature(T,q,a)
    end
    if l>0
        c=model.surface_heat_flux.land
        T=SpeedyWeather.get_prognostic_step(vars.prognostic.land.soil_temperature,SpeedyWeather.time_stepper(model.time_stepping,:land),c)[ij,1]
        q=wet ? vars.parameterizations.land.soil_moisture_availability[ij]*SpeedyWeather.saturation_humidity(T,ps,a) : zero(T)
        value+=l*SpeedyWeather.virtual_temperature(T,q,a)
    end
    return value
end

@inline function richardson_ratio(delta_phi,static_difference,reference,speed_squared)
    numerator=delta_phi*static_difference
    iszero(numerator)&&return zero(numerator)
    # Zero wind has the limiting signed infinite stability; do not add a tuned gust.
    iszero(speed_squared)&&return copysign(typeof(numerator)(Inf),numerator)
    return numerator/(reference*speed_squared)
end

"""Surface Ri_a (eq.15), independently referenced to actual surface state.
Default wind is the native lowest-level wind. Surface drag supplies its existing
gust/slowdown-adjusted speed explicitly; vertical diffusion retains native wind."""
@inline function surface_richardson(ij,vars,scheme,model;speed_squared=nothing,delta_geopotential=nothing)
    n=model.geometry.nlayers;a=model.atmosphere;ts=model.time_stepping
    T=SpeedyWeather.get_prognostic_step(vars.grid.temperature,ts,scheme)[ij,n]
    q=haskey(vars.grid,:humidity) ? SpeedyWeather.get_prognostic_step(vars.grid.humidity,ts,scheme)[ij,n] : zero(T)
    dphi=delta_geopotential===nothing ? max(vars.dynamics.geopotential[ij,n]-model.planet.gravity*model.orography.orography[ij],zero(T)) : delta_geopotential
    if speed_squared===nothing
        u=SpeedyWeather.get_prognostic_step(vars.grid.u,ts,scheme)[ij,n]
        v=SpeedyWeather.get_prognostic_step(vars.grid.v,ts,scheme)[ij,n]
        speed_squared=u*u+v*v
    end
    reference=a.heat_capacity*surface_virtual_temperature(ij,vars,model)
    air=a.heat_capacity*SpeedyWeather.virtual_temperature(T,q,a)+dphi
    return richardson_ratio(dphi,air-reference,reference,speed_squared)
end

"""Interior Ri(z) (eq.16) uses the lowest air layer as reference; z is AGL.
The bottom entry is Ri_a for the native coefficient algorithm's surface slot."""
@inline function boundary_layer_richardson(ij,k,vars,scheme,model)
    n=model.geometry.nlayers
    k==n&&return surface_richardson(ij,vars,scheme,model)
    a=model.atmosphere;ts=model.time_stepping
    T=SpeedyWeather.get_prognostic_step(vars.grid.temperature,ts,scheme)
    humid=haskey(vars.grid,:humidity) ? SpeedyWeather.get_prognostic_step(vars.grid.humidity,ts,scheme) : nothing
    qk=humid===nothing ? zero(T[ij,k]) : humid[ij,k]
    qn=humid===nothing ? zero(T[ij,n]) : humid[ij,n]
    phi0=model.planet.gravity*model.orography.orography[ij]
    phik=max(vars.dynamics.geopotential[ij,k]-phi0,zero(phi0))
    phin=max(vars.dynamics.geopotential[ij,n]-phi0,zero(phi0))
    reference=a.heat_capacity*SpeedyWeather.virtual_temperature(T[ij,n],qn,a)+phin
    local_static=a.heat_capacity*SpeedyWeather.virtual_temperature(T[ij,k],qk,a)+phik
    u=SpeedyWeather.get_prognostic_step(vars.grid.u,ts,scheme)[ij,k]
    v=SpeedyWeather.get_prognostic_step(vars.grid.v,ts,scheme)[ij,k]
    return richardson_ratio(phik,local_static-reference,reference,u*u+v*v)
end

@inline function SpeedyWeather.parameterization!(ij,vars,b::SurfaceAwareBoundaryLayer,model)
    inner=b.inner
    SpeedyWeather.parameterization!(ij,vars,inner.surface_condition,model)
    SpeedyWeather.parameterization!(ij,vars,inner.neutral_wind_speed,model)
    SpeedyWeather.parameterization!(ij,vars,inner.surface_roughness,model)
    d=inner.drag
    d isa SpeedyWeather.BulkRichardsonDrag||error("SurfaceAwareBoundaryLayer requires native BulkRichardsonDrag")
    g=model.planet.gravity;n=model.geometry.nlayers
    z=vars.dynamics.geopotential[ij,n]/g-model.orography.orography[ij]
    z0=vars.parameterizations.surface_roughness[ij]
    z=max(z,10z0)  # exactly the native drag roughness guard
    drag_max=(d.von_Karman/log(z/z0))^2
    ri=surface_richardson(ij,vars,d,model;speed_squared=vars.parameterizations.surface_wind_speed[ij]^2,delta_geopotential=g*z)
    vars.parameterizations.surface_bulk_richardson[ij]=ri
    vars.parameterizations.surface_virtual_temperature[ij]=surface_virtual_temperature(ij,vars,model)
    vars.parameterizations.boundary_layer_drag[ij]=max(d.drag_min,drag_max*(1-clamp(ri,0,d.critical_Richardson)/d.critical_Richardson)^2)
    return nothing
end
