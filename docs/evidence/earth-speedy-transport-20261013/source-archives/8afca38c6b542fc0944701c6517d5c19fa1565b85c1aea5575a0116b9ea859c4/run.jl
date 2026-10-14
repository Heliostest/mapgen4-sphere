using Dates, JSON3, LinearAlgebra, SHA, JLD2
include("transport-model.jl")
include("../earth-speedyweather-20261012/diagnostics.jl")
using .ExperimentDiagnostics
const OUT="build/earth-speedy-transport"
const MODE=get(ENV,"SPEEDY_MODE","slab")
const SMOKE=get(ENV,"SPEEDY_SMOKE","0")=="1"
const LABEL=get(ENV,"SPEEDY_CASE",MODE)*(SMOKE ? "-smoke" : "")
const SENSITIVITY=get(ENV,"SPEEDY_SENSITIVITY","0")=="1"
const INITIAL_REFERENCE=SENSITIVITY ? "build/earth-speedy-moisture-monsoon/coupled-seasonal-statistics-start.jld2" : INITIAL_PATH
const BEGIN_TIME=SENSITIVITY ? DateTime(2006,1,1) : DateTime(2001,1,1)
const STAT_START=SMOKE ? BEGIN_TIME : DateTime(2006,1,1)
const STAT_END=SMOKE ? BEGIN_TIME+Day(3) : DateTime(2007,1,1)
data(x,k=1)=SW.get_step(x,k).data
writejson(p,x)=open(io->JSON3.write(io,x),p,"w")
const PARTS=(:time_stepping,:implicit,:ocean,:sea_ice,:land,:solar_zenith,:albedo,:radiation,:horizontal_diffusion,:vertical_diffusion,:surface_momentum_flux,:surface_heat_flux,:surface_humidity_flux,:large_scale_condensation,:convection,:drag)
function checkpoint(path,v,m;mode=MODE)
    containers=Dict(string(k)=>SW.materialize_views(getproperty(v,k)) for k in (:prognostic,:grid,:tendencies,:dynamics,:parameterizations))
    components=Dict(string(k)=>getproperty(m,k) for k in PARTS)
    mass=mass_ledger(MASS_CONTEXTS[m])
    sst=haskey(SST_CONTEXTS,m) ? (;externalHeatJm2=SST_CONTEXTS[m].externalHeatJm2,updates=SST_CONTEXTS[m].updates,targetTime=SST_CONTEXTS[m].targetTime) : nothing
    JLD2.jldsave(path;containers,components,mass,sst,mode,version=string(pkgversion(SpeedyWeather)))
end
function restore(path)
    saved=JLD2.load(path);sg=SpectralGrid(NF=Float64,truncation=32,nlayers=8)
    m=transport_model(sg,saved["mode"]);sim=initialize!(m;time=BEGIN_TIME)
    for (k,c) in saved["components"];setproperty!(m,Symbol(k),c);end
    for (k,c) in saved["containers"];SW.copy_variables!(getproperty(sim.variables,Symbol(k)),c);end
    c=register_mass!(sim.variables,m;target=saved["mass"].targetDryKgM2)
    for k in keys(saved["mass"]);k==:targetDryKgM2||setproperty!(c,k,getproperty(saved["mass"],k));end
    if saved["sst"]!==nothing
        s=register_sst!(m);s.externalHeatJm2=saved["sst"].externalHeatJm2;s.updates=saved["sst"].updates;s.targetTime=saved["sst"].targetTime
    end
    m.output.active=false;return sim
end
function surface_state(v,m)
    ps=exp.(vec(data(v.grid.pressure,2)));q=data(v.grid.humidity,2);T=data(v.grid.temperature,2)
    water=(q*m.geometry.σ_levels_thick).*ps./m.planet.gravity
    soil=1000*m.land.thermodynamics.field_capacity.*(data(v.prognostic.land.soil_moisture)*m.land.geometry.layer_thickness)
    return (;ps,q,T,water,soil,snow=1000 .*vec(data(v.prognostic.land.snow_depth)),sst=vec(data(v.prognostic.ocean.sea_surface_temperature)),sic=vec(data(v.prognostic.ocean.sea_ice_concentration)))
