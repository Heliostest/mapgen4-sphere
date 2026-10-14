using Test
include("../earth-conservative-transport-20261013/conservative-core.jl")
using .ConservativeCore
# Replacing exponential propagation with BE must fail these physical checks.
@testset "continuous two-cell acoustic solution at coarse time" begin
    c=TransportCore(Geometry([1.,1.],[1],[2],[1.],[1.],1.),ones(2),[1.];c2=1.)
    s=State([1.5,.5],reshape([.3,.1],2,1),zeros(1,1),0.)
    e0=energy(c,s);step!(c,s,1.)
    @test s.p≈[1+.5cos(sqrt(2.)),1-.5cos(sqrt(2.))] atol=1e-13
    @test s.j[1]≈sin(sqrt(2.))/sqrt(2.) atol=1e-13
    @test energy(c,s)≈e0 atol=1e-13
end
