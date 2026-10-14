# Read-only instrumentation of frozen V2/native steps. No model methods replaced.
# Native sequence adapted from SpeedyWeather 0.23.0, EUPL-1.2, modified 2026-10-13.
# Copyright (c) 2020 Milan Kloewer; (c) 2021 The SpeedyWeather.jl Contributors;
# (c) 2022 Fred Kucharski and Franco Molteni. See frozen LICENSE-SpeedyWeather.txt.
include("run-v2.jl")
const PROBE_INITIAL=get(ENV,"PROBE_INITIAL","build/earth-speedy-transport/implicit-sensitivity-initial.jld2")
const PROBE_LABEL=get(ENV,"PROBE_LABEL","implicit-instability-thermal")
const PROBE_OUT="build/earth-speedy-transport/"*PROBE_LABEL
const PROBE_RECORDS=Any[]

function temperature_grid_from_spectral(spec,v,m)
    a=similar(SW.get_step(v.grid.temperature,2))
    SW.transform!(a,spec,m.spectral_transform)
    copy(a.data)
end
function probe_step!(sim)
    v=sim.variables;m=sim.model;ts=m.time_stepping;clock=v.prognostic.clock
    dt=SW.time_step(ts,clock);scale=v.prognostic.scale[]
    old=temperature_grid_from_spectral(SW.get_step(v.prognostic.temperature,1),v,m)
    current=temperature_grid_from_spectral(SW.get_step(v.prognostic.temperature,2),v,m)
    before=copy(SW.get_step(v.grid.temperature,2).data)
    fields=Dict{String,Matrix{Float64}}()
    stages=Any[];w2=clock.step_counter<=1 ? 0. : ts.robert_filter*(1-ts.williams_filter)/2
    function capture(name)
        rate=temperature_grid_from_spectral(SW.get_step(v.tendencies.temperature),v,m)./scale
        fields[name]=rate
        unfiltered=old.+dt.*rate
        candidate=unfiltered.-w2.*(old.-2current.+unfiltered)
        push!(stages,(;name,minCandidateK=minimum(candidate),maxCandidateK=maximum(candidate),
            minRateKDay=86400minimum(rate),maxRateKDay=86400maximum(rate)))
    end
    SW.reinitialize!(m,v);SW.reset_tendencies!(v,ts)
    SW.greenhouse_gases_time_step!(v,m)
    SW.parameterization_tendencies!(v,m)
    physical=copy(SW.get_step(v.tendencies.grid.temperature).data)
    SW.ocean_timestep!(v,m);SW.sea_ice_timestep!(v,m);SW.land_timestep!(v,m)
    SW.dynamics_tendencies!(v,m);capture("dynamics")
    SW.horizontal_diffusion!(v,m);capture("horizontal_diffusion")
    add_background_temperature_advection!(v,m.implicit,m);capture("background")
    SW.implicit_correction!(v,m.implicit.inner,ts,m);capture("implicit")
    w=copy(v.dynamics.w.data)./scale
    CFL=maximum(abs.(w).*dt./reshape(m.geometry.σ_levels_thick,1,:))
    divergence=copy(SW.get_step(v.grid.divergence,2).data)./scale
    SW.update_prognostic!(v,m)
    SW.transform!(v,m)
    SW.particle_advection!(v,m)
    SW.time_step!(clock,ts)
    T=SW.get_step(v.grid.temperature,2).data
    loc=argmin(T);ij,k=Tuple(loc);q=SW.get_step(v.grid.humidity,2).data
    rates=Dict(name=>field[ij,k] for (name,field) in fields)
    record=(;time=string(clock.time),counter=clock.step_counter,minTemperatureK=minimum(T),maxTemperatureK=maximum(T),
        minByLayer=vec(minimum(T,dims=1)),maxByLayer=vec(maximum(T,dims=1)),
        ij,k,lat=m.geometry.latds[ij],lon=m.geometry.londs[ij],
        oldSpectralTemperatureK=old[ij,k],currentSpectralTemperatureK=current[ij,k],beforeGridTemperatureK=before[ij,k],
        physicalRateKDay=86400physical[ij,k],ratesAtMinimumKSec=rates,
        maxVerticalCourant=CFL,maxDivergence=maximum(abs,divergence),
        maxWind=maximum(hypot.(SW.get_step(v.grid.u,2).data,SW.get_step(v.grid.v,2).data)),
        atMinimumColumn=(;T=vec(copy(T[ij,:])),beforeT=vec(before[ij,:]),q=vec(copy(q[ij,:])),
            w=vec(w[ij,:]),divergence=vec(divergence[ij,:]),
            physicalRateKDay=vec(86400 .*physical[ij,:]),reference=copy(m.implicit.temp_profile)),stages)
    push!(PROBE_RECORDS,record)
    return record,fields,physical
end

function main()
    BLAS.set_num_threads(1)
    inputSHA=bytes2hex(sha256(read(PROBE_INITIAL)))
    sim=restore(PROBE_INITIAL);v=sim.variables;m=sim.model
    initial=(;path=PROBE_INITIAL,inputSHA,stockSHA=stock_hash(v),time=string(v.prognostic.clock.time),
        reference=copy(m.implicit.temp_profile),currentAverage=copy(v.dynamics.average_temperature_profile),
        minByLayer=vec(minimum(SW.get_step(v.grid.temperature,2).data,dims=1)),
        maxByLayer=vec(maximum(SW.get_step(v.grid.temperature,2).data,dims=1)))
    writejson(PROBE_OUT*"-initial.json",initial)
    println(JSON3.write((;event="initial",initial)));flush(stdout)
    # Prove instrumentation performs the same native first step before trusting its trajectory.
    native=restore(PROBE_INITIAL);SW.time_step!(native)
    first,_,_=probe_step!(sim)
    @assert stock_hash(v)==stock_hash(native.variables)
    @assert v.grid.temperature.data==native.variables.grid.temperature.data
    println(JSON3.write((;event="native_first_step_exact",time=first.time)));flush(stdout)
    native=nothing
    failure=nothing
    try
        for i in 2:48*120
            record,fields,physical=probe_step!(sim)
            if i%48==0
                println(JSON3.write((;event="daily",time=record.time,minTemperatureK=record.minTemperatureK,
                    maxWind=record.maxWind,maxVerticalCourant=record.maxVerticalCourant)));flush(stdout)
                writejson(PROBE_OUT*"-progress.json",record)
            end
            if record.minTemperatureK<=0 || !isfinite(record.minTemperatureK)
                failure=(;kind="first_nonpositive_poststep_temperature",record)
                JLD2.jldsave(PROBE_OUT*"-failure-fields.jld2";fields,physical,
                    containers=Dict(string(k)=>SW.materialize_views(getproperty(v,k)) for k in (:prognostic,:grid,:tendencies,:dynamics,:parameterizations)))
                checkpoint(PROBE_OUT*"-first-bad.jld2",v,m)
                break
            end
        end
    catch error
        failure=(;kind="exception",time=string(v.prognostic.clock.time),error=string(error))
    end
    @assert bytes2hex(sha256(read(PROBE_INITIAL)))==inputSHA
    result=(;initial,physicsFix=PHYSICS_FIX,nativeFirstStepExact=true,failure,records=PROBE_RECORDS)
    writejson(PROBE_OUT*".json",result)
    println(JSON3.write((;event="completed",failure,nSteps=length(PROBE_RECORDS))));flush(stdout)
end
main()
