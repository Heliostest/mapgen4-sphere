using Test,LinearAlgebra,Random,JSON3
include("../earth-conservative-transport-20261013/conservative-core.jl")
include("fct-transport.jl")
using .ConservativeCore,.FluxCorrectedTransport
BLAS.set_num_threads(1)
@testset "smooth rotation accuracy without sacrificing conservation" begin
    errors=Float64[]
    for n in (32,64,128)
        x=(0:n-1)*2pi/n;q0=.5 .+.3sin.(x);water=copy(q0)
        from=collect(1:n);to=circshift(from,-1);steps=2n;F=fill(n/steps,n)
        for _ in 1:steps
            tr=transport_fct(ones(n),ones(n),from,to,F,water);water=tr.water
            @test tr.localWaterRelativeResidual<1e-13
            @test minimum(q0)-1e-13<=minimum(water)<=maximum(water)<=maximum(q0)+1e-13
        end
        push!(errors,norm(water-q0)/norm(q0.-.5))
        @test abs(sum(water)-sum(q0))<1e-11
    end
    println(JSON3.write((smoothErrors=errors,refinementRatios=errors[1:2]./errors[2:3])))
    @test errors[2]<.03
    @test all(errors[1:2]./errors[2:3].>2.5)
end
@testset "sharp front and wet dry endpoints" begin
    n=64;from=collect(1:n);to=circshift(from,-1);mo=ones(n)
    for q in (zeros(n),ones(n),Float64.(isodd.(1:n)),Float64.((1:n).<32),fill(.012,n))
        water=copy(q)
        for _ in 1:64
            tr=transport_fct(mo,mo,from,to,fill(.9,n),water);water=tr.water
            @test all(0 .<=water.<=mo)
            @test abs(sum(water)-sum(q))<1e-11
            @test tr.localWaterRelativeResidual<1e-13
        end
    end
end
@testset "unequal cell and layer masses with changing pressure" begin
    rng=MersenneTwister(44);n=15;from=collect(1:n);to=circshift(from,-1)
    mo=.2 .+rand(rng,n);F=.02randn(rng,n);incoming=zeros(n)
    for e in eachindex(F);incoming[from[e]]-=F[e];incoming[to[e]]+=F[e];end
    mn=mo+incoming
    for q in (fill(.2,n),zeros(n),ones(n),Float64.(isodd.(1:n)),rand(rng,n))
        tr=transport_fct(mo,mn,from,to,F,mo.*q)
        @test all(0 .<=tr.water.<=mn)
        @test abs(sum(tr.water)-sum(mo.*q))<1e-13
        @test tr.localAirRelativeResidual<1e-13
        @test tr.localWaterRelativeResidual<1e-13
        if all(==(.2),q);@test tr.water./mn≈q atol=2e-15;end
        # Flux divergence reconstructs the water increment independently.
        net=zeros(n)
        for e in eachindex(F);net[from[e]]-=tr.waterTransfers[e];net[to[e]]+=tr.waterTransfers[e];end
        @test maximum(abs,tr.water-mo.*q-net)<1e-13
    end
    @test_throws StepRejected transport_fct(mo,mn.+.01,from,to,F,.2mo)
end
