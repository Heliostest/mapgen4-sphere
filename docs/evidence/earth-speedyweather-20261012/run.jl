using SpeedyWeather, Dates, JSON3, JLD2, Random, LinearAlgebra, SHA
include("diagnostics.jl")
include("checkpoint.jl")
using .ExperimentDiagnostics
const SW=SpeedyWeather
const OUT="build/earth-speedyweather"
const SMOKE=get(ENV,"SPEEDY_SMOKE","0")=="1"
const PREFIX=SMOKE ? "smoke" : "annual"
const BEGIN_TIME=DateTime(2001,1,1)
const STAT_START=SMOKE ? BEGIN_TIME : DateTime(2006,1,1)
const STAT_END=SMOKE ? BEGIN_TIME+Day(3) : DateTime(2007,1,1)
data(x,k=1)=SW.get_step(x,k).data
writejson(path,x)=open(io->JSON3.write(io,x),path,"w")
function surface_state(vars,model)
    pressure=exp.(data(vars.grid.pressure,2))
    humidity=data(vars.grid.humidity,2)
    water=column_water(humidity,pressure,model.geometry.σ_levels_thick,model.planet.gravity)
    soil=data(vars.prognostic.land.soil_moisture)
    soilwater=1000 .* (soil*model.land.geometry.layer_thickness) .* model.land.thermodynamics.field_capacity
    snow=1000 .* vec(data(vars.prognostic.land.snow_depth))
    return (;pressure,humidity,water,soilwater,snow,sst=vec(data(vars.prognostic.ocean.sea_surface_temperature)),sic=vec(data(vars.prognostic.ocean.sea_ice_concentration)))
end
precipitation(vars)=1000 .* (vars.parameterizations.rain_convection.data.+vars.parameterizations.rain_large_scale.data.+vars.parameterizations.snow_convection.data.+vars.parameterizations.snow_large_scale.data)
function ocean_flux(vars,model)
    p=vars.parameterizations;o=p.ocean
    return p.surface_shortwave_down.data.-o.surface_shortwave_up.data.+p.surface_longwave_down.data.-o.surface_longwave_up.data.-o.sensible_heat_flux.data.-model.atmosphere.latent_heat_condensation.*o.surface_humidity_flux.data
end
@kwdef mutable struct Observer <: SW.AbstractCallback
    previous_time::DateTime=BEGIN_TIME
    weights::Vector{Float64}=Float64[]
    land::Vector{Float64}=Float64[]
    previous_sst::Vector{Float64}=Float64[]
    previous_precip::Vector{Float64}=Float64[]
    previous_runoff::Vector{Float64}=Float64[]
    initial::Any=nothing
    statistics_initial::Any=nothing
    statistics_ledger::Any=nothing
    seconds::Vector{Float64}=zeros(12)
    layers::Dict{String,Array{Float64,3}}=Dict()
    surface::Dict{String,Matrix{Float64}}=Dict()
    precipitation::Matrix{Float64}=zeros(0,12)
    evaporation::Matrix{Float64}=zeros(0,12)
    audits::Vector{Any}=Any[]
    evaporation_total::Float64=0
    precipitation_total::Float64=0
    land_evaporation::Float64=0
    land_precipitation::Float64=0
    runoff_total::Float64=0
    ocean_input::Float64=0
    ocean_adjustment::Float64=0
    ocean_residual_max::Float64=0
    ocean_residual_total::Float64=0
    incoming_solar::Float64=0
    outgoing_shortwave::Float64=0
    outgoing_longwave::Float64=0
    last_audit_day::Int=-1
    last_month::Int=-1
    calls::Int=0
    started_wall::Float64=time()
end
ledger(o)=(;evaporationMm=o.evaporation_total,precipitationMm=o.precipitation_total,landEvaporationMm=o.land_evaporation,landPrecipitationMm=o.land_precipitation,runoffMm=o.runoff_total,oceanSurfaceInputJm2=o.ocean_input,oceanFreezingAdjustmentJm2=o.ocean_adjustment,oceanHeatResidualJm2=o.ocean_residual_total,incomingSolarJm2=o.incoming_solar,outgoingShortwaveJm2=o.outgoing_shortwave,outgoingLongwaveJm2=o.outgoing_longwave)
function budget(initial,final,terms)
    return (;initial,final,terms...,airMassRelative=(final.airMassKgM2-initial.airMassKgM2)/initial.airMassKgM2,airWaterResidualMm=final.airWaterMm-initial.airWaterMm-terms.evaporationMm+terms.precipitationMm,landWaterResidualMm=final.landWaterMm-initial.landWaterMm-terms.landPrecipitationMm+terms.landEvaporationMm+terms.runoffMm,toaNetJm2=terms.incomingSolarJm2-terms.outgoingShortwaveJm2-terms.outgoingLongwaveJm2)
