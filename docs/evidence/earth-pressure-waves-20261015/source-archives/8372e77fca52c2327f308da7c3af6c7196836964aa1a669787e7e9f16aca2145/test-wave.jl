include("common.jl")
include("wave-core.jl")
@testset "C11 wave diagnostic" begin
    # Two equal cells, one unit edge: eigenvalue2, exactly soluble oscillator.
    c=TransportCore(Geometry([1.,1.],[1],[2],[1.],[1.],1.),ones(2),[1.];c2=1.)
    r=[1.,-1.];v=[0.];dt=.2
    r1,v1=wave_step(c,r,v,dt)
    @test r1≈[49/51,-49/51] rtol=1e-14
    @test v1≈[20/51] rtol=1e-14
end
write_result((passed=true,stage="oscillator"))
