using Test, LinearAlgebra, SHA, JSON3
include("conservative-core.jl")
using .ConservativeCore
BLAS.set_num_threads(1)
before=bytes2hex(sha256(read(joinpath(@__DIR__,"conservative-core.jl"))))
@testset "independent two-column sigma circulation" begin
    g=Geometry([1.,1.],[1],[2],[1.],[1.],1.)
    c=TransportCore(g,[1.,1.],[.25,.75];c2=1.)
    p=ones(2);q=[.2 .6;.4 .8]
    s=State(p,mass(c,p).*q,reshape([3.,-1.],1,2),0.)
    # Zero weighted column flux gives unchanged pressure. Four .075 transfers
    # circulate 1(top-left)->2(top-right)->4(bottom-right)->3(bottom-left)->1.
    M=[.25,.25,.75,.75];A=diagm(M .+ .075)
    A[2,1]=-.075;A[4,2]=-.075;A[3,4]=-.075;A[1,3]=-.075
    expected=M.*(A\(M.*vec(q)))
    led=step!(c,s,.1)
    @test s.p==p
    @test s.j==reshape([3.,-1.],1,2)
    @test vec(s.W)≈expected atol=2e-16
    @test led.localAirResidual<1e-16
    @test led.localWaterResidual<1e-16
    @test led.waterResidual<1e-15
    @test led.bottomResidual<1e-16
    @test .2<=minimum(s.W./mass(c,s.p))<=maximum(s.W./mass(c,s.p))<=.8
end
@testset "late input rejection leaves all authoritative state intact" begin
    g=Geometry([1.,1.],[1],[2],[1.],[1.],1.)
    c=TransportCore(g,[1.,1.],[1.];c2=1.)
    s=State([1.5,.5],reshape([1.51,.2],2,1),zeros(1,1),7.)
    old=deepcopy(s)
    @test_throws ArgumentError step!(c,s,.1)
    @test s.p==old.p && s.W==old.W && s.j==old.j && s.time==old.time
end
after=bytes2hex(sha256(read(joinpath(@__DIR__,"conservative-core.jl"))))
@test before==after
println(JSON3.write((sourceBefore=before,sourceAfter=after)))