end
function inventory(o,vars,model)
    s=surface_state(vars,model);w=o.weights;l=o.land
    q=s.humidity;T=data(vars.grid.temperature,2);u=data(vars.grid.u,2);v=data(vars.grid.v,2)
    all(isfinite,T)&&all(isfinite,u)&&all(isfinite,v)&&all(isfinite,q)||error("Non-finite atmospheric state")
    all(x->200<x<350,s.sst)&&all(x->0<=x<=1,s.sic)||error("Invalid ocean/ice state")
    air_mass=weighted_mean(s.pressure./model.planet.gravity,w)
    air_water=weighted_mean(s.water,w)
    land_water=weighted_mean(l.*(s.soilwater.+s.snow),w)
    ocean_heat=weighted_mean((1 .- l).*model.ocean.heat_capacity_mixed_layer.*s.sst,w)
    # Stock proxy only: not a complete moist total-energy conservation claim.
    sensible=weighted_mean((T*model.geometry.σ_levels_thick).*s.pressure./model.planet.gravity.*model.atmosphere.heat_capacity,w)
    return (;time=string(vars.prognostic.clock.time),airMassKgM2=air_mass,airWaterMm=air_water,landWaterMm=land_water,oceanSensibleHeatJm2=ocean_heat,airSensibleHeatProxyJm2=sensible,minHumidity=minimum(q),maxHumidity=maximum(q),minAirK=minimum(T),maxAirK=maximum(T),maxWindMps=maximum(hypot.(u,v)),iceAreaFraction=weighted_mean((1 .- l).*s.sic,w))
end
function SW.initialize!(o::Observer,vars,model)
    n=model.geometry.npoints;levels=model.geometry.nlayers
    solid=SW.RingGrids.get_solid_angles(model.spectral_grid.Grid,model.spectral_grid.nlat_half)
    o.weights=Float64[solid[j]/(4π) for j in model.geometry.whichring]
    abs(sum(o.weights)-1)<1e-12||error("Native quadrature is not normalized")
    o.land=Float64.(vec(model.land_sea_mask.land_fraction.data))
    o.previous_time=vars.prognostic.clock.time
    s=surface_state(vars,model)
    o.previous_sst=copy(s.sst);o.previous_precip=precipitation(vars);o.previous_runoff=1000 .* copy(vars.parameterizations.land.river_runoff.data)
    o.initial=inventory(o,vars,model)
    o.layers=Dict(k=>zeros(n,levels,12) for k in ("u","v","temperatureK","specificHumidity","pressureTimesNorthWind"))
    o.surface=Dict(k=>zeros(n,12) for k in ("pressurePa","sstK","seaIceConcentration","columnWaterKgM2","soilWaterKgM2","snowKgM2"))
    o.precipitation=zeros(n,12);o.evaporation=zeros(n,12)
    geometry=(;latDegrees=model.geometry.latds,lonDegrees=model.geometry.londs,weights=o.weights,landFraction=o.land,orographyM=vec(model.orography.orography.data),sigmaFull=model.geometry.σ_levels_full,sigmaHalf=model.geometry.σ_levels_half,radiusM=model.planet.radius,gravityMps2=model.planet.gravity,nlat=model.geometry.nlat,npoints=n,nlayers=levels,truncation=model.spectral_grid.truncation,stepS=model.time_stepping.Δt)
    writejson(joinpath(OUT,PREFIX*"-geometry.json"),geometry)
    checkpoint(joinpath(OUT,PREFIX*"-initial.jld2"),vars,model)
    writejson(joinpath(OUT,PREFIX*"-initial-inventory.json"),o.initial)
    if o.previous_time>=STAT_START
        o.statistics_initial=o.initial;o.statistics_ledger=ledger(o)
    end
    println(JSON3.write((;event="initialized",time=string(o.previous_time),geometry=geometry.npoints,layers=levels,stepS=geometry.stepS)))
