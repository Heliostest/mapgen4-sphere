using Dates, JSON3, LinearAlgebra, SHA, JLD2
include("../earth-speedy-moisture-monsoon-20261013/run.jl")
const DIAG_OUT="build/earth-speedy-transport"
const WEIGHTS=JSON3.read(read(joinpath(DIAG_OUT,"diagnostic-weights.json"),String))
const REGIONS=[String(r.name) for r in WEIGHTS.regions]
const RW=hcat([Float64.(r.weights) for r in WEIGHTS.regions]...)
const NR=length(REGIONS)
const PROCESS=Dict{String,Array{Float64,3}}()
const FIELDS=Dict{String,Array{Float64,3}}()
const SAMPLE_SECONDS=zeros(12)
const RESTORE_PATH="build/earth-speedy-moisture-monsoon/coupled-seasonal-statistics-start.jld2"
const LIMIT=get(ENV,"DIAG_DAYS","365")|>x->parse(Int,x)
const CURRENT_MONTH=Ref(1)
const CURRENT_DT=Ref(1800.)
const REGIONAL_SECONDS=zeros(12)
function collect_profile!(target,key,a,mon,dt)
    out=get!(target,key) do;zeros(NR,size(a,2),12);end
    @views out[:,:,mon].+=dt.*(RW'*a)
end
function convective_criteria!(v,m,mon,dt)
    c=m.convection;n=m.geometry.npoints;levels=m.geometry.nlayers
    T=SW.get_prognostic_step(v.grid.temperature,m.time_stepping,c)
    q=SW.get_prognostic_step(v.grid.humidity,m.time_stepping,c)
    tr=similar(T);qr=similar(q);values=zeros(n,8)
    for i in 1:n
        ps=v.parameterizations.surface_pressure[i]
        lzb=SW.pseudo_adiabat!(i,tr,qr,T,q,v.dynamics.geopotential,ps,m.geometry.σ_levels_full,m.atmosphere,c.relative_humidity,c.entrainment)
        pq=sum((q[i,k]-qr[i,k])*m.geometry.σ_levels_thick[k] for k in 1:levels)
        pt=sum((tr[i,k]-T[i,k])*m.geometry.σ_levels_thick[k] for k in 1:levels)
        values[i,:].=(pq,pt,pq>0&&pt>0,pq<=0&&pt>0,pt<=0,lzb,ps/m.planet.gravity*pq,pt*m.atmosphere.heat_capacity*ps/m.planet.gravity)
    end
    for (j,key) in enumerate(("convectionPq","convectionPT","deepFraction","shallowFraction","noBuoyancyFraction","zeroBuoyancyLevel","convectionFirstGuessWaterMm","convectionFirstGuessHeatJm2"))
        collect_profile!(FIELDS,key,view(values,:,j:j),mon,dt)
    end
end
function SW.parameterization_tendencies!(v::SW.Variables,m::SW.PrimitiveWetModel)
    SW.reset_variables!(v);SW.global_parameterizations!(v,m)
    mon=CURRENT_MONTH[];dt=CURRENT_DT[]
    ps=v.parameterizations.surface_pressure.data
    for (key,scheme) in pairs(SW.get_parameterizations(m))
        key==:convection&&convective_criteria!(v,m,mon,dt)
        q0=copy(SW.get_step(v.tendencies.grid.humidity).data)
        t0=copy(SW.get_step(v.tendencies.grid.temperature).data)
        SW.column_parameterization_cpu!(v,scheme,m)
        dq=SW.get_step(v.tendencies.grid.humidity).data.-q0
        dT=SW.get_step(v.tendencies.grid.temperature).data.-t0
        collect_profile!(PROCESS,string(key)*"HumidityKgKgS",dq,mon,dt)
        collect_profile!(PROCESS,string(key)*"WaterMmS",dq.*ps./m.planet.gravity.*m.geometry.σ_levels_thick',mon,dt)
        collect_profile!(PROCESS,string(key)*"TemperatureKS",dT,mon,dt)
    end
end
function run_diagnostics()
    BLAS.set_num_threads(1);mkpath(DIAG_OUT)
    sim=restore(RESTORE_PATH);v=sim.variables;m=sim.model
    start=v.prognostic.clock.time;stop=start+Day(LIMIT);@assert start==DateTime(2006,1,1)
    startSHA=bytes2hex(sha256(read(RESTORE_PATH)))
    oldrain=precipitation(v);rain=zeros(m.geometry.npoints,12)
    layers=Dict(k=>zeros(m.geometry.npoints,8,12) for k in ("temperatureK","specificHumidity","u","v"))
    initialRegionalWater=RW'*surface_state(v,m).water
    count=0;lastmonth=0;started=time()
    while v.prognostic.clock.time<stop
        prev=v.prognostic.clock.time;mon=month(prev);CURRENT_MONTH[]=mon;CURRENT_DT[]=m.time_stepping.Δt
        SW.time_step!(sim);now=v.prognostic.clock.time;dt=Dates.value(now-prev)/1000
        @assert dt==1800
        count+=1;SAMPLE_SECONDS[mon]+=dt
        s=surface_state(v,m);pr=precipitation(v);@views rain[:,mon].+=pr.-oldrain;oldrain.=pr
        for (key,x) in (("temperatureK",s.T),("specificHumidity",s.q),("u",data(v.grid.u,2)),("v",data(v.grid.v,2)))
            @views layers[key][:,:,mon].+=dt.*x
            collect_profile!(FIELDS,key,x,mon,dt)
        end
        collect_profile!(FIELDS,"sigmaVelocityPerS",v.dynamics.w.data./v.prognostic.scale[],mon,dt)
        for (key,x) in (("precipitationRateMmS",1000 .* (v.parameterizations.rain_rate.data.+v.parameterizations.snow_rate.data)),("evaporationMmS",v.parameterizations.surface_humidity_flux.data),("columnWaterMm",s.water),("landSoilWaterMm",s.soil))
            collect_profile!(FIELDS,key,reshape(x,:,1),mon,dt)
        end
        if now==DateTime(2006,7,1)
            checkpoint(joinpath(DIAG_OUT,"diagnostic-july-start.jld2"),v,m;mode="seasonal")
        end
        if month(now)!=lastmonth
            lastmonth=month(now)
            progress=(;time=string(now),count,wallSeconds=time()-started)
            writejson(joinpath(DIAG_OUT,"replay-progress.json"),progress);println(JSON3.write(progress));flush(stdout)
        end
    end
    original=JSON3.read(read("build/earth-speedy-moisture-monsoon/coupled-seasonal-statistics.json",String))
    comparisons=Any[]
    for mon in 1:12
        sec=SAMPLE_SECONDS[mon];sec>0||continue
        for dict in (PROCESS,FIELDS),a in values(dict);@views a[:,:,mon]./=sec;end
        if sec==original.monthly[mon].seconds
            rainError=maximum(abs.(rain[:,mon].-original.monthly[mon].precipitationMm))
            errors=Dict(key=>maximum(abs.(vec(a[:,:,mon]./sec).-original.monthly[mon].layers[key])) for (key,a) in layers)
            push!(comparisons,(;month=mon,rainErrorMm=rainError,layerErrors=errors))
            @assert rainError<1e-8
            @assert all(<(1e-9),values(errors))
        end
    end
    result=(;start=string(start),stop=string(v.prognostic.clock.time),count,stepS=m.time_stepping.Δt,checkpointSHA256=startSHA,regions=REGIONS,sigma=m.geometry.σ_levels_full,seconds=SAMPLE_SECONDS,
        process=Dict(k=>[vec(a[:,:,mon]) for mon in 1:12] for (k,a) in PROCESS),fields=Dict(k=>[vec(a[:,:,mon]) for mon in 1:12] for (k,a) in FIELDS),
        monthlyRainMm=[vec(RW'*rain[:,mon]) for mon in 1:12],initialRegionalWaterMm=initialRegionalWater,finalRegionalWaterMm=RW'*surface_state(v,m).water,
        comparisons,diagnosticReplayMatched=all(c->c.rainErrorMm<1e-8&&all(<(1e-9),values(c.layerErrors)),comparisons),wallSeconds=time()-started,
        notes=["Restart physical state only; new diagnostics integrated independently, no old Observer state resumed.","Physics snapshots follow native scheme order, same state and time levels; no diagnostic tendencies feed the solver.","sigma velocity is the scaled dynamics.w divided by prognostic.scale; interior interfaces, positive downward."])
    writejson(joinpath(DIAG_OUT,"replay-diagnostics.json"),result)
    println(JSON3.write((;completed=true,count,matched=result.diagnosticReplayMatched,comparisons,wallSeconds=result.wallSeconds)))
end
run_diagnostics()
