include("common.jl")
include("pressure-core.jl")
using .PressureWork
bits(a,b)=reinterpret(UInt64,vec(a))==reinterpret(UInt64,vec(b))
function main()
    length(ARGS)==1||error("need one selected native run name")
    name=only(ARGS);native=jsonfile(joinpath(OUT,name*".json"))
    @test native.passed&&native.duration==21600&&native.dt in (1800.,900.,450.,225.)
    @test native.sameDynamicsAcrossTracers
    graph,initial,geo=native_inputs()
    c=graph_core(graph,initial.pref,initial.ds;radius=Float64(geo.radiusM),c2=82671.64740772452)
    m=PressureWorkCore(c);wind=WindMap(c,Float64.(graph.lat),Float64.(graph.lon))
    j=import_wind(wind,initial.pressure,initial.u,initial.v)
    p=copy(initial.pressure);v=j./(m.S*p/2);trace=[];steps=round(Int,native.duration/native.dt)
    @test native.c2==c.c2&&steps*native.dt==native.duration
    for k in 1:steps
        solved=pressure_step(m,p,v,native.dt);p=solved.p;v=solved.v
        push!(trace,(step=k,time=k*native.dt,iterations=solved.iterations,backtracks=solved.backtracks,
            residual=solved.residual,equationP=solved.equationP,equationV=solved.equationV,
            energyAbsolute=solved.energyAbsolute,energyAllowance=solved.energyAllowance))
        if k==1||k%24==0||k==steps
            println(JSON3.write((native=name,step=k,steps=steps,iterations=solved.iterations)));flush(stdout)
        end
    end
    @test length(trace)==steps&&all(r->r.residual<=2e-14&&r.energyAbsolute<=r.energyAllowance,trace)
    for row in native.results
        final=deserialize(joinpath(OUT,name*"-"*row.case*"-final.bin"))
        @test final.identity==identity_hash(m)&&final.state.time==native.duration
        @test bits(p,final.state.p)
        @test bits(v,final.state.v)
        @test sum(r.iterations for r in trace)==row.totalIterations&&maximum(r.iterations for r in trace)==row.maxIterations&&sum(r.backtracks for r in trace)==row.backtracks
        @test maximum(r.residual for r in trace)==row.maxNonlinearResidual
        @test maximum(max(r.equationP,r.equationV) for r in trace)==row.maxEquationRelative
    end
    write_result((passed=true,nativeName=name,dt=native.dt,duration=native.duration,steps=steps,trace=trace,
        scope="Deterministic pressure_step replay; water does not feed back on this subsystem",
        matchedCases=[r.case for r in native.results],literalBitFinalPressureVelocity=true,aggregatesExactlyMatch=true))
end
@testset "C8 complete nonlinear iteration trace replay" begin;main();end