end
function SW.callback!(o::Observer,vars,model)
    now=vars.prognostic.clock.time;dt=Dates.value(now-o.previous_time)/1000
    dt>0||error("Model callback clock did not advance")
    o.calls+=1;s=surface_state(vars,model);p=precipitation(vars);dp=p.-o.previous_precip
    minimum(dp)>-1e-8||error("Precipitation counter decreased")
    dp=max.(dp,0)
    E=vars.parameterizations.surface_humidity_flux.data
    El=vars.parameterizations.land.surface_humidity_flux.data
    runoff=1000 .* vars.parameterizations.land.river_runoff.data;dr=runoff.-o.previous_runoff
    o.evaporation_total+=dt*weighted_mean(E,o.weights);o.precipitation_total+=weighted_mean(dp,o.weights)
    o.land_evaporation+=dt*weighted_mean(o.land.*El,o.weights);o.land_precipitation+=weighted_mean(o.land.*dp,o.weights);o.runoff_total+=weighted_mean(o.land.*dr,o.weights)
    h=ocean_heat_ledger(o.previous_sst,s.sst,ocean_flux(vars,model),dt,model.ocean.heat_capacity_mixed_layer,model.sea_ice.freezing_temperature,o.weights,o.land)
    o.ocean_input+=h.surfaceInputJm2;o.ocean_adjustment+=h.freezingAdjustmentJm2;o.ocean_residual_max=max(o.ocean_residual_max,abs(h.residualJm2));o.ocean_residual_total+=h.residualJm2
    radiation=vars.parameterizations
    o.incoming_solar+=dt*model.planet.solar_constant*weighted_mean(radiation.cos_zenith.data,o.weights)
    o.outgoing_shortwave+=dt*weighted_mean(radiation.outgoing_shortwave.data,o.weights)
    o.outgoing_longwave+=dt*weighted_mean(radiation.outgoing_longwave.data,o.weights)
    if o.statistics_initial===nothing&&now>=STAT_START
        o.statistics_initial=inventory(o,vars,model)
        now==STAT_START||error("Statistics boundary not reached exactly")
        o.statistics_ledger=ledger(o)
        checkpoint(joinpath(OUT,PREFIX*"-statistics-start.jld2"),vars,model)
        writejson(joinpath(OUT,PREFIX*"-statistics-start-inventory.json"),o.statistics_initial)
    end
    # Period boundaries are exact multiples of the verified 1800-second step.
    # Attribute the completed interval to its start (midnight belongs to yesterday).
    if o.previous_time>=STAT_START&&o.previous_time<STAT_END
        mon=month(o.previous_time);slice=min(dt,Dates.value(STAT_END-o.previous_time)/1000)
        o.seconds[mon]+=slice
        fields=("u"=>data(vars.grid.u,2),"v"=>data(vars.grid.v,2),"temperatureK"=>data(vars.grid.temperature,2),"specificHumidity"=>s.humidity,"pressureTimesNorthWind"=>s.pressure.*data(vars.grid.v,2))
        for (key,a) in fields
            @views o.layers[key][:,:,mon].+=slice.*a
        end
        fields2=("pressurePa"=>s.pressure,"sstK"=>s.sst,"seaIceConcentration"=>s.sic,"columnWaterKgM2"=>s.water,"soilWaterKgM2"=>s.soilwater,"snowKgM2"=>s.snow)
        for (key,a) in fields2
            @views o.surface[key][:,mon].+=slice.*a
        end
        @views o.precipitation[:,mon].+=(slice/dt).*dp
        @views o.evaporation[:,mon].+=slice.*E
    end
    day=Dates.value(Date(now)-Date(BEGIN_TIME))
    if day!=o.last_audit_day
        stock=inventory(o,vars,model)
        waterResidual=stock.airWaterMm-o.initial.airWaterMm-o.evaporation_total+o.precipitation_total
        landResidual=stock.landWaterMm-o.initial.landWaterMm-o.land_precipitation+o.land_evaporation+o.runoff_total
        massRelative=(stock.airMassKgM2-o.initial.airMassKgM2)/o.initial.airMassKgM2
        push!(o.audits,(;stock...,airWaterResidualMm=waterResidual,landWaterResidualMm=landResidual,airMassRelative=massRelative,oceanHeatResidualJm2=o.ocean_residual_total))
        o.last_audit_day=day
    end
    ym=year(now)*12+month(now)
    if ym!=o.last_month
        o.last_month=ym;last=o.audits[end]
        writejson(joinpath(OUT,PREFIX*"-progress.json"),(;time=string(now),calls=o.calls,secondsWall=time()-o.started_wall,budget=last))
        println(JSON3.write((;time=string(now),calls=o.calls,secondsWall=round(time()-o.started_wall,digits=1),airWaterResidualMm=round(last.airWaterResidualMm,digits=5),airMassRelative=last.airMassRelative)))
    end
    o.previous_time=now;o.previous_sst.=s.sst;o.previous_precip.=p;o.previous_runoff.=runoff
    return nothing
