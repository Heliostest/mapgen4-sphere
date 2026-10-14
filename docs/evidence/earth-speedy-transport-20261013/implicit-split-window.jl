# Independent 48-hour replay, changing only the SI reference decomposition.
# All stored prognostic fields (including pressure auxiliary row) are preserved.
include("run-v2.jl")
include("implicit-split-reference.jl")
include("startup-ledger.jl")
using .StartupFluxBudgets
using Test
BLAS.set_num_threads(1)
const SPLIT_SOURCE=ENV["SPLIT_SOURCE"]
const SPLIT_LABEL=ENV["SPLIT_LABEL"]
const SPLIT_OUT="build/earth-speedy-transport/"*SPLIT_LABEL

function replace_implicit(sim,c)
    old=sim.model
    fields=(; (s=>(s==:implicit ? c : getfield(old,s)) for s in fieldnames(typeof(old)))...)
    m=SW.PrimitiveWetModel(;fields...)
    MASS_CONTEXTS[m]=MASS_CONTEXTS[old]
    haskey(SST_CONTEXTS,old) && (SST_CONTEXTS[m]=SST_CONTEXTS[old])
    SW.Simulation(sim.variables,m)
end

function spectral_water(v,m,w,step)
    p=similar(SW.get_step(v.grid.pressure,2));q=similar(SW.get_step(v.grid.humidity,2))
    SW.transform!(p,SW.get_step(v.prognostic.pressure,step),m.spectral_transform)
    SW.transform!(q,SW.get_step(v.prognostic.humidity,step),m.spectral_transform)
    sum(w.*exp.(vec(p.data)).*(q.data*m.geometry.σ_levels_thick))/m.planet.gravity
end

function split_window_record(v,m,w)
    T=data(v.grid.temperature,2);q=data(v.grid.humidity,2)
    nominalC=maximum(abs.(v.dynamics.w.data./v.prognostic.scale[]).*m.time_stepping.Δt./reshape(m.geometry.σ_levels_thick,1,:))
    columns=[(;ij,T=vec(copy(T[ij,:])),q=vec(copy(q[ij,:]))) for ij in (302,354,412,476)]
    pressure=SW.get_step(v.prognostic.pressure,2)
    aux=pressure.spectrum.l_indices.==maximum(pressure.spectrum.l_indices)
    (;time=string(v.prognostic.clock.time),minTemperatureK=minimum(T),maxTemperatureK=maximum(T),
        minByLayer=vec(minimum(T,dims=1)),maxByLayer=vec(maximum(T,dims=1)),
        minHumidity=minimum(q),maxHumidity=maximum(q),
        maxWindMps=maximum(hypot.(data(v.grid.u,2),data(v.grid.v,2))),
        nominalVerticalCourantBeforeStep=nominalC,
        waterMm=air_stocks(v,m,w).waterKgM2,spectralWaterMm=spectral_water(v,m,w,2),
        maxPressureAuxiliary=maximum(abs,pressure.data[aux]),columns)
end

