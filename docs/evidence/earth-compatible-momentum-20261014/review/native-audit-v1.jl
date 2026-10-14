include("../../docs/evidence/earth-compatible-momentum-20261014/common.jl")
include("../../docs/evidence/earth-compatible-momentum-20261014/coupled-core.jl")
using .CoupledCompatible

function main()
    sourceFiles=["common.jl","transport-core.jl","coupled-core.jl","native-run.jl","compare-time.jl"]
    hashes()=Dict(f=>bytes2hex(sha256(read(joinpath("docs/evidence/earth-compatible-momentum-20261014",f)))) for f in sourceFiles)
    before=hashes();selected=jsonfile("docs/evidence/earth-compatible-momentum-20261014/selected-runs.json")
    names=String.(selected.native);graph,initial,geo=native_inputs();area=Float64.(graph.area);ds=initial.ds;pref=initial.pref
    gravity=Float64(geo.gravityMps2);c=graph_core(graph,pref,ds;radius=Float64(geo.radiusM),c2=82671.64740772452)
    lat=Float64.(graph.lat);lon=Float64.(graph.lon);wind=WindMap(c,lat,lon)
    j0=import_wind(wind,initial.pressure,initial.u,initial.v)
    H=(c.g.edgeLength.*c.g.centerDistance./c.prefFace)*ds'
    masses(p)=(area.*p)*ds'
    function referenceEnergy(p,j)
        ratio=p./pref;meanRatio=sum(area.*p)/sum(area.*pref)
        c.c2*sum(area.*pref.*(ratio.-meanRatio).^2)/2+sum(H.*j.^2)/2
    end
    initialEnergy=referenceEnergy(initial.pressure,j0);rows=[];realStates=[];inputHashes=Dict{String,String}()
    function bound(path)
        inputHashes[path]=bytes2hex(sha256(read(path)));path
    end
    for name in names
        result=jsonfile(bound(joinpath(OUT,name*".json")))
        for row in result.results
            kind=String(row.case);final=deserialize(bound(joinpath(OUT,name*"-"*kind*"-final.bin"))).state
            q0=kind=="real" ? initial.water : kind=="constant" ? fill(.012,size(initial.water)) : hcat([.02Float64.(mod.(lon.+k*.43,2pi).<pi) for k in eachindex(ds)]...)
            q=final.W./masses(final.p)
            air=(sum(masses(final.p))-sum(masses(initial.pressure)))/(4pi*gravity)
            water=(sum(final.W)-sum(masses(initial.pressure).*q0))/(4pi*gravity)
            finalEnergy=referenceEnergy(final.p,final.j)
            balance=abs(finalEnergy-initialEnergy+row.energyLossFraction*initialEnergy)/initialEnergy
            @test abs(air)<1e-8&&abs(water)<1e-9&&abs(air-water)<1e-8
            @test minimum(q)>=minimum(q0)-1e-11&&maximum(q)<=maximum(q0)+1e-11
            @test final.time==21600&&all(final.p.>0)&&balance<1e-9
            @test isapprox(air,row.airDriftKgM2;atol=1e-12)&&isapprox(water,row.waterDriftMm;atol=1e-12)
            push!(rows,(run=name,kind=kind,air=air,water=water,balance=balance,qmin=minimum(q),qmax=maximum(q)))
            kind=="real"&&push!(realStates,final)
        end
    end
    adjacent=[];fineMass=masses(realStates[end].p)
    for i in 1:3
        a,b=realStates[i:i+1]
        dp=sqrt(sum(area.*(a.p-b.p).^2)/sum(area))
        dj=sqrt(sum(H.*(a.j-b.j).^2)/sum((c.g.edgeLength.*c.g.centerDistance./c.prefFace).*c.prefFace.^2))
        dq=sqrt(sum(fineMass.*(a.W./masses(a.p)-b.W./masses(b.p)).^2)/sum(fineMass))
        push!(adjacent,(pressurePa=dp,momentumMps=dj,humidityKgKg=dq))
    end
    for key in (:pressurePa,:momentumMps,:humidityKgKg)
        @test getproperty(adjacent[1],key)>getproperty(adjacent[2],key)>getproperty(adjacent[3],key)>0
    end
    m=CoupledCore(ModalCore(c),CompatibleTransport(RotationMap(c,lat,lon,[0.,0.,7.292115e-5]),lat,lon))
    restart=[]
    bits(a,b)=reinterpret(UInt64,vec(a))==reinterpret(UInt64,vec(b))
    for kind in ("real","constant","sharp")
        s=load_checkpoint(bound(joinpath(OUT,names[1]*"-"*kind*"-checkpoint.bin")),m)
        target=deserialize(joinpath(OUT,names[1]*"-"*kind*"-final.bin"))
        @test identity_hash(m)==target.identity
        for _ in 1:4;step!(m,s,1800.);end
        equal=bits(s.p,target.state.p)&&bits(s.W,target.state.W)&&bits(s.j,target.state.j)&&reinterpret(UInt64,s.time)==reinterpret(UInt64,target.state.time)
        @test equal
        push!(restart,(kind=kind,steps=4,literalBits=equal));println(JSON3.write(last(restart)));flush(stdout)
    end
    @test before==hashes()
    result=(passed=true,names=names,rows=rows,adjacent=adjacent,restart=restart,sourceHashes=before,inputHashes=inputHashes)
    write(joinpath(@__DIR__,"native-audit-v1.json"),JSON3.write(result));println(JSON3.write(result))
end
@testset "Independent C7 native budgets and rebuilt restarts" begin;main();end
