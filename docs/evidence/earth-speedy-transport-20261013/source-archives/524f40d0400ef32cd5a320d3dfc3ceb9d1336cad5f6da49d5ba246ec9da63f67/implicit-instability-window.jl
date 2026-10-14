# Native-only replay: preserve pre-failure checkpoints and fixed-column time series.
include("run-v2.jl")
const WINDOW_SOURCE=get(ENV,"PROBE_INITIAL","build/earth-speedy-transport/implicit-sensitivity-initial.jld2")
const WINDOW_BASELINE=get(ENV,"PROBE_BASELINE","build/earth-speedy-transport/implicit-instability-thermal-v2.json")
const WINDOW_LABEL=get(ENV,"PROBE_LABEL","implicit-instability-thermal-window")
const WINDOW_OUT="build/earth-speedy-transport/"*WINDOW_LABEL
function window_record(v,m)
    old=similar(SW.get_step(v.grid.temperature,2))
    SW.transform!(old,SW.get_step(v.prognostic.temperature,1),m.spectral_transform)
    T=SW.get_step(v.grid.temperature,2).data;q=SW.get_step(v.grid.humidity,2).data
    scale=v.prognostic.scale[];w=v.dynamics.w.data./scale
    C=maximum(abs.(w).*SW.time_step(m.time_stepping,v.prognostic.clock)./reshape(m.geometry.σ_levels_thick,1,:))
    columns=map((302,354,412,476)) do ij
        (;ij,lat=m.geometry.latds[ij],lon=m.geometry.londs[ij],
            T=vec(copy(T[ij,:])),oldSpectralT=vec(copy(old.data[ij,:])),
            q=vec(copy(q[ij,:])),u=vec(copy(SW.get_step(v.grid.u,2).data[ij,:])),
            v=vec(copy(SW.get_step(v.grid.v,2).data[ij,:])),
            divergence=vec(copy(SW.get_step(v.grid.divergence,2).data[ij,:]))./scale,
            wBeforeStep=vec(copy(w[ij,:])))
    end
    (;time=string(v.prognostic.clock.time),minTemperatureK=minimum(T),maxTemperatureK=maximum(T),
        maxVerticalCourantBeforeStep=C,average=copy(v.dynamics.average_temperature_profile),columns)
end
function main()
    BLAS.set_num_threads(1)
    sourceSHA=bytes2hex(sha256(read(WINDOW_SOURCE)));baselineSHA=bytes2hex(sha256(read(WINDOW_BASELINE)))
    baseline=JSON3.read(read(WINDOW_BASELINE,String));finish=DateTime(baseline.failure.record.time)
    beginwindow=finish-Day(2);index=Dict(String(r.time)=>r for r in baseline.records)
    sim=restore(WINDOW_SOURCE);v=sim.variables;m=sim.model
    rows=Any[];threshold_saved=false;lastDay=-1;checks=0
    while v.prognostic.clock.time<finish
        if v.prognostic.clock.time>=beginwindow && threshold_saved
            # This path is only overwritten within this new, in-progress diagnostic.
            checkpoint(WINDOW_OUT*"-last-positive.jld2",v,m)
        end
        SW.time_step!(sim)
        now=v.prognostic.clock.time;day=Dates.value(Date(now)-Date(2006,1,1))
        if day!=lastDay
            println(JSON3.write((;event="day",time=string(now))));flush(stdout);lastDay=day
        end
        if now>=beginwindow
            r=window_record(v,m);push!(rows,r)
            reference=index[r.time]
            @assert r.minTemperatureK==reference.minTemperatureK
            @assert r.maxTemperatureK==reference.maxTemperatureK
            checks+=2
            if length(rows)==1
                checkpoint(WINDOW_OUT*"-start.jld2",v,m)
                writejson(WINDOW_OUT*"-start.json",r)
            end
            if !threshold_saved && r.maxVerticalCourantBeforeStep>.5
                checkpoint(WINDOW_OUT*"-courant-half.jld2",v,m)
                writejson(WINDOW_OUT*"-courant-half.json",r)
                threshold_saved=true
            end
            writejson(WINDOW_OUT*"-progress.json",r)
        end
    end
    @assert sourceSHA==bytes2hex(sha256(read(WINDOW_SOURCE)))
    @assert baselineSHA==bytes2hex(sha256(read(WINDOW_BASELINE)))
    writejson(WINDOW_OUT*".json",(;source=WINDOW_SOURCE,sourceSHA,baseline=WINDOW_BASELINE,baselineSHA,
        reference=copy(m.implicit.temp_profile),exactExtremaComparisons=checks,rows))
    println(JSON3.write((;event="completed",time=string(v.prognostic.clock.time),exactExtremaComparisons=checks)))
end
main()