function main()
    inputSHA=bytes2hex(sha256(read(SPLIT_SOURCE)))
    previous=restore(SPLIT_SOURCE);v=previous.variables;old=previous.model
    initialSHA=stock_hash(v);c=SplitReferenceImplicit(old.spectral_grid;
        centering=old.implicit.centering,enabled=old.implicit.enabled)
    SW.initialize!(c,old.implicit.Δt[]/v.prognostic.scale[],old.implicit.temp_profile,
        old.geometry,old.geopotential,old.atmosphere,old.adiabatic_conversion)
    c.Δt[]=old.implicit.Δt[]
    sim=replace_implicit(previous,c);m=sim.model
    @test stock_hash(v)==initialSHA
    @test m.implicit.temp_profile==old.implicit.temp_profile
    @test m.implicit.inner.temp_profile==fill(m.atmosphere.reference_temperature,8)
    # A real full-field operator comparison, including nonzero w and terrain,
    # with independently copied state and unchanged dirty pressure auxiliary row.
    original=deepcopy(v);candidate=deepcopy(v);rawErrors=Dict{String,Float64}()
    for (state,model) in ((original,old),(candidate,m))
        SW.reset_tendencies!(state,model.time_stepping)
        SW.dynamics_tendencies!(state,model)
        add_background_temperature_advection!(state,model.implicit,model)
    end
    @test maximum(abs,original.dynamics.w)>0
    for name in (:vorticity,:divergence,:temperature,:pressure,:humidity)
        a=getproperty(original.tendencies,name).data;b=getproperty(candidate.tendencies,name).data
        rawErrors[string(name)]=maximum(abs,a-b)
        @test a==b
    end
    @test stock_hash(v)==initialSHA
    w=native_weights(m);initial=split_window_record(v,m,w);mass0=mass_ledger(MASS_CONTEXTS[m])
    oldWater=spectral_water(v,m,w,1)
    # Restart carries both old/current scalar stocks, rather than inventing a zero slope.
    # This ledger measures the raw spectral p*q inventory; nonlinear p*q is not
    # assumed to obey the q/p Leapfrog filter exactly.
    flux=LeapfrogFluxLedger(;old=oldWater-initial.spectralWaterMm,current=0.,
        last_counter=v.prognostic.clock.step_counter-1)
    beginTime=v.prognostic.clock.time;finish=beginTime+Day(2);rows=Any[];failure=nothing
    checkpoint(SPLIT_OUT*"-initial.jld2",v,m)
    while v.prognostic.clock.time<finish
        counter=v.prognostic.clock.step_counter
        SW.time_step!(sim)
        rate=sum(w.*v.parameterizations.surface_humidity_flux.data)-
            1000sum(w.*(v.parameterizations.rain_rate.data.+v.parameterizations.snow_rate.data))
        advance_flux!(flux,rate;nominal_dt=m.time_stepping.Δt,step_counter=counter,
            robert_filter=m.time_stepping.robert_filter,williams_filter=m.time_stepping.williams_filter)
        r=split_window_record(v,m,w)
        pressureWater=MASS_CONTEXTS[m].waterCorrectionMm-mass0.waterCorrectionMm
        residual=budget_residuals(flux,r.spectralWaterMm-initial.spectralWaterMm-pressureWater)
        push!(rows,(;r...,netPhysicalWaterRateKgM2S=rate,pressureWaterCorrectionMm=pressureWater,
            diagnosedRectangularResidualMm=r.waterMm-initial.waterMm-flux.rectangular-pressureWater,
            spectralCarrierDiscreteResidualMm=residual.discreteFluxResidual,
            spectralCarrierRectangularResidualMm=residual.rectangularResidual,
            fluxTimeStaggerMm=residual.timeStaggerContribution))
        writejson(SPLIT_OUT*"-progress.json",rows[end])
        if !isfinite(r.minTemperatureK)||r.minTemperatureK<=0
            failure=(;time=r.time,reason="non-positive temperature");break
        end
    end
    checkpoint(SPLIT_OUT*"-final.jld2",v,m)
    result=(;input=SPLIT_SOURCE,inputSHA,initialSHA,initial,oldSpectralWaterMm=oldWater,
        dynamicsReference=copy(c.temp_profile),solverReference=copy(c.inner.temp_profile),
        rawFullFieldTendencyErrors=rawErrors,start=string(beginTime),expectedEnd=string(finish),
        actualEnd=string(v.prognostic.clock.time),nSteps=length(rows),failure,
        windowMinTemperatureK=minimum(r.minTemperatureK for r in rows),
        windowMaxTemperatureK=maximum(r.maxTemperatureK for r in rows),
        maxNominalVerticalCourant=maximum(r.nominalVerticalCourantBeforeStep for r in rows),
        maxAbsDiagnosedRectangularResidualMm=maximum(abs(r.diagnosedRectangularResidualMm) for r in rows),
        maxAbsSpectralCarrierDiscreteResidualMm=maximum(abs(r.spectralCarrierDiscreteResidualMm) for r in rows),
        massInitial=mass0,massFinal=mass_ledger(MASS_CONTEXTS[m]),fluxLedger=ledger_snapshot(flux),rows)
    writejson(SPLIT_OUT*".json",result)
    @test inputSHA==bytes2hex(sha256(read(SPLIT_SOURCE)))
    @test failure===nothing
    @test length(rows)==96
    @test v.prognostic.clock.time==finish
    @test maximum(abs,c.temp_profile-old.implicit.temp_profile)==0
    println(JSON3.write((;event="completed",result.actualEnd,result.nSteps,result.failure,
        result.windowMinTemperatureK,result.windowMaxTemperatureK,result.maxNominalVerticalCourant,
        result.maxAbsDiagnosedRectangularResidualMm,result.maxAbsSpectralCarrierDiscreteResidualMm)))
end
@testset "split reference actual frozen 48-hour failure window" begin
    main()
end