end
function inventory(v,m,w,l)
    s=surface_state(v,m);u=data(v.grid.u,2);vv=data(v.grid.v,2)
    all(isfinite,s.T)&&all(isfinite,s.q)&&all(isfinite,u)&&all(isfinite,vv)||error("Non-finite atmosphere")
    all(x->250<x<330,s.sst)&&all(x->0<=x<=1,s.sic)||error("Invalid ocean or ice")
    a=air_stocks(v,m,w)
    return (;time=string(v.prognostic.clock.time),airMassKgM2=a.totalKgM2,dryAirMassKgM2=a.dryKgM2,airWaterMm=a.waterKgM2,landWaterMm=sum(w.*l.*(s.soil.+s.snow)),oceanSensibleHeatJm2=sum(w.*(1 .-l).*m.ocean.heat_capacity_mixed_layer.*s.sst),airSensibleHeatProxyJm2=sum(w.*s.ps.*(s.T*m.geometry.σ_levels_thick))/m.planet.gravity*m.atmosphere.heat_capacity,minAirK=minimum(s.T),maxAirK=maximum(s.T),minHumidity=minimum(s.q),maxHumidity=maximum(s.q),maxWindMps=maximum(hypot.(u,vv)),iceAreaFraction=sum(w.*(1 .-l).*s.sic))
end
precipitation(v)=1000 .* (v.parameterizations.rain_convection.data.+v.parameterizations.rain_large_scale.data.+v.parameterizations.snow_convection.data.+v.parameterizations.snow_large_scale.data)
function ocean_flux(v,m)
    p=v.parameterizations;o=p.ocean
    return p.surface_shortwave_down.data.-o.surface_shortwave_up.data.+p.surface_longwave_down.data.-o.surface_longwave_up.data.-o.sensible_heat_flux.data.-m.atmosphere.latent_heat_condensation.*o.surface_humidity_flux.data
end
const COUNTERS=(:river_runoff,:deep_drainage,:soil_clipping_source,:snow_cap_outflow,:snow_clipping_source)
const EXTRA_FIELDS=("convectivePrecipitationMmDay","largeScalePrecipitationMmDay","incomingSolarWm2","surfaceSolarDownWm2","surfaceLongwaveDownWm2","landEvaporationMmDay","oceanEvaporationMmDay","landSensibleHeatWm2","oceanSensibleHeatWm2","boundaryLayerIndex","surfaceBulkRichardson","surfaceVirtualTemperatureK","boundaryLayerDrag","verticalMixingActiveFraction","surfaceSolarNetWm2","surfaceLongwaveNetWm2")
@kwdef mutable struct Observer <: SW.AbstractCallback
    w::Vector{Float64}=Float64[]
    l::Vector{Float64}=Float64[]
    previous_time::DateTime=BEGIN_TIME
    previous_sst::Vector{Float64}=Float64[]
    previous_p::Vector{Float64}=Float64[]
    previous_counters::Dict{Symbol,Vector{Float64}}=Dict()
    initial::Any=nothing
    statistics_initial::Any=nothing
    statistics_ledger::Any=nothing
    totals::Dict{String,Float64}=Dict()
    seconds::Vector{Float64}=zeros(12)
    layers::Dict{String,Array{Float64,3}}=Dict()
    surface::Dict{String,Matrix{Float64}}=Dict()
    precip::Matrix{Float64}=zeros(0,12)
    evap::Matrix{Float64}=zeros(0,12)
    audits::Vector{Any}=Any[]
    last_day::Int=-1
    last_month::Int=-1
    calls::Int=0
    initialSHA::String=""
    maxOceanResidualStep::Float64=0
    startedWall::Float64=time()
