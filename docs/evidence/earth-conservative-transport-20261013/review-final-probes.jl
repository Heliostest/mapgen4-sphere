include("review-sigma-probe-v2.jl")
using Random
const FINAL_SOURCE=bytes2hex(sha256(read(joinpath(@__DIR__,"conservative-core.jl"))))
const finalmetrics=Dict("maxLocalWaterRelative"=>0.,"maxLocalDryRelative"=>0.,"maxGlobalWaterDrift"=>0.,"maxComplementarity"=>0.)
@testset "review regression: pure and mixed wet/dry endpoints" begin
    for mode in (:allwet,:alldry,:mixed,:interior)
        Random.seed!(62013)
        for trial in 1:100
            n=8;a=.5 .+ rand(n);pref=.5 .+ rand(n);p=pref.*(.9 .+ .2rand(n))
            g=Geometry(a,collect(1:n),circshift(collect(1:n),-1),.5 .+ rand(n),.5 .+ rand(n),1.)
            c=TransportCore(g,pref,[.1,.3,.6];c2=1.)
            j=mode==:allwet ? .01randn(n,3) : repeat(.01randn(n),1,3)
            q=mode==:allwet ? ones(n,3) : mode==:alldry ? zeros(n,3) : mode==:mixed ? hcat(ones(n),zeros(n),zeros(n)) : .2 .+ .6rand(n,3)
            s=State(p,mass(c,p).*q,j,0.);water0=sum(s.W);qlo=minimum(q);qhi=maximum(q)
            for k in 1:3
                led=step!(c,s,.1);m=mass(c,s.p);qnew=s.W./m
                @test all(0 .<= s.W .<= m)
                @test qlo-1e-13<=minimum(qnew)<=maximum(qnew)<=qhi+1e-13
                @test led.localWaterRelativeResidual<1e-13
                @test led.localDryRelativeResidual<1e-13
                @test abs(sum(s.W)-water0)<1e-13
                mode==:allwet && @test s.W==m
                mode==:alldry && @test all(iszero,s.W)
                finalmetrics["maxLocalWaterRelative"]=max(finalmetrics["maxLocalWaterRelative"],led.localWaterRelativeResidual)
                finalmetrics["maxLocalDryRelative"]=max(finalmetrics["maxLocalDryRelative"],led.localDryRelativeResidual)
                finalmetrics["maxGlobalWaterDrift"]=max(finalmetrics["maxGlobalWaterDrift"],abs(sum(s.W)-water0))
                finalmetrics["maxComplementarity"]=max(finalmetrics["maxComplementarity"],led.complementarityResidual)
            end
        end
    end
end
@testset "review regression: invalid intervals" begin
    g=Geometry([1.,1.],[1],[2],[1.],[1.],1.);c=TransportCore(g,ones(2),[1.];c2=1.)
    s=State(ones(2),zeros(2,1),zeros(1,1),0.)
    for dt in (-1.,0.,Inf,NaN)
        @test_throws ArgumentError advance!(c,s,dt)
    end
    s.time=1e300
    @test_throws ArgumentError advance!(c,s,1.)
    @test_throws ArgumentError step!(c,s,1.)
end
afterFinal=bytes2hex(sha256(read(joinpath(@__DIR__,"conservative-core.jl"))))
@test FINAL_SOURCE==afterFinal
path=joinpath(@__DIR__,"../../../build/earth-conservative-transport/review-final-probes-v1.json")
isfile(path) && error("review output exists")
write(path,JSON3.write((sourceBefore=FINAL_SOURCE,sourceAfter=afterFinal,metrics=finalmetrics)))
println(JSON3.write(finalmetrics))
