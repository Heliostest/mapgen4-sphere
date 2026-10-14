# Read-only instrumentation of the frozen repaired experiment.
# Native step sequence follows SpeedyWeather.jl (EUPL-1.2), modified 2026-10-13.
# Copyright (c) 2020 Milan Kloewer; (c) 2021 The SpeedyWeather.jl Contributors;
# (c) 2022 Fred Kucharski and Franco Molteni. See ../earth-speedy-moisture-monsoon-20261013/LICENSE-SpeedyWeather.txt.
using Dates, JSON3, LinearAlgebra
include("../earth-speedy-moisture-monsoon-20261013/physics-model.jl")
BLAS.set_num_threads(1)
const STARTUP_RECORDS = Any[]
const STARTUP_CONTEXT = Ref{Any}(nothing)

function startup_grids(v,m,step)
    q=similar(SW.get_step(v.grid.humidity,1));p=similar(SW.get_step(v.grid.pressure,1))
    SW.transform!(q,SW.get_step(v.prognostic.humidity,step),m.spectral_transform)
    SW.transform!(p,SW.get_step(v.prognostic.pressure,step),m.spectral_transform)
    return (;q=copy(q.data),lp=vec(copy(p.data)))
end
startup_water(x,c)=sum(c.weights.*exp.(x.lp).*(x.q*c.thick))/c.gravity
function startup_rates(v,m)
    q=similar(SW.get_step(v.grid.humidity,1));p=similar(SW.get_step(v.grid.pressure,1))
    SW.transform!(q,SW.get_step(v.tendencies.humidity),m.spectral_transform)
    SW.transform!(p,SW.get_step(v.tendencies.pressure),m.spectral_transform)
    scale=v.prognostic.scale[]
    return (;q=copy(q.data)./scale,lp=vec(copy(p.data))./scale)
end
function startup_project_physics(v,m)
    qs=similar(SW.get_step(v.prognostic.humidity,1));q=similar(SW.get_step(v.grid.humidity,1))
    SW.transform!(qs,SW.get_step(v.tendencies.grid.humidity),m.spectral_transform)
    SW.transform!(q,qs,m.spectral_transform)
    return copy(q.data)
end
startup_linear_rate(x,r,c)=sum(c.weights.*exp.(x.lp).*((r.q+x.q.*r.lp)*c.thick))/c.gravity

function startup_ledger_step!(c,rates,dt,lf,w1,w2;pre=Dict{Symbol,Float64}(),postold=Dict{Symbol,Float64}(),postnew=Dict{Symbol,Float64}())
    for (key,pair) in c.ledger
        old,current=pair
        new=old+dt*get(rates,key,0.0)+get(pre,key,0.0)
        ref=lf==1 ? old : current
        update=old-2ref+new
        c.ledger[key]=(ref+w1*update+get(postold,key,0.0),new-w2*update+get(postnew,key,0.0))
    end
end