end
function ledger(o,m)
    c=MASS_CONTEXTS[m]
    return merge(copy(o.totals),Dict("pressureModeWaterMm"=>c.waterCorrectionMm,"pressureModeSensibleJm2"=>c.sensibleCorrectionJm2,"pressureModeMassKgM2"=>c.totalMassCorrectionKgM2,"prescribedSstExternalHeatJm2"=>haskey(SST_CONTEXTS,m) ? SST_CONTEXTS[m].externalHeatJm2 : 0.0))
end
function budget(initial,final,terms)
    rawWater=final.airWaterMm-initial.airWaterMm-terms["evaporationMm"]+terms["precipitationMm"]
    rawLand=final.landWaterMm-initial.landWaterMm-terms["landPrecipitationMm"]+terms["landEvaporationMm"]+terms["river_runoff"]
    return (;initial,final,terms,airMassRelativeOriginal=final.airMassKgM2/initial.airMassKgM2-1,dryAirMassRelative=final.dryAirMassKgM2/initial.dryAirMassKgM2-1,airWaterRawResidualMm=rawWater,airWaterExcludingModeResidualMm=rawWater-terms["pressureModeWaterMm"],totalAirMassExchangeResidualMm=final.airMassKgM2-initial.airMassKgM2-terms["evaporationMm"]+terms["precipitationMm"]-terms["pressureModeWaterMm"],landRawResidualMm=rawLand,landLedgerResidualMm=rawLand+terms["deep_drainage"]+terms["snow_cap_outflow"]-terms["soil_clipping_source"],toaNetJm2=terms["incomingSolarJm2"]-terms["outgoingShortwaveJm2"]-terms["outgoingLongwaveJm2"])
end
function SW.initialize!(o::Observer,v,m)
    o.w=native_weights(m);o.l=copy(m.land_sea_mask.land_fraction.data)
    o.previous_time=v.prognostic.clock.time;s=surface_state(v,m)
    o.previous_sst=copy(s.sst);o.previous_p=precipitation(v)
    o.previous_counters=Dict(k=>1000 .*copy(getproperty(v.parameterizations.land,k).data) for k in COUNTERS)
    o.initial=inventory(v,m,o.w,o.l);o.initialSHA=stock_hash(v)
    reference=stock_hash((;prognostic=JLD2.load(INITIAL_REFERENCE)["containers"]["prognostic"]))
    o.initialSHA==reference||error("Atmospheric/land initial inventory changed")
    register_mass!(v,m);MODE=="seasonal"&&register_sst!(m)
    o.totals=Dict(k=>0.0 for k in ("evaporationMm","precipitationMm","landEvaporationMm","landPrecipitationMm","oceanSurfaceInputJm2","oceanFreezingAdjustmentJm2","oceanHeatResidualJm2","incomingSolarJm2","outgoingShortwaveJm2","outgoingLongwaveJm2",string.(COUNTERS)...))
    n=m.geometry.npoints;levels=m.geometry.nlayers
    o.layers=Dict(k=>zeros(n,levels,12) for k in ("u","v","temperatureK","specificHumidity","relativeHumidity","pressureTimesNorthWind"))
    o.surface=Dict(k=>zeros(n,12) for k in ("pressurePa","sstK","seaIceConcentration","columnWaterKgM2","soilWaterKgM2","snowKgM2","landSkinK","moistureFluxEastKgMs","moistureFluxNorthKgMs"))
    for key in EXTRA_FIELDS;o.surface[key]=zeros(n,12);end
    o.precip=zeros(n,12);o.evap=zeros(n,12)
    geometry=(;latDegrees=m.geometry.latds,lonDegrees=m.geometry.londs,weights=o.w,landFraction=o.l,orographyM=vec(m.orography.orography.data),sigmaFull=m.geometry.σ_levels_full,sigmaHalf=m.geometry.σ_levels_half,radiusM=m.planet.radius,gravityMps2=m.planet.gravity,npoints=n,nlayers=levels,truncation=m.spectral_grid.truncation,stepS=m.time_stepping.Δt)
    writejson(joinpath(OUT,LABEL*"-geometry.json"),geometry)
    checkpoint(joinpath(OUT,LABEL*"-initial.jld2"),v,m)
    writejson(joinpath(OUT,LABEL*"-initial-inventory.json"),(;stock=o.initial,initialAtmLandSHA=o.initialSHA,physicalFields=SENSITIVITY ? nothing : initial_field_comparison(v)))
    if o.previous_time==STAT_START;o.statistics_initial=o.initial;o.statistics_ledger=ledger(o,m);end
    println(JSON3.write((;event="initialized",mode=MODE,initialAtmLandSHA=o.initialSHA,time=string(o.previous_time))))
