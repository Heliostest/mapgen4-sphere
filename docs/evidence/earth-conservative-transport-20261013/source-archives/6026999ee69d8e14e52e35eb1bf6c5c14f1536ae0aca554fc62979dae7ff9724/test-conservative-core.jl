using Test, LinearAlgebra, SHA, JSON3
include("conservative-core.jl")
using .ConservativeCore
BLAS.set_num_threads(1)

@testset "implicit pressure is an acoustic pair, not diffusion" begin
    g=Geometry([1.,1.],[1],[2],[1.],[1.],1.)
    core=Core(g,[1.,1.],[1.];c2=1.)
    s=State([1.5,.5],reshape([.3,.1],2,1),zeros(1,1),0.)
    ledger=step!(core,s,1.)
    @test s.p ≈ [7/6,5/6] atol=2e-15
    @test s.j[1,1] ≈ 1/3 atol=2e-15
    @test s.W ≈ reshape([7/30,1/6],2,1) atol=2e-15
    @test ledger.airResidual < 1e-14
    @test ledger.waterResidual < 1e-14
    step!(core,s,1.)
    @test s.p ≈ [17/18,19/18] atol=2e-15
    @test s.j[1,1] ≈ 2/9 atol=2e-15
end

@testset "sharp water, unequal layers and local continuity" begin
    g=Geometry([1.,2.,1.],[1,2,3],[2,3,1],[1.,1.,1.],[1.,1.,1.],1.)
    core=Core(g,[2.,2.,2.],[.1,.3,.6];c2=1.)
    p=[2.1,1.9,2.1]; q=[0. 0. .02; .02 0. .02; 0. .02 0.]
    s=State(copy(p),mass(core,p).*q,[.02 .01 -.01;-.01 .02 .01;.01 -.01 .02],0.)
    initialwater=sum(s.W); initialair=sum(mass(core,p))
    for _ in 1:12
        ledger=step!(core,s,.2)
        actual=s.W./mass(core,s.p)
        @test minimum(actual)>=0
        @test maximum(actual)<=.02+1e-14
        @test ledger.localAirResidual<1e-12
        @test ledger.localWaterResidual<1e-12
        @test ledger.bottomResidual<1e-12
    end
    @test sum(s.W)≈initialwater atol=2e-14
    @test sum(mass(core,s.p))≈initialair atol=2e-13
end

@testset "variable-reference balance and BE energy identity" begin
    g=Geometry([1.,2.,1.],[1,2,3],[2,3,1],[1.,.7,.6],[1.,1.2,.9],1.)
    core=Core(g,[2.,1.,3.],[.25,.75];c2=2.)
    p=1.4core.pref
    s=State(copy(p),.012mass(core,p),zeros(3,2),0.)
    step!(core,s,10.)
    @test s.p≈p rtol=1e-14
    @test maximum(abs,s.j)<1e-13
    @test s.W./mass(core,s.p)≈fill(.012,3,2) atol=1e-15
    s=State(p.+[.1,-.05,0.],.01mass(core,p.+[.1,-.05,0.]),[.01 -.02;.03 .01;-.02 .04],0.)
    pold=copy(s.p);jold=copy(s.j);eold=energy(core,s)
    step!(core,s,.3)
    loss=.5core.c2*sum(g.area.*core.pref.*((s.p-pold)./core.pref).^2)+.5sum((g.edgeLength.*g.centerDistance./core.prefFace).*sum((s.j-jold).^2.*reshape(core.ds,1,:),dims=2)[:])
    @test energy(core,s)-eold≈-loss atol=1e-13
end

@testset "rejection does not mutate state; no clipping" begin
    g=Geometry([1.,1.],[1],[2],[1.],[1.],1.)
    core=Core(g,[1.,1.],[1.];c2=1.)
    s=State([1.,1.],reshape([0.,.02],2,1),reshape([20.],1,1),7.)
    before=deepcopy(s)
    @test_throws StepRejected step!(core,s,.1)
    @test s.p==before.p && s.W==before.W && s.j==before.j && s.time==before.time
    @test_throws ArgumentError State([1.,1.],reshape([-.01,.02],2,1),zeros(1,1),0.)
end

@testset "checkpoint contains all authoritative acoustic and tracer state" begin
    g=Geometry([1.,1.],[1],[2],[1.],[1.],1.)
    core=Core(g,[1.,1.],[.3,.7];c2=1.)
    s=State([1.2,.8],.01mass(core,[1.2,.8]),zeros(1,2),0.)
    step!(core,s,.1)
    out=joinpath(@__DIR__,"../../../build/earth-conservative-transport/test-checkpoint.bin")
    save_checkpoint(out,core,s)
    resumed=load_checkpoint(out,core)
    for _ in 1:7
        step!(core,s,.1);step!(core,resumed,.1)
    end
    @test s.p==resumed.p && s.W==resumed.W && s.j==resumed.j && s.time==resumed.time
    other=Core(g,[1.,1.],[.4,.6];c2=1.)
    @test_throws ArgumentError load_checkpoint(out,other)
end
