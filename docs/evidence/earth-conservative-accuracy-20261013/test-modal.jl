using Test,LinearAlgebra,SparseArrays,Random,Serialization
include("../earth-conservative-transport-20261013/conservative-core.jl")
include("modal-core.jl")
using .ConservativeCore,.ModalAcoustics
BLAS.set_num_threads(1)
@testset "exact coarse acoustic pair and integrated shared flux" begin
    c=TransportCore(Geometry([1.,1.],[1],[2],[1.],[1.],1.),ones(2),[1.];c2=1.)
    m=ModalCore(c);s=State([1.5,.5],reshape([.3,.1],2,1),zeros(1,1),0.)
    e0=energy(c,s);a=acoustic_step(m,s,1.)
    @test a.p≈[1+.5cos(sqrt(2.)),1-.5cos(sqrt(2.))] atol=1e-13
    @test a.j[1]≈sin(sqrt(2.))/sqrt(2.) atol=1e-13
    @test a.integratedJ[1]≈.5(1-cos(sqrt(2.))) atol=1e-13
    led=step!(m,s,1.)
    @test energy(c,s)≈e0 atol=1e-13
    @test s.W≈.2mass(c,s.p) atol=1e-14
    @test led.localAirRelativeResidual<1e-13
    @test led.localWaterRelativeResidual<1e-13
end
# A block matrix exponential is an independent algorithm for the complete
# first-order p/j ODE and an accumulator for integral(j), not the modal formula.
@testset "independent block exponential, variable area/reference/layers/radius" begin
    rng=MersenneTwister(8034);n=7;nl=3;ne=7
    c=TransportCore(Geometry(.5 .+rand(rng,n),collect(1:n),circshift(collect(1:n),-1),.3 .+rand(rng,ne),.5 .+rand(rng,ne),1.7),1 .+rand(rng,n),[.1,.2,.7];c2=.8)
    m=ModalCore(c);p=c.pref.*(1 .+.02randn(rng,n));j=.01randn(rng,ne,nl)
    s=State(p,.012mass(c,p),j,0.)
    N=n+2ne*nl;L=zeros(N,N)
    for k in 1:nl
        r=n+(k-1)*ne+1:n+k*ne;ri=n+ne*nl+(k-1)*ne+1:n+ne*nl+k*ne
        L[1:n,r]=-Diagonal(1 ./c.g.area)*c.divergence*c.ds[k]
        L[r,1:n]=c.c2*Diagonal(c.prefFace)*c.gradient*Diagonal(1 ./c.pref)
        L[ri,r]=Matrix{Float64}(I,ne,ne)
    end
    x=vcat(p,vec(j),zeros(ne*nl))
    for dt in (1e-8,.1,1.,10.)
        truth=exp(dt*L)*x;a=acoustic_step(m,s,dt)
        @test a.p≈truth[1:n] atol=2e-13
        @test a.j≈reshape(truth[n+1:n+ne*nl],ne,nl) atol=2e-13
        @test a.integratedJ≈reshape(truth[n+ne*nl+1:end],ne,nl) atol=2e-12
        @test maximum(abs,c.g.area.*(a.p-p)+c.divergence*(a.integratedJ*c.ds))<2e-13
        evolved=State(a.p,.012mass(c,a.p),a.j,dt)
        @test energy(c,evolved)≈energy(c,s) rtol=2e-12
    end
    whole=acoustic_step(m,s,3.);half=acoustic_step(m,s,1.)
    next=acoustic_step(m,State(half.p,.012mass(c,half.p),half.j,1.),2.)
    @test whole.p≈next.p atol=2e-13
    @test whole.j≈next.j atol=2e-13
    @test whole.integratedJ≈half.integratedJ+next.integratedJ atol=2e-13
    for q in (zeros(n,nl),ones(n,nl),repeat(Float64.(isodd.(1:n)),1,nl),fill(.012,n,nl))
        s=State(copy(p),mass(c,p).*q,copy(j),0.);w0=sum(s.W)
        for _ in 1:20
            led=step!(m,s,.3)
            @test all(0 .<=s.W.<=mass(c,s.p))
            @test led.localAirRelativeResidual<5e-12
            @test led.localWaterRelativeResidual<5e-12
        end
        @test sum(s.W)≈w0 atol=1e-12
    end
    mktempdir() do dir
        save_checkpoint(joinpath(dir,"checkpoint.bin"),m,s)
        rebuilt=ModalCore(c);copyS=load_checkpoint(joinpath(dir,"checkpoint.bin"),rebuilt)
        for _ in 1:4;step!(m,s,.3);step!(rebuilt,copyS,.3);end
        @test s.p==copyS.p && s.W==copyS.W && s.j==copyS.j && s.time==copyS.time
        other=TransportCore(c.g,c.pref,[.2,.3,.5];c2=.8)
        @test_throws ArgumentError load_checkpoint(joinpath(dir,"checkpoint.bin"),ModalCore(other))
    end
end
@testset "interval pressure positivity and atomic rejection" begin
    c=TransportCore(Geometry(ones(2),[1],[2],[1.],[1.],1.),ones(2),[1.];c2=1.)
    m=ModalCore(c)
    s=State(ones(2),zeros(2,1),fill(2.,1,1),0.);before=deepcopy(s)
    # p endpoints equal one after a period, but p goes negative in between.
    @test_throws StepRejected step!(m,s,2pi/sqrt(2.))
    @test s.p==before.p && s.W==before.W && s.j==before.j && s.time==before.time
    s=State(ones(2),fill(2.,2,1),zeros(1,1),0.);before=deepcopy(s)
    @test_throws ArgumentError step!(m,s,.1)
    @test s.p==before.p && s.W==before.W && s.j==before.j && s.time==before.time
    @test_throws ArgumentError step!(m,s,0.)
end