end
function SW.callback!(o::Observer,v,m)
    now=v.prognostic.clock.time;dt=Dates.value(now-o.previous_time)/1000;dt>0||error("No clock advance")
    haskey(SST_CONTEXTS,m)&&SST_CONTEXTS[m].targetTime!=now&&error("Prescribed SST time differs from actual clock")
    o.calls+=1;s=surface_state(v,m);p=precipitation(v);dp=p.-o.previous_p
    minimum(dp)>-1e-8||error("Precip counter decreased")
    E=v.parameterizations.surface_humidity_flux.data;El=v.parameterizations.land.surface_humidity_flux.data
    o.totals["evaporationMm"]+=dt*sum(o.w.*E);o.totals["precipitationMm"]+=sum(o.w.*dp)
    o.totals["landEvaporationMm"]+=dt*sum(o.w.*o.l.*El);o.totals["landPrecipitationMm"]+=sum(o.w.*o.l.*dp)
    for k in COUNTERS
        c=1000 .*getproperty(v.parameterizations.land,k).data
        o.totals[string(k)]+=sum(o.w.*o.l.*(c.-o.previous_counters[k]));o.previous_counters[k].=c
    end
    h=ocean_heat_ledger(o.previous_sst,s.sst,ocean_flux(v,m),dt,m.ocean.heat_capacity_mixed_layer,m.sea_ice.freezing_temperature,o.w,o.l)
    external=haskey(SST_CONTEXTS,m) ? SST_CONTEXTS[m].lastExternalHeatJm2 : 0.0
    residual=h.residualJm2-external
    o.totals["oceanSurfaceInputJm2"]+=h.surfaceInputJm2;o.totals["oceanFreezingAdjustmentJm2"]+=h.freezingAdjustmentJm2;o.totals["oceanHeatResidualJm2"]+=residual
    o.maxOceanResidualStep=max(o.maxOceanResidualStep,abs(residual))
    rad=v.parameterizations
    o.totals["incomingSolarJm2"]+=dt*m.planet.solar_constant*sum(o.w.*rad.cos_zenith.data)
    o.totals["outgoingShortwaveJm2"]+=dt*sum(o.w.*rad.outgoing_shortwave.data);o.totals["outgoingLongwaveJm2"]+=dt*sum(o.w.*rad.outgoing_longwave.data)
    if o.statistics_initial===nothing&&now>=STAT_START
        now==STAT_START||error("Statistics boundary missed")
        o.statistics_initial=inventory(v,m,o.w,o.l);o.statistics_ledger=ledger(o,m)
        checkpoint(joinpath(OUT,LABEL*"-statistics-start.jld2"),v,m)
    end
    if o.previous_time>=STAT_START&&o.previous_time<STAT_END
        mon=month(o.previous_time);o.seconds[mon]+=dt
        u=data(v.grid.u,2);vv=data(v.grid.v,2);σ=m.geometry.σ_levels_thick
        rh=similar(s.q)
        for k in 1:m.geometry.nlayers,i in 1:m.geometry.npoints
            rh[i,k]=s.q[i,k]/SW.saturation_humidity(s.T[i,k],s.ps[i]*m.geometry.σ_levels_full[k],m.atmosphere)
        end
        for (key,a) in ("u"=>u,"v"=>vv,"temperatureK"=>s.T,"specificHumidity"=>s.q,"relativeHumidity"=>rh,"pressureTimesNorthWind"=>s.ps.*vv)
            @views o.layers[key][:,:,mon].+=dt.*a
        end
        for (key,a) in ("pressurePa"=>s.ps,"sstK"=>s.sst,"seaIceConcentration"=>s.sic,"columnWaterKgM2"=>s.water,"soilWaterKgM2"=>s.soil,"snowKgM2"=>s.snow,"landSkinK"=>data(v.prognostic.land.soil_temperature)[:,1],"moistureFluxEastKgMs"=>s.ps./m.planet.gravity.*((s.q.*u)*σ),"moistureFluxNorthKgMs"=>s.ps./m.planet.gravity.*((s.q.*vv)*σ))
            @views o.surface[key][:,mon].+=dt.*a
        end
        @views o.precip[:,mon].+=dp;o.evap[:,mon].+=dt.*E
        params=v.parameterizations;factor=m.atmosphere.water_density*86400
        extras=("convectivePrecipitationMmDay"=>factor.*(params.rain_rate_convection.data.+params.snow_rate_convection.data),
            "largeScalePrecipitationMmDay"=>factor.*(params.rain_rate_large_scale.data.+params.snow_rate_large_scale.data),
            "incomingSolarWm2"=>m.planet.solar_constant.*params.cos_zenith.data,
            "surfaceSolarDownWm2"=>params.surface_shortwave_down.data,"surfaceLongwaveDownWm2"=>params.surface_longwave_down.data,
            "landEvaporationMmDay"=>86400 .*params.land.surface_humidity_flux.data,"oceanEvaporationMmDay"=>86400 .*params.ocean.surface_humidity_flux.data,
            "landSensibleHeatWm2"=>params.land.sensible_heat_flux.data,"oceanSensibleHeatWm2"=>params.ocean.sensible_heat_flux.data,
            "boundaryLayerIndex"=>params.boundary_layer_height.data,"surfaceBulkRichardson"=>params.surface_bulk_richardson.data,
            "surfaceVirtualTemperatureK"=>params.surface_virtual_temperature.data,"boundaryLayerDrag"=>params.boundary_layer_drag.data,
            "verticalMixingActiveFraction"=>params.vertical_mixing_active.data,
            "surfaceSolarNetWm2"=>params.surface_shortwave_down.data.-params.surface_shortwave_up.data,
            "surfaceLongwaveNetWm2"=>params.surface_longwave_down.data.-params.surface_longwave_up.data)
        for (key,a) in extras;@views o.surface[key][:,mon].+=dt.*a;end
    end
    day=Dates.value(Date(now)-Date(BEGIN_TIME))
    if day!=o.last_day
        stock=inventory(v,m,o.w,o.l);b=budget(o.initial,stock,ledger(o,m))
        push!(o.audits,(;stock,evaporationMm=o.totals["evaporationMm"],precipitationMm=o.totals["precipitationMm"],airMassRelativeOriginal=b.airMassRelativeOriginal,dryAirMassRelative=b.dryAirMassRelative,airWaterRawResidualMm=b.airWaterRawResidualMm,airWaterExcludingModeResidualMm=b.airWaterExcludingModeResidualMm,landRawResidualMm=b.landRawResidualMm,landLedgerResidualMm=b.landLedgerResidualMm,massMode=mass_ledger(MASS_CONTEXTS[m]),oceanHeatResidualJm2=o.totals["oceanHeatResidualJm2"]))
        o.last_day=day
    end
    ym=year(now)*12+month(now)
    if ym!=o.last_month
        o.last_month=ym;a=o.audits[end]
        progress=(;mode=MODE,time=string(now),calls=o.calls,secondsWall=time()-o.startedWall,dryAirMassRelative=a.dryAirMassRelative,waterResidualMm=a.airWaterExcludingModeResidualMm,landResidualMm=a.landLedgerResidualMm,rawLandResidualMm=a.landRawResidualMm)
        writejson(joinpath(OUT,LABEL*"-progress.json"),progress);println(JSON3.write(progress))
    end
    if now==STAT_END;checkpoint(joinpath(OUT,LABEL*"-final.jld2"),v,m);end
    o.previous_time=now;o.previous_sst.=s.sst;o.previous_p.=p