end
function SW.finalize!(o::Observer,vars,model)
    final=inventory(o,vars,model)
    for mon in 1:12
        o.seconds[mon]>0||continue
        for a in values(o.layers);@views a[:,:,mon]./=o.seconds[mon];end
        for a in values(o.surface);@views a[:,mon]./=o.seconds[mon];end
    end
    monthly=Any[]
    for mon in 1:12
        o.seconds[mon]>0||continue
        layers=Dict(k=>vec(a[:,:,mon]) for (k,a) in o.layers)
        surface=Dict(k=>vec(a[:,mon]) for (k,a) in o.surface)
        push!(monthly,(;month=mon,seconds=o.seconds[mon],layers,surface,precipitationMm=vec(o.precipitation[:,mon]),evaporationMm=vec(o.evaporation[:,mon])))
    end
    full_budget=budget(o.initial,final,ledger(o))
    terms=ledger(o)
    annual_terms=NamedTuple{keys(terms)}(Tuple(getproperty(terms,k)-getproperty(o.statistics_ledger,k) for k in keys(terms)))
    statistics_budget=budget(o.statistics_initial,final,annual_terms)
    checkpoint(joinpath(OUT,PREFIX*"-final.jld2"),vars,model)
    result=(;stage=SMOKE ? "smoke-real-integration" : "five-calendar-year-spinup-one-year-evaluation",version=string(pkgversion(SpeedyWeather)),julia=string(VERSION),seed=20261012,start=string(BEGIN_TIME),statisticsStart=string(STAT_START),statisticsEnd=string(STAT_END),actualEnd=string(vars.prognostic.clock.time),stepS=model.time_stepping.Δt,nativeLayers=model.geometry.nlayers,calls=o.calls,secondsWall=time()-o.started_wall,layerLayout="point-contiguous-layer-major",monthly,budget=full_budget,statisticsBudget=statistics_budget,oceanHeatResidualMaxPerStepJm2=o.ocean_residual_max,audits=o.audits,statisticsInitial=o.statistics_initial,limitations=["Ocean water mass is not prognostic","Sea ice concentration has no finite ice thickness or mass","Surface pressure quadrature is a model air-mass proxy","Atmospheric heat proxy is not full moist total energy","Lower soil-layer clipping drains water without a separate native counter"])
    writejson(joinpath(OUT,PREFIX*"-statistics.json"),result)
    println(JSON3.write((;event="completed",stage=result.stage,calls=o.calls,secondsWall=result.secondsWall,budget=statistics_budget)))
end
Random.seed!(20261012);BLAS.set_num_threads(1);mkpath(OUT)
sourcefiles=[joinpath(@__DIR__,f) for f in ("run.jl","diagnostics.jl","checkpoint.jl","protocol.md","julia-env/Project.toml","julia-env/Manifest.toml")]
push!(sourcefiles,"scenes/earth-land-sea/earth-simulation.json")
writejson(joinpath(OUT,PREFIX*"-launch.json"),(;createdUTC=string(now(UTC)),files=Dict(f=>bytes2hex(sha256(read(f))) for f in sourcefiles),julia=string(VERSION),speedy=string(pkgversion(SpeedyWeather)),threads=Threads.nthreads(),blasThreads=BLAS.get_num_threads()))
sg=SpectralGrid(NF=Float64,truncation=32,nlayers=8)
observer=Observer()
model=PrimitiveWetModel(sg;time_stepping=Leapfrog(sg;Δt_at_T32=Minute(30)),callbacks=CallbackDict(:experiment=>observer))
simulation=initialize!(model;time=BEGIN_TIME)
run!(simulation;period=Millisecond(STAT_END-BEGIN_TIME),output=false)
