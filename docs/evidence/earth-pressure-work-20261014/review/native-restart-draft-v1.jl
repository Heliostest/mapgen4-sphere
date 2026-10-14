include("../../docs/evidence/earth-pressure-work-20261014/common.jl")
include("../../docs/evidence/earth-pressure-work-20261014/pressure-core.jl")
using .PressureWork
const SCRATCH=@__DIR__
const BEFORE=bytes2hex(sha256(read("docs/evidence/earth-pressure-work-20261014/pressure-core.jl")))
bits(a,b)=reinterpret(UInt64,vec(a))==reinterpret(UInt64,vec(b))
same(a,b)=bits(a.p,b.p)&&bits(a.v,b.v)&&bits(a.W,b.W)&&reinterpret(UInt64,a.time)==reinterpret(UInt64,b.time)
function main()
    graph,initial,geo=native_inputs();rows=[]
    for kind in ("real","constant","sharp")
        c=graph_core(graph,initial.pref,initial.ds;radius=Float64(geo.radiusM),c2=82671.64740772452);m=PressureWorkCore(c)
        checkpoint=joinpath(OUT,"c8-native-1800-v2-"*kind*"-checkpoint.bin")
        final=joinpath(OUT,"c8-native-1800-v2-"*kind*"-final.bin")
        s=load_checkpoint(checkpoint,m);target=deserialize(final)
        @test s.time==14400.&&target.state.time==21600.
        @test target.identity==identity_hash(m)
        diagnostics=[]
        for k in 1:4
            led=step!(m,s,1800.)
            push!(diagnostics,(step=k,iterations=led.iterations,residual=led.residual,localAir=led.localAirRelativeResidual,localWater=led.localWaterRelativeResidual,localDry=led.localDryRelativeResidual))
        end
        @test same(s,target.state)
        push!(rows,(case=kind,literalBits=true,steps=4,checkpointSHA256=bytes2hex(sha256(read(checkpoint))),finalSHA256=bytes2hex(sha256(read(final))),diagnostics=diagnostics))
        println(JSON3.write(rows[end]));flush(stdout)
    end
    @test BEFORE==bytes2hex(sha256(read("docs/evidence/earth-pressure-work-20261014/pressure-core.jl")))
    result=(passed=true,reviewedCoreSHA256=BEFORE,rows=rows)
    write(joinpath(SCRATCH,"native-restart-results.json"),JSON3.write(result))
end
@testset "Independent rebuilt three-case native checkpoints" begin;main();end
