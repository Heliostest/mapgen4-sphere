include("../../docs/evidence/earth-pressure-work-20261014/common.jl")
include("../../docs/evidence/earth-pressure-work-20261014/pressure-core.jl")
using .PressureWork
setprecision(BigFloat,160)
const SCRATCH=@__DIR__
function independent_energy(c,p,v)
    K=BigFloat(0);U=BigFloat(0)
    for e in eachindex(c.g.from)
        h=BigFloat(c.g.edgeLength[e]*c.g.centerDistance[e]);pf=(BigFloat(p[c.g.from[e]])+BigFloat(p[c.g.to[e]]))/2
        for k in eachindex(c.ds);K+=h*BigFloat(c.ds[k])*pf*BigFloat(v[e,k])^2/2;end
    end
    for i in eachindex(p)
        pp=BigFloat(p[i]);r=BigFloat(c.pref[i]);U+=BigFloat(c.g.area[i])*(pp*log(pp/r)-pp+r)
    end
    K,BigFloat(c.c2)*U
end
function inventory(c,s)
    air=sum(BigFloat(c.g.area[i])*BigFloat(s.p[i])*BigFloat(c.ds[k]) for i in eachindex(s.p),k in eachindex(c.ds))
    water=sum(BigFloat(w) for w in s.W)
    air,water
end
function initialW(c,p,q)
    [(c.g.area[i]*p[i])*c.ds[k]*q[i,k] for i in eachindex(p),k in eachindex(c.ds)]
end
function metrics(c,a,b,ref)
    area=BigFloat.(c.g.area);ds=BigFloat.(c.ds);np=BigFloat(0);nv=BigFloat(0);dv=BigFloat(0);nq=BigFloat(0);dq=BigFloat(0)
    for i in eachindex(a.p)
        np+=area[i]*(BigFloat(a.p[i])-BigFloat(b.p[i]))^2
        for k in eachindex(ds)
            mm=area[i]*BigFloat(ref.p[i])*ds[k]
            qa=BigFloat(a.W[i,k])/(area[i]*BigFloat(a.p[i])*ds[k]);qb=BigFloat(b.W[i,k])/(area[i]*BigFloat(b.p[i])*ds[k])
            nq+=mm*(qa-qb)^2;dq+=mm
        end
    end
    for e in eachindex(c.g.from)
        h=BigFloat(c.g.edgeLength[e]*c.g.centerDistance[e])*(BigFloat(ref.p[c.g.from[e]])+BigFloat(ref.p[c.g.to[e]]))/2
        dv+=h
        for k in eachindex(ds);nv+=h*ds[k]*(BigFloat(a.v[e,k])-BigFloat(b.v[e,k]))^2;end
    end
    (pressurePa=Float64(sqrt(np/sum(area))),velocityMps=Float64(sqrt(nv/dv)),humidityKgKg=Float64(sqrt(nq/dq)))
