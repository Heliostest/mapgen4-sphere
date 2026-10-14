# Experiment-only instrumentation adapted from the frozen audit-coupled.jl.
# No dynamics or time-step override. Each physical process is called once in native order.
using Dates, JSON3, LinearAlgebra
include("transport-v2-model.jl")
include("startup-ledger.jl")
using .StartupFluxBudgets
BLAS.set_num_threads(1)
const STEP_AUDITS=Any[]
precip_total(v)=1000 .* (v.parameterizations.rain_convection.data.+v.parameterizations.rain_large_scale.data.+v.parameterizations.snow_convection.data.+v.parameterizations.snow_large_scale.data)
function SW.parameterization_tendencies!(v::SW.Variables,m::SW.PrimitiveWetModel)
    SW.reset_variables!(v);SW.global_parameterizations!(v,m)
    w=native_weights(m);p=v.parameterizations.surface_pressure.data
    mass=w.*p./m.planet.gravity;thick=m.geometry.σ_levels_thick
    stages=Any[]
    for (key,scheme) in pairs(SW.get_parameterizations(m))
        q0=copy(SW.get_step(v.tendencies.grid.humidity).data)
        p0=precip_total(v);e0=copy(v.parameterizations.surface_humidity_flux.data)
        SW.column_parameterization_cpu!(v,scheme,m)
        dq=SW.get_step(v.tendencies.grid.humidity).data.-q0
        water=sum(mass.*(dq*thick))
        rain=sum(w.*(precip_total(v).-p0))/m.time_stepping.Δt
        evap=sum(w.*(v.parameterizations.surface_humidity_flux.data.-e0))
        push!(stages,(;scheme=string(key),waterKgM2S=water,rainKgM2S=rain,evapKgM2S=evap,residualKgM2S=water+rain-evap))
    end
    push!(STEP_AUDITS,stages)
    return nothing
end
results=[]
for mode in ("slab","seasonal")
    sg=SpectralGrid(NF=Float64,truncation=32,nlayers=8)
    m=transport_model(sg,mode)
    sim=apply_frozen_initial!(initialize!(m;time=DateTime(2001,1,1)))
    SW.initialize!(sim;period=Day(3),output=false)
    v=sim.variables;initialSHA=stock_hash(v);w=native_weights(m)
    initial=air_stocks(v,m,w);c=register_mass!(v,m);mode=="seasonal"&&register_sst!(m)
    E=0.;P=0.;rateP=0.;oldP=precip_total(v);oldtime=v.prognostic.clock.time
    totals=Dict{String,Float64}();steps=Any[];flux=LeapfrogFluxLedger()
    for i in 1:v.prognostic.clock.n_steps
        counter=v.prognostic.clock.step_counter
        SW.time_step!(sim)
        now=v.prognostic.clock.time;dt=Dates.value(now-oldtime)/1000;oldtime=now
        evaporation=sum(w.*v.parameterizations.surface_humidity_flux.data)
        rainfall=1000sum(w.*(v.parameterizations.rain_rate.data.+v.parameterizations.snow_rate.data))
        advance_flux!(flux,evaporation-rainfall;nominal_dt=m.time_stepping.Δt,step_counter=counter,
            robert_filter=m.time_stepping.robert_filter,williams_filter=m.time_stepping.williams_filter)
        pr=precip_total(v);pp=sum(w.*(pr.-oldP));oldP.=pr
        E+=dt*evaporation;P+=pp;rateP+=dt*rainfall
        for s in STEP_AUDITS[end]
            totals[s.scheme]=get(totals,s.scheme,0.)+s.residualKgM2S*dt
        end
        a=air_stocks(v,m,w)
        @assert all(isfinite,SW.get_step(v.grid.temperature,2).data)
        @assert minimum(SW.get_step(v.grid.temperature,2).data)>0
        @assert all(isfinite,SW.get_step(v.grid.humidity,2).data)
        residuals=budget_residuals(flux,a.waterKgM2-initial.waterKgM2-c.waterCorrectionMm)
        push!(steps,(;step=i,time=string(now),dt,waterMm=a.waterKgM2,evaporationMm=E,precipitationCounterMm=P,precipitationByActualDtMm=rateP,
            pressureWaterCorrectionMm=c.waterCorrectionMm,residualWithCounterMm=a.waterKgM2-initial.waterKgM2-E+P-c.waterCorrectionMm,
            residuals...,stages=STEP_AUDITS[end]))
    end
    maxDiscrete=maximum(abs(r.discreteFluxResidual) for r in steps)
    maxPhysics=maximum(abs(s.residualKgM2S) for r in steps for s in r.stages)
    result=(;mode,physicsFix=PHYSICS_FIX,waterPreservingDryMass=PRESERVE_MASS_WATER,initialSHA,initial,
        final=air_stocks(v,m,w),stageResidualMm=totals,finalStep=steps[end],maxDiscreteResidualMm=maxDiscrete,
        stepsOverOriginalPointZeroFive=count(r->abs(r.discreteFluxResidual)>.05,steps),maxPhysicsResidualKgM2S=maxPhysics,
        fluxLedger=ledger_snapshot(flux),steps)
    @assert length(steps)==145
    @assert maxPhysics<1e-12
    push!(results,result)
    println(JSON3.write((;mode,physicsFix=PHYSICS_FIX,maxDiscreteResidualMm=maxDiscrete,maxPhysicsResidualKgM2S=maxPhysics,finalStep=steps[end])))
end
mkpath("build/earth-speedy-transport")
open(io->JSON3.write(io,results),"build/earth-speedy-transport/audit-"*PHYSICS_FIX*".json","w")
