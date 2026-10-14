using Test,LinearAlgebra
include("../earth-conservative-transport-20261013/conservative-core.jl")
using .ConservativeCore
@testset "smooth translating tracer retains amplitude and phase" begin
    n=64;x=(0:n-1)*2pi/n;q0=.5 .+.3sin.(x);water=copy(q0)
    from=collect(1:n);to=circshift(from,-1);steps=128;F=fill(n/steps,n)
    for _ in 1:steps
        water=transport_tracer(ones(n),ones(n),from,to,F,water).water
    end
    error=norm(water-q0)/norm(q0.-.5)
    println("rotation relative error = ",error)
    @test error<.03
end