end
function main()
    graph,initial,geo=native_inputs();c=graph_core(graph,initial.pref,initial.ds;radius=Float64(geo.radiusM),c2=82671.64740772452);m=PressureWorkCore(c)
    wind=WindMap(c,Float64.(graph.lat),Float64.(graph.lon));j=import_wind(wind,initial.pressure,initial.u,initial.v)
    v0=[j[e,k]/((initial.pressure[c.g.from[e]]+initial.pressure[c.g.to[e]])/2) for e in eachindex(c.g.from),k in eachindex(c.ds)]
    K0,U0=independent_energy(c,initial.pressure,v0);H0=K0+U0
    selected=jsonfile("docs/evidence/earth-pressure-work-20261014/selected-runs.json");names=String.(selected.native)
    files=String["docs/evidence/earth-pressure-work-20261014/pressure-core.jl","docs/evidence/earth-pressure-work-20261014/native-run.jl","docs/evidence/earth-pressure-work-20261014/compare-time.jl"]
    append!(files,[joinpath(OUT,name*"-real-final.bin") for name in names]);append!(files,[joinpath(OUT,names[1]*"-"*kind*"-final.bin") for kind in ("constant","sharp")]);append!(files,[joinpath(OUT,name*".json") for name in names]);push!(files,joinpath(OUT,String(selected.temporal)*".json"))
    before=Dict(p=>bytes2hex(sha256(read(p))) for p in files)
    rows=[];states=BarotropicState[];lon=Float64.(graph.lon)
    for (index,name) in enumerate(names)
        recorded=jsonfile(joinpath(OUT,name*".json"))
        for kind in (index==1 ? ("real","constant","sharp") : ("real",))
            d=deserialize(joinpath(OUT,name*"-"*kind*"-final.bin"));s=d.state
            @test d.identity==identity_hash(m)&&s.time==21600.0
            @test all(isfinite,s.v)&&all(s.p.>0)
            q0=kind=="real" ? copy(initial.water) : kind=="constant" ? fill(.012,size(initial.water)) : hcat([.02Float64.(mod.(lon.+k*.43,2pi).<pi) for k in eachindex(c.ds)]...)
            first=BarotropicState(copy(initial.pressure),initialW(c,initial.pressure,q0),copy(v0),0.0)
            a0,w0=inventory(c,first);a1,w1=inventory(c,s)
            factor=4BigFloat(pi)*BigFloat(geo.gravityMps2)
            air=Float64((a1-a0)/factor);water=Float64((w1-w0)/factor);dry=air-water
            K,U=independent_energy(c,s.p,s.v);hchange=Float64(abs(K+U-H0)/H0)
            q=s.W./[(c.g.area[i]*s.p[i])*c.ds[k] for i in eachindex(s.p),k in eachindex(c.ds)]
            record=only(r for r in recorded.results if r.case==kind)
            @test abs(air)<1e-8&&abs(water)<1e-9&&abs(dry)<1e-8
            @test hchange<1e-9
            @test minimum(q)>=minimum(q0)-1e-11&&maximum(q)<=maximum(q0)+1e-11
            @test abs(air-record.airDriftKgM2)<1e-10&&abs(water-record.waterDriftMm)<1e-12
            @test hchange<=record.accumulatedEnergyDrift+5e-15
            @test abs(sum(c.g.area.*(s.p-initial.pressure).^2)/sum(c.g.area)-record.finalPressureRMSChangePa^2)<1e-8
            kind=="real"&&push!(states,s)
            index==1&&kind!="real"&&(@test reinterpret(UInt64,vec(s.v))==reinterpret(UInt64,vec(states[1].v))&&reinterpret(UInt64,s.p)==reinterpret(UInt64,states[1].p))
            push!(rows,(name=name,case=kind,airDriftKgM2=air,waterDriftMm=water,dryDriftKgM2=dry,highPrecisionFinalEnergyDrift=hchange,recordedMaxEnergyDrift=record.accumulatedEnergyDrift,qmin=minimum(q),qmax=maximum(q),pmin=minimum(s.p)))
            println(JSON3.write(rows[end]));flush(stdout)
        end
    end
    temporal=jsonfile(joinpath(OUT,String(selected.temporal)*".json"));adjacent=[metrics(c,states[i],states[i+1],states[end]) for i in 1:3];reference=[metrics(c,states[i],states[end],states[end]) for i in 1:3]
    for (actual,reported) in ((adjacent,temporal.adjacent),(reference,temporal.reference)),i in 1:3,key in (:pressurePa,:velocityMps,:humidityKgKg)
        @test isapprox(getproperty(actual[i],key),getproperty(reported[i],key);rtol=2e-10,atol=1e-15)
    end
    for list in (adjacent,reference),key in (:pressurePa,:velocityMps,:humidityKgKg)
        @test getproperty(list[1],key)>getproperty(list[2],key)>getproperty(list[3],key)>0
    end
    ratios=[(pressure=adjacent[i].pressurePa/adjacent[i+1].pressurePa,velocity=adjacent[i].velocityMps/adjacent[i+1].velocityMps,humidity=adjacent[i].humidityKgKg/adjacent[i+1].humidityKgKg) for i in 1:2]
    after=Dict(p=>bytes2hex(sha256(read(p))) for p in files);@test before==after
    result=(passed=true,rows=rows,adjacent=adjacent,reference=reference,ratios=ratios,sourceAndInputHashes=after,arithmeticBits=160)
    write(joinpath(SCRATCH,"native-metrics-results.json"),JSON3.write(result));println(JSON3.write((adjacent=adjacent,reference=reference,ratios=ratios)))
end
@testset "Independent native state inventories energy and time metrics" begin;main();end
