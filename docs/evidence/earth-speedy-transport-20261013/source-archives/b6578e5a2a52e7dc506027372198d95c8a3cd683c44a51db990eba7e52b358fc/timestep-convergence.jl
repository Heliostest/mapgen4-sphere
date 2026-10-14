# Independent three-day time-step experiment; frozen V2 includes are read unchanged.
# Only the new model instance's native Leapfrog nominal time step is replaced.
using Dates, JSON3, LinearAlgebra, Test
include("transport-v2-model.jl")
include("startup-ledger.jl")
using .StartupFluxBudgets
BLAS.set_num_threads(1)
PHYSICS_FIX=="all-corrections" || error("Requires PHYSICS_FIX=all-corrections")
PRESERVE_MASS_WATER || error("Requires MASS_IMPLEMENTATION=fixed")

function residual_summary(steps,name)
    values=[getproperty(r,name) for r in steps]
    imax=argmax(abs.(values))
    (;maxAbsMm=abs(values[imax]),signedAtMaxMm=values[imax],timeAtMax=steps[imax].time,
        hoursAtMax=steps[imax].elapsedSeconds/3600,stepAtMax=steps[imax].step,
        finalMm=values[end],stepsOverOriginalPointZeroFive=count(x->abs(x)>.05,values),
        everyStepPassesOriginalPointZeroFive=all(x->abs(x)<=.05,values))
end

function run_case(nominal_seconds)
    sg=SpectralGrid(NF=Float64,truncation=32,nlayers=8)
    m=transport_model(sg,"seasonal")
    # Constructor normalizes the duration to Seconds and updates atmosphere/land/ocean together.
    m.time_stepping=SW.Leapfrog(sg;Δt_at_T32=Millisecond(round(Int,1000nominal_seconds)))
    sim=apply_frozen_initial!(initialize!(m;time=DateTime(2001,1,1)))
    SW.initialize!(sim;period=Day(3),output=false)
    v=sim.variables
    @test m.time_stepping.Δt==nominal_seconds
    @test m.time_stepping.ocean.Δt==nominal_seconds
    @test m.time_stepping.land.Δt==nominal_seconds
    @test v.prognostic.clock.step_counter==0
    @test v.prognostic.clock.n_steps==round(Int,3*86400/nominal_seconds)+1
    initialSHA=stock_hash(v);initialFields=initial_field_comparison(v)
    w=native_weights(m);initial=air_stocks(v,m,w)
    mass=register_mass!(v,m);sst=register_sst!(m)
    start=v.prognostic.clock.time;previous=start;flux=LeapfrogFluxLedger();steps=Any[]
    for i in 1:v.prognostic.clock.n_steps
        counter=v.prognostic.clock.step_counter
        native_step=SW.time_step(m.time_stepping,v.prognostic.clock)
        SW.time_step!(sim)
        now=v.prognostic.clock.time;elapsed=Dates.value(now-start)/1000
        dt=Dates.value(now-previous)/1000;previous=now
        evaporation=sum(w.*v.parameterizations.surface_humidity_flux.data)
        rainfall=1000sum(w.*(v.parameterizations.rain_rate.data.+v.parameterizations.snow_rate.data))
        advance_flux!(flux,evaporation-rainfall;nominal_dt=m.time_stepping.Δt,step_counter=counter,
            robert_filter=m.time_stepping.robert_filter,williams_filter=m.time_stepping.williams_filter)
        a=air_stocks(v,m,w)
        q=SW.get_step(v.grid.humidity,2).data;T=SW.get_step(v.grid.temperature,2).data
        @assert all(isfinite,T) && minimum(T)>0 && all(isfinite,q)
        residuals=budget_residuals(flux,a.waterKgM2-initial.waterKgM2-mass.waterCorrectionMm)
        @assert abs(residuals.rectangularResidual-residuals.timeStaggerContribution-residuals.discreteFluxResidual)<1e-12
        push!(steps,(;step=i,counter,time=string(now),elapsedSeconds=elapsed,dt,nativeAtmosphericStepSeconds=native_step,
            waterMm=a.waterKgM2,pressureWaterCorrectionMm=mass.waterCorrectionMm,
            evaporationKgM2S=evaporation,precipitationKgM2S=rainfall,
            minTemperatureK=minimum(T),maxTemperatureK=maximum(T),minHumidity=minimum(q),maxHumidity=maximum(q),
            residuals...))
    end
    @test previous==start+Day(3)
    @test length(steps)==v.prognostic.clock.n_steps
    @test flux.elapsed_seconds==3*86400
    result=(;mode="seasonal",physicsFix=PHYSICS_FIX,nominalDtSeconds=nominal_seconds,nSteps=length(steps),
        initialSHA,initialFields,initial,final=air_stocks(v,m,w),
        rectangular=residual_summary(steps,:rectangularResidual),discrete=residual_summary(steps,:discreteFluxResidual),
        timeStagger=residual_summary(steps,:timeStaggerContribution),massLedger=mass_ledger(mass),
        fluxLedger=ledger_snapshot(flux),steps)
    path="build/earth-speedy-transport/timestep-convergence-$(Int(nominal_seconds))s.json"
    open(io->JSON3.write(io,result),path,"w")
    println(JSON3.write((;nominalDtSeconds=nominal_seconds,nSteps=result.nSteps,initialSHA,
        rectangular=result.rectangular,discrete=result.discrete,timeStagger=result.timeStagger)))
    flush(stdout)
    return result
end

function main()
    results=Any[]
    @testset "frozen V2 three-day seasonal time-step experiment" begin
        for dt in (1800.,900.,450.)
            push!(results,run_case(dt))
        end
        @test length(unique(r.initialSHA for r in results))==1
    end
    common=Any[]
    for t in 1800.:1800.:3*86400
        rows=[only(filter(r->r.elapsedSeconds==t,result.steps)) for result in results]
        push!(common,(;elapsedSeconds=t,
            rectangularMm=[r.rectangularResidual for r in rows],
            discreteMm=[r.discreteFluxResidual for r in rows],
            waterMm=[r.waterMm for r in rows]))
    end
    summary=(;description="Independent 3-day seasonal SST convergence experiment; unchanged all-corrections physics, native Leapfrog/RAW and frozen 2001 initial state. Does not replace the 30-minute six-year protocol.",
        cases=[(;r.nominalDtSeconds,r.nSteps,r.initialSHA,r.initial,r.final,r.rectangular,r.discrete,r.timeStagger) for r in results],
        maxDiscreteReductionRatios=[results[i].discrete.maxAbsMm/results[i+1].discrete.maxAbsMm for i in 1:2],
        commonThirtyMinuteTimes=common)
    open(io->JSON3.write(io,summary),"build/earth-speedy-transport/timestep-convergence-summary.json","w")
end
main()
