using Test,LinearAlgebra,Random
include("../earth-conservative-transport-20261013/conservative-core.jl")
include("modal-core.jl")
include("fct-transport.jl")
include("fct-core.jl")
using .ConservativeCore,.ModalAcoustics,.FluxCorrectedTransport,.CoupledFCT
BLAS.set_num_threads(1)
@testset "one integrated flux with wet dry and constant layers" begin
    rng=MersenneTwister(888);n=9;nl=3
    c=TransportCore(Geometry(.5 .+rand(rng,n),collect(1:n),circshift(collect(1:n),-1),.3 .+rand(rng,n),.5 .+rand(rng,n),1.7),1 .+rand(rng,n),[.1,.2,.7];c2=.8)
    m=FCTCore(ModalCore(c));p=c.pref.*(1 .+.02randn(rng,n));j=.01randn(rng,n,nl)
    for q in (zeros(n,nl),ones(n,nl),repeat(Float64.(isodd.(1:n)),1,nl),fill(.012,n,nl))
        s=State(copy(p),mass(c,p).*q,copy(j),0.);initial=sum(s.W)
        for _ in 1:30
            led=step!(m,s,.2)
            @test all(0 .<=s.W.<=mass(c,s.p))
            @test max(led.localAirRelativeResidual,led.localWaterRelativeResidual,led.localDryRelativeResidual)<5e-12
        end
        @test abs(sum(s.W)-initial)<1e-12
        if all(==(.012),q);@test s.W./mass(c,s.p)≈q atol=2e-14;end
        mktempdir() do dir
            file=joinpath(dir,"c2.bin");save_checkpoint(file,m,s)
            rebuilt=FCTCore(ModalCore(c));r=load_checkpoint(file,rebuilt)
            step!(m,s,.2);step!(rebuilt,r,.2)
            @test s.p==r.p&&s.j==r.j&&s.W==r.W&&s.time==r.time
            @test_throws ArgumentError load_checkpoint(file,m.modal)
        end
    end
end
