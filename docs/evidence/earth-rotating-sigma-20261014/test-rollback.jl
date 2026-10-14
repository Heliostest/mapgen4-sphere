include("common.jl")
include("vector-core.jl")
using .VectorInvariant
# Narrow runtime overrides invoke the genuine solvers before injecting faults.
# No test switch or alternate path is added to implementation/frozen sources.
@eval FluxCorrectedTransport begin
    const fault=Ref(0);const calls=Ref(0)
    function transport_fct(a::Matrix{Float64},b::Matrix{Float64},f::Vector{Int},t::Vector{Int},F::Vector{Float64},w::Matrix{Float64})
        r=invoke(transport_fct,Tuple{Any,Any,Any,Any,Any,Any},a,b,f,t,F,w);calls[]+=1
        fault[]==1&&throw(StepRejected("injected late water failure"))
        fault[]==2&&return merge(r,(localWaterRelativeResidual=.001,))
        fault[]==3&&return merge(r,(localDryRelativeResidual=NaN,))
        r
    end
end
@eval VectorInvariant begin
    const fault=Ref(0);const calls=Ref(0)
    function neutral_step(m::VectorCore,p::Vector{Float64},v::Matrix{Float64},tau::Float64;maxiter=400)
        r=invoke(neutral_step,Tuple{VectorCore,Any,Any,Real},m,p,v,tau;maxiter=maxiter);calls[]+=1
        if calls[]==2
            fault[]==1&&throw(StepRejected("injected second momentum failure"))
            fault[]==2&&return merge(r,(v=fill(NaN,size(r.v)),))
            fault[]==3&&return merge(r,(v=1.001r.v,))
        end
        r
    end
end
function main()
    c,lat,lon=small_core();m=VectorCore(PressureWorkCore(c),lat,lon,[.01,.03,.07])
    p=c.pref.*(1 .+.01collect(1:6));v=reshape(.02sin.(1:30),15,2)
    first=BarotropicState(p,mass(m,p)*.012,v,0.)
    bits(a,b)=reinterpret(UInt64,vec(a))==reinterpret(UInt64,vec(b))
    for phase in (:water,:momentum),mode in 1:3
        FluxCorrectedTransport.fault[]=phase==:water ? mode : 0
        VectorInvariant.fault[]=phase==:momentum ? mode : 0
        FluxCorrectedTransport.calls[]=0;VectorInvariant.calls[]=0;s=deepcopy(first)
        @test_throws StepRejected step!(m,s,.1)
        @test bits(s.p,first.p)&&bits(s.v,first.v)&&bits(s.W,first.W)&&reinterpret(UInt64,s.time)==reinterpret(UInt64,first.time)
        @test FluxCorrectedTransport.calls[]==1
        @test VectorInvariant.calls[]==(phase==:water ? 1 : 2)
    end
    write_result((passed=true,modes=6,literalBitRollback=true,genuineSolversInvoked=true))
end
@testset "C9 late water and second momentum rollback" begin;main();end
