include("../../docs/evidence/earth-rotating-sigma-20261014/common.jl")
include("../../docs/evidence/earth-rotating-sigma-20261014/vector-core.jl")
using .VectorInvariant
# Runtime-only specialized wrappers invoke the real routines before injecting
# faults. Nothing in the implementation or inherited FCT changes.
@eval FluxCorrectedTransport begin
    const injectMode=Ref(0);const actualCalls=Ref(0)
    function transport_fct(a::Matrix{Float64},b::Matrix{Float64},f::Vector{Int},t::Vector{Int},F::Vector{Float64},w::Matrix{Float64})
        r=invoke(transport_fct,Tuple{Any,Any,Any,Any,Any,Any},a,b,f,t,F,w)
        actualCalls[]+=1
        injectMode[]==1&&throw(StepRejected("independent injected FCT throw"))
        injectMode[]==2&&return merge(r,(localAirRelativeResidual=-1e-30,))
        injectMode[]==3&&return merge(r,(localDryRelativeResidual=Inf,))
        r
    end
end
@eval VectorInvariant begin
    const injectMode=Ref(0);const actualCalls=Ref(0)
    function neutral_step(m::VectorCore,p::Vector{Float64},v::Matrix{Float64},tau::Float64;maxiter=400)
        r=invoke(neutral_step,Tuple{VectorCore,Any,Any,Real},m,p,v,tau;maxiter=maxiter)
        actualCalls[]+=1
        if actualCalls[]==2
            injectMode[]==1&&throw(StepRejected("independent injected second neutral throw"))
            injectMode[]==2&&return merge(r,(v=fill(Inf,size(r.v)),))
            injectMode[]==3&&return merge(r,(v=2r.v,))
        end
        r
    end
end
function main()
    c,lat,lon=small_core(;ds=[.03,.17,.29,.51]);m=VectorCore(PressureWorkCore(c),lat,lon,[.022,.013,-.057])
    p=c.pref.*exp.(.15cos.(1:6));v=reshape(.09cos.(1:60),15,4)
    bits(a,b)=reinterpret(UInt64,vec(a))==reinterpret(UInt64,vec(b))
    records=[]
    for q in (0.,.015,1.),phase in (:water,:momentum),mode in 1:3
        FluxCorrectedTransport.injectMode[]=phase==:water ? mode : 0
        VectorInvariant.injectMode[]=phase==:momentum ? mode : 0
        FluxCorrectedTransport.actualCalls[]=0;VectorInvariant.actualCalls[]=0
        s=BarotropicState(copy(p),mass(m,p)*q,copy(v),.37);before=deepcopy(s)
        @test_throws StepRejected step!(m,s,.08)
        @test bits(s.p,before.p)&&bits(s.v,before.v)&&bits(s.W,before.W)&&reinterpret(UInt64,s.time)==reinterpret(UInt64,before.time)
        @test FluxCorrectedTransport.actualCalls[]==1
        @test VectorInvariant.actualCalls[]==(phase==:water ? 1 : 2)
        push!(records,(humidity=q,phase=string(phase),mode=mode,unchanged=true,realWaterCalls=FluxCorrectedTransport.actualCalls[],realNeutralCalls=VectorInvariant.actualCalls[]))
    end
    write("build/c9-independent-review/late-results.json",JSON3.write((passed=true,cases=records)))
end
@testset "Independent all-dry mixed all-wet late rollback" begin;main();end
