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
path=joinpath(@__DIR__,"../../../build/earth-conservative-transport/review-candidate-c1-summary.json")
isfile(path) && error("review output exists")
write(path,JSON3.write((sourceBefore=FINAL_SOURCE,sourceAfter=afterFinal,metrics=finalmetrics)))
println(JSON3.write(finalmetrics))

@testset "final review: independent dense acoustic pair and radius scaling" begin
    a=[.2,.3,.5];f=[1,2,3];t=[2,3,1];L=[.8,.6,.5];d=[.4,.3,.2]
    pref=[1.4,.9,1.1];ds=[.1,.3,.6];p=[1.42,.92,1.07];j=[.01 -.02 .03;-.03 .01 .02;.02 -.01 .01]
    for R in (1.,7.)
        g=Geometry(a,f,t,L,d,R);c=TransportCore(g,pref,ds;c2=2.)
        s=State(p,.02mass(c,p),j,0.);dt=.04R
        D=zeros(3,3);G=zeros(3,3)
        for e in 1:3
            D[f[e],e]=L[e]/R;D[t[e],e]=-L[e]/R
            G[e,f[e]]=2*(pref[f[e]]+pref[t[e]])/2/(R*d[e])/pref[f[e]]
            G[e,t[e]]=-2*(pref[f[e]]+pref[t[e]])/2/(R*d[e])/pref[t[e]]
        end
        expected=[diagm(a) dt*D;-dt*G Matrix{Float64}(I,3,3)]\vcat(a.*p,j*ds)
        step!(c,s,dt)
        @test s.p≈expected[1:3] atol=2e-15
        @test s.j*ds≈expected[4:6] atol=2e-15
        @test s.W./mass(c,s.p)≈fill(.02,3,3) atol=1e-15
    end
end

@testset "final review: restart with freshly constructed factor cache" begin
    g=Geometry([1.,2.,1.],[1,2,3],[2,3,1],[1.,.7,.6],[1.,1.2,.9],7.)
    c=TransportCore(g,[2.,1.,3.],[.25,.75];c2=2.)
    s=State([2.1,1.1,2.8],.01mass(c,[2.1,1.1,2.8]),[.01 -.02;.03 .01;-.02 .04],0.)
    advance!(c,s,.3)
    path=joinpath(@__DIR__,"../../../build/earth-conservative-transport/review-candidate-c1-checkpoint.bin")
    isfile(path) && error("review output already exists")
    save_checkpoint(path,c,s)
    fresh=TransportCore(deepcopy(g),[2.,1.,3.],[.25,.75];c2=2.)
    resumed=load_checkpoint(path,fresh)
    @test isempty(fresh.cache)
    for _ in 1:7
        advance!(c,s,.3);advance!(fresh,resumed,.3)
    end
    @test s.p==resumed.p && s.W==resumed.W && s.j==resumed.j && s.time==resumed.time
end
