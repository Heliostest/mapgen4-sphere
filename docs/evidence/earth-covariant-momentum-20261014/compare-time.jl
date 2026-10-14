include("common.jl")
include("advection-core.jl")
using .NonlinearAdvection
function main()
    names=ARGS;length(names)==4||error("need 1800/900/450/225 runs")
    results=[jsonfile(joinpath(OUT,name*".json")) for name in names]
    @test [r.dt for r in results]==[1800.,900.,450.,225.]
    @test all(r->r.passed&&r.duration==21600,results)
    finals=[deserialize(joinpath(OUT,name*"-real-final.bin")) for name in names]
    @test all(r->r.identity==finals[1].identity,finals)
    graph,initial,geo=native_inputs();c=graph_core(graph,initial.pref,initial.ds;radius=Float64(geo.radiusM))
    area=c.g.area;refmass=mass(c,finals[end].state.p)
    function distance(a,b)
        pressure=sqrt(sum(area.*(a.p-b.p).^2)/sum(area))
        velocity=sqrt(sum(vec(refmass).*(a.velocity-b.velocity).^2)/sum(refmass))
        qa=a.W./mass(c,a.p);qb=b.W./mass(c,b.p)
        humidity=sqrt(sum(refmass.*(qa-qb).^2)/sum(refmass))
        (pressurePa=pressure,velocityMps=velocity,humidityKgKg=humidity)
    end
    adjacent=[distance(finals[i].state,finals[i+1].state) for i in 1:3]
    reference=[distance(finals[i].state,finals[end].state) for i in 1:3]
    ratios=[(pressure=adjacent[i].pressurePa/adjacent[i+1].pressurePa,velocity=adjacent[i].velocityMps/adjacent[i+1].velocityMps,humidity=adjacent[i].humidityKgKg/adjacent[i+1].humidityKgKg) for i in 1:2]
    write_result((passed=false,names=names,adjacent=adjacent,reference=reference,ratios=ratios))
    for key in (:pressurePa,:velocityMps,:humidityKgKg)
        @test getproperty(adjacent[1],key)>getproperty(adjacent[2],key)>getproperty(adjacent[3],key)>0
        @test getproperty(reference[1],key)>getproperty(reference[2],key)>getproperty(reference[3],key)>0
    end
    write_result((passed=true,names=names,adjacent=adjacent,reference=reference,ratios=ratios,referenceIsDiscrete=true,formalOrder=1))
end
@testset "C6 nonlinear temporal comparison" begin;main();end
