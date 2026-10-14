include("common.jl")
include("pressure-core.jl")
using .PressureWork
# Runtime-only fault injection at the late solver boundary; frozen FCT bytes
# remain untouched and ordinary dispatch is invoked for the genuine solve.
@eval FluxCorrectedTransport begin
    const fault=Ref(0)
    const calls=Ref(0)
    function transport_fct(a::Matrix{Float64},b::Matrix{Float64},f::Vector{Int},t::Vector{Int},F::Vector{Float64},w::Matrix{Float64})
        calls[]+=1
        fault[]==1&&throw(StepRejected("injected late water failure"))
        r=invoke(transport_fct,Tuple{Any,Any,Any,Any,Any,Any},a,b,f,t,F,w)
        fault[]==2&&return merge(r,(localWaterRelativeResidual=.001,))
        fault[]==3&&return merge(r,(localDryRelativeResidual=NaN,))
        r
    end
end
function main()
    c,_,_=small_core();m=PressureWorkCore(c);p=c.pref.*(1 .+.01collect(1:6));v=reshape(.02sin.(1:30),15,2)
    first=BarotropicState(p,mass(m,p)*.012,v,0.)
    bits(a,b)=reinterpret(UInt64,vec(a))==reinterpret(UInt64,vec(b))
    for mode in 1:3
        FluxCorrectedTransport.fault[]=mode;s=deepcopy(first);before=FluxCorrectedTransport.calls[]
        @test_throws StepRejected step!(m,s,.1)
        @test bits(s.p,first.p)&&bits(s.v,first.v)&&bits(s.W,first.W)&&reinterpret(UInt64,s.time)==reinterpret(UInt64,first.time)
        @test FluxCorrectedTransport.calls[]==before+1
    end
    write_result((passed=true,modes=3,literalBitRollback=true))
end
@testset "C8 late water failure and budget rollback" begin;main();end