end
function SW.finalize!(o::Observer,v,m)
    final=inventory(v,m,o.w,o.l);full=budget(o.initial,final,ledger(o,m));cur=ledger(o,m)
    terms=Dict(k=>cur[k]-o.statistics_ledger[k] for k in keys(cur));stat=budget(o.statistics_initial,final,terms)
    monthly=Any[]
    for mon in 1:12
        sec=o.seconds[mon];sec>0||continue
        push!(monthly,(;month=mon,seconds=sec,layers=Dict(k=>vec(a[:,:,mon]./sec) for (k,a) in o.layers),surface=Dict(k=>vec(a[:,mon]./sec) for (k,a) in o.surface),precipitationMm=vec(o.precip[:,mon]),evaporationMm=vec(o.evap[:,mon])))
    end
    result=(;mode=MODE,stage=SMOKE ? "smoke" : SENSITIVITY ? "same-2006-state-one-year-sensitivity" : "five-year-spinup-one-statistics-year",physicsFix=PHYSICS_FIX,start=string(BEGIN_TIME),statisticsStart=string(STAT_START),statisticsEnd=string(STAT_END),actualEnd=string(v.prognostic.clock.time),version=string(pkgversion(SpeedyWeather)),julia=string(VERSION),stepS=m.time_stepping.Δt,calls=o.calls,secondsWall=time()-o.startedWall,initialAtmLandSHA=o.initialSHA,budget=full,statisticsBudget=stat,massMode=mass_ledger(MASS_CONTEXTS[m]),maxOceanHeatResidualStepJm2=o.maxOceanResidualStep,monthly,audits=o.audits,limitations=["Explicit diagnostic global pressure mode dry-air mass constraint, not a rewritten conservative dynamics core","Numerical pressure mode water/sensible effects are budgeted separately","Snow negative candidate adjustment cancels unrealized melt and is not a physical water source","Prescribed SST forcing is external energy exchange, not ocean prediction","Native sea ice has no finite thickness/mass/latent inventory"])
    writejson(joinpath(OUT,LABEL*"-statistics.json"),result)
    println(JSON3.write((;event="completed",mode=MODE,calls=o.calls,secondsWall=result.secondsWall,statisticsBudget=stat)))
end
if abspath(PROGRAM_FILE)==abspath(@__FILE__)
BLAS.set_num_threads(1);mkpath(OUT)
sg=SpectralGrid(NF=Float64,truncation=32,nlayers=8);observer=Observer()
model=transport_model(sg,MODE;callbacks=CallbackDict(:experiment=>observer))
simulation=initialize!(model;time=BEGIN_TIME)
if SENSITIVITY
    saved=JLD2.load(INITIAL_REFERENCE)
    for (key,c) in saved["components"]
        key in ("convection","radiation")&&continue
        setproperty!(model,Symbol(key),c)
    end
    for (key,c) in saved["containers"];SW.copy_variables!(getproperty(simulation.variables,Symbol(key)),c);end
    model.output.active=false
    SW.initialize!(observer,simulation.variables,model)
    while simulation.variables.prognostic.clock.time<STAT_END
        SW.time_step!(simulation)
    end
    SW.finalize!(observer,simulation.variables,model)
else
    apply_frozen_initial!(simulation)
    run!(simulation;period=Millisecond(STAT_END-BEGIN_TIME),output=false)
end
end
