# SPDX-License-Identifier: EUPL-1.2
# Derived from SpeedyWeather.jl src/parameterizations/radiation/clouds.jl, qRu16.
# Copyright (c) 2020 Milan Kloewer; (c) 2021 SpeedyWeather.jl Contributors;
# (c) 2022 Fred Kucharski and Franco Molteni for SPEEDY parametrization schemes.
# Modifications (2026-10-13): correct precipitation units and the dimensionless,
# upward dry-static-energy gradient. See cloud-report.md and cloud-LICENSE-SpeedyWeather.txt.
import SpeedyWeather

"""
    CorrectedDiagnosticClouds(sg; mode=:full, kwargs...)

Drop-in clouds component for OneBandShortwave. `:precip_only` corrects m/s to
mm/day; `:full` also restores SPEEDY's d(cp*T+Phi)/dPhi stability diagnostic.
All coefficients and state declarations are inherited from DiagnosticClouds.
No native package methods for native types are overwritten.
"""
struct CorrectedDiagnosticClouds{C, Mode} <: SpeedyWeather.AbstractShortwaveClouds
    inner::C
end

function CorrectedDiagnosticClouds(sg::SpeedyWeather.SpectralGrid; mode=:full, kwargs...)
    mode in (:precip_only, :full) || throw(ArgumentError("cloud mode must be :precip_only or :full"))
    inner=SpeedyWeather.DiagnosticClouds(sg;kwargs...)
    return CorrectedDiagnosticClouds{typeof(inner),mode}(inner)
end

SpeedyWeather.initialize!(c::CorrectedDiagnosticClouds, m::SpeedyWeather.AbstractModel) = SpeedyWeather.initialize!(c.inner,m)
SpeedyWeather.variables(c::CorrectedDiagnosticClouds) = SpeedyWeather.variables(c.inner)

function SpeedyWeather.clouds!(ij,vars,scheme::CorrectedDiagnosticClouds{C,Mode},model) where {C,Mode}
    clouds=scheme.inner
    temp=SpeedyWeather.get_prognostic_step(vars.grid.temperature,model.time_stepping,clouds)
    humid=SpeedyWeather.get_prognostic_step(vars.grid.humidity,model.time_stepping,clouds)
    geopotential=vars.dynamics.geopotential
    NF=eltype(temp)
    nlayers=size(temp,2)
    ps=vars.parameterizations.surface_pressure[ij]
    vertical_coordinates=model.geometry.vertical_coordinates
    land_fraction=model.land_sea_mask.land_fraction[ij]
    cp=model.atmosphere.heat_capacity

    # rain_rate is a liquid-water depth rate [m/s]. 86400 s/day * 1000 mm/m.
    # Both modes make only this change to the precipitation contribution.
    rain_rate=vars.parameterizations.rain_rate[ij]
    precip_term=min(clouds.precipitation_max,86400*rain_rate*1000)
    P=clouds.precipitation_weight*sqrt(precip_term)

    cloud_top_precipitation=vars.parameterizations.cloud_top[ij]
    rh_excess_max::NF=0
    cloud_top_humidity=nlayers+1
    for k in (nlayers-1):-1:2
        humidity_k=humid[ij,k]
        pk=SpeedyWeather.pressure(k,ps,vertical_coordinates)
        qsat=SpeedyWeather.saturation_humidity(temp[ij,k],pk,model.atmosphere)
        if humidity_k>clouds.specific_humidity_threshold_min && qsat>0
            rh_excess=humidity_k/qsat-clouds.relative_humidity_threshold_min
            if rh_excess>rh_excess_max
                rh_excess_max=rh_excess
                cloud_top_humidity=k
            end
        end
    end
    humidity_term=min(1,rh_excess_max/(clouds.relative_humidity_threshold_max-clouds.relative_humidity_threshold_min))^2
    cloud_cover=min(1,P+humidity_term)
    cloud_top=min(cloud_top_humidity,cloud_top_precipitation)
    vars.parameterizations.cloud_top[ij]=cloud_top
    vars.parameterizations.cloud_cover[ij]=cloud_cover
    k_top=min(unsafe_trunc(Int,cloud_top),nlayers)
    vars.parameterizations.cloud_top_height[ij]=ifelse(cloud_top<=nlayers,geopotential[ij,k_top]/model.planet.gravity,zero(NF))

    stratocumulus_cover::NF=0
    if clouds.use_stratocumulus
        surface=nlayers
        above=max(1,nlayers-1)
        if Mode===:full
            # SPEEDY physics.f90: G=(se_above-se_bottom)/(Phi_above-Phi_bottom).
            # G and its .25/.4 thresholds are dimensionless. One layer has no gradient.
            G=nlayers>1 ? ((cp*temp[ij,above]+geopotential[ij,above])-
                (cp*temp[ij,surface]+geopotential[ij,surface]))/
                (geopotential[ij,above]-geopotential[ij,surface]) : zero(NF)
        else
            # Native formula retained only for the precipitation-isolation experiment.
            G=(cp*temp[ij,surface]+geopotential[ij,surface])-
                (cp*temp[ij,above]+geopotential[ij,above])
        end
        static_stability=clamp((G-clouds.stratocumulus_stability_min)/
            (clouds.stratocumulus_stability_max-clouds.stratocumulus_stability_min),0,1)
        ocean=static_stability*max(clouds.stratocumulus_cover_max-clouds.stratocumulus_cloud_factor*cloud_cover,0)
        pN=SpeedyWeather.pressure(surface,ps,vertical_coordinates)
        qsat_surface=SpeedyWeather.saturation_humidity(temp[ij,surface],pN,model.atmosphere)
        rh_surface=humid[ij,surface]/qsat_surface
        land=ocean*rh_surface
        stratocumulus_cover=(1-land_fraction)*ocean+land_fraction*land
    end
    return (;cloud_cover,cloud_albedo=clouds.cloud_albedo,cloud_top,
        stratocumulus_cover,stratocumulus_albedo=clouds.stratocumulus_albedo)
end