function SW.time_step!(v::SW.Variables,ts::SW.Leapfrog,m::SW.PrimitiveWetModel)
    c=STARTUP_CONTEXT[]
    c===nothing&&error("startup trace context missing")
    old=startup_grids(v,m,1);current=startup_grids(v,m,2)
    oldW=startup_water(old,c);currentW=startup_water(current,c)
    physicalBefore=air_stocks(v,m,c.weights).waterKgM2
    SW.reinitialize!(m,v);SW.reset_tendencies!(v,ts)
    SW.greenhouse_gases_time_step!(v,m)
    SW.parameterization_tendencies!(v,m)
    qphysics=copy(SW.get_step(v.tendencies.grid.humidity).data)
    physicsProject=startup_project_physics(v,m)
    evap=sum(c.weights.*v.parameterizations.surface_humidity_flux.data)
    precip=1000sum(c.weights.*(v.parameterizations.rain_rate.data.+v.parameterizations.snow_rate.data))
    net=evap-precip
    physicsNative=sum(c.weights.*v.parameterizations.surface_pressure.data.*(qphysics*c.thick))/c.gravity
    physicsOld=sum(c.weights.*exp.(old.lp).*(physicsProject*c.thick))/c.gravity
    SW.ocean_timestep!(v,m);SW.sea_ice_timestep!(v,m);SW.land_timestep!(v,m)
    SW.dynamics_tendencies!(v,m)
    dyn=startup_rates(v,m)
    SW.diffusion_and_implicit!(v,m)
    full=startup_rates(v,m)
    dt=SW.time_step(ts,v.prognostic.clock);lf=SW.prognostic_step(ts,v.prognostic.clock)
    w1=(lf-1)*ts.robert_filter*ts.williams_filter/2
    w2=(lf-1)*ts.robert_filter*(1-ts.williams_filter)/2
    candidate=(;q=old.q+dt*full.q,lp=old.lp+dt*full.lp)
    predictedW=startup_water(candidate,c)
    fullLinear=startup_linear_rate(old,full,c)
    dynLinear=startup_linear_rate(old,dyn,c)
    dynamicCurrent=startup_linear_rate(current,(;q=dyn.q-physicsProject,lp=dyn.lp),c)
    nonlinear=predictedW-oldW-dt*fullLinear
    SW.update_prognostic!(v,m)
    afterOld=startup_grids(v,m,1);afterNew=startup_grids(v,m,2)
    afterOldW=startup_water(afterOld,c);afterNewW=startup_water(afterNew,c)
    refW=lf==1 ? oldW : currentW
    scalarUpdate=oldW-2refW+predictedW
    rawOld=afterOldW-(refW+w1*scalarUpdate)
    rawNew=afterNewW-(predictedW-w2*scalarUpdate)
    SW.transform!(v,m)
    massOld=startup_water(startup_grids(v,m,1),c)-afterOldW
    massNew=startup_water(startup_grids(v,m,2),c)-afterNewW
    physicalAfter=air_stocks(v,m,c.weights).waterKgM2
    clipping=physicalAfter-afterNewW-massNew
    SW.particle_advection!(v,m)
    rates=Dict(:external=>net,:physics_projection_and_mass_reference=>physicsOld-net,
        :dynamics=>dynLinear-physicsOld,:diffusion_implicit=>fullLinear-dynLinear)
    startup_ledger_step!(c,rates,dt,lf,w1,w2;
        pre=Dict(:finite_pressure_product=>nonlinear),postold=Dict(:raw_nonlinearity=>rawOld,:mass_constraint=>massOld),
        postnew=Dict(:raw_nonlinearity=>rawNew,:mass_constraint=>massNew))
    stateLedger=Dict(string(key)=>pair[2] for (key,pair) in c.ledger)
    ledgerWater=c.initialPhysical+sum(values(stateLedger))+clipping
    push!(STARTUP_RECORDS,(;counter=v.prognostic.clock.step_counter,time=string(v.prognostic.clock.time),
        updateDt=dt,physicalBefore,physicalAfter,oldRawWater=oldW,currentRawWater=currentW,predictedW,afterOldW,afterNewW,
        physicsNative,net,evap,precip,physicsBudgetResidual=physicsNative-net,dynamicCurrentRate=dynamicCurrent,
        rates,nonlinear,rawOld,rawNew,massOld,massNew,clipping,stateLedger,closure=physicalAfter-ledgerWater))
    return nothing
end

function main()
    mode=get(ENV,"STARTUP_MODE","slab")
    sg=SpectralGrid(NF=Float64,truncation=32,nlayers=8)
    m=repaired_model(sg,mode)
    sim=apply_frozen_initial!(initialize!(m;time=DateTime(2001,1,1)))
    SW.initialize!(sim;period=Day(3),output=false)
    v=sim.variables;weights=native_weights(m);initial=air_stocks(v,m,weights)
    mass=register_mass!(v,m);mode=="seasonal"&&register_sst!(m)
    ledger=Dict{Symbol,Tuple{Float64,Float64}}(k=>(0.,0.) for k in
        (:external,:physics_projection_and_mass_reference,:dynamics,:diffusion_implicit,
         :finite_pressure_product,:raw_nonlinearity,:mass_constraint,:initial_spectral_grid_difference))
    c=(;weights,thick=m.geometry.σ_levels_thick,gravity=m.planet.gravity,initialPhysical=initial.waterKgM2,ledger)
    ledger[:initial_spectral_grid_difference]=(startup_water(startup_grids(v,m,1),c)-initial.waterKgM2,
        startup_water(startup_grids(v,m,2),c)-initial.waterKgM2)
    STARTUP_CONTEXT[]=c
    steps=parse(Int,get(ENV,"STARTUP_STEPS","13"))
    rectangular=0.;oldtime=v.prognostic.clock.time;rows=Any[]
    for i in 1:steps
        SW.time_step!(sim)
        r=STARTUP_RECORDS[end];elapsed=Dates.value(v.prognostic.clock.time-oldtime)/1000;oldtime=v.prognostic.clock.time
        rectangular+=elapsed*r.net
        fluxStagger=r.stateLedger["external"]-rectangular
        residual=r.physicalAfter-initial.waterKgM2-rectangular
        row=(;step=i,afterTime=string(oldtime),elapsed,rectangularNet=rectangular,naiveResidual=residual,
            staggeredExternalDifference=fluxStagger,discreteFluxResidual=r.physicalAfter-initial.waterKgM2-r.stateLedger["external"],r...)
        push!(rows,row)
        println(JSON3.write((;step=i,afterTime=string(oldtime),residual,fluxStagger,clipping=r.clipping,closure=r.closure,stateLedger=r.stateLedger)))
    end
    mkpath("build/earth-speedy-transport")
    open(io->JSON3.write(io,(;mode,initial,rows)),"build/earth-speedy-transport/startup-trace-"*mode*".json","w")
end
main()
