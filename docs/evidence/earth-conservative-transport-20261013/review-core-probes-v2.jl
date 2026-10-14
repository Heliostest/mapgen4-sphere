using Test, LinearAlgebra, Random, SHA, JSON3, Serialization
include("conservative-core.jl")
using .ConservativeCore
BLAS.set_num_threads(1)
const REVIEW_OUT=joinpath(@__DIR__,"../../../build/earth-conservative-transport")
const sourceBefore=bytes2hex(sha256(read(joinpath(@__DIR__,"conservative-core.jl"))))
const findings=Dict{String,Any}()

@testset "independent dense acoustic pair and radius scaling" begin
    a=[.2,.3,.5];f=[1,2,3];t=[2,3,1];L=[.8,.6,.5];d=[.4,.3,.2]
    pref=[1.4,.9,1.1];ds=[.1,.3,.6];p=[1.42,.92,1.07];j=[.01 -.02 .03;-.03 .01 .02;.02 -.01 .01]
    for R in (1.,7.)
        g=Geometry(a,f,t,L,d,R);c=TransportCore(g,pref,ds;c2=2.)
        s=State(p,.02mass(c,p),j,0.);dt=.04R
        # Solve the coupled unknowns [p_new; jbar_new] directly. This fixture
        # does not use c.B, c.gradient, c.stiffness, or the production elimination.
        D=zeros(3,3);G=zeros(3,3)
        for e in 1:3
            D[f[e],e]=L[e]/R;D[t[e],e]=-L[e]/R
            G[e,f[e]]=2*(pref[f[e]]+pref[t[e]])/2/(R*d[e])/pref[f[e]]
            G[e,t[e]]=-2*(pref[f[e]]+pref[t[e]])/2/(R*d[e])/pref[t[e]]
        end
        pair=[diagm(a) dt*D;-dt*G Matrix{Float64}(I,3,3)]
        expected=pair\vcat(a.*p,j*ds)
        step!(c,s,dt)
        @test s.p≈expected[1:3] atol=2e-15
        @test s.j*ds≈expected[4:6] atol=2e-15
        @test s.W./mass(c,s.p)≈fill(.02,3,3) atol=1e-15
    end
end

@testset "restart with freshly constructed factor cache" begin
    g=Geometry([1.,2.,1.],[1,2,3],[2,3,1],[1.,.7,.6],[1.,1.2,.9],7.)
    c=TransportCore(g,[2.,1.,3.],[.25,.75];c2=2.)
    s=State([2.1,1.1,2.8],.01mass(c,[2.1,1.1,2.8]),[.01 -.02;.03 .01;-.02 .04],0.)
    advance!(c,s,.3)
    path=joinpath(REVIEW_OUT,"review-core-checkpoint-v2.bin")
    isfile(path) && error("review output already exists")
    save_checkpoint(path,c,s)
    c2=TransportCore(deepcopy(g),[2.,1.,3.],[.25,.75];c2=2.)
    resumed=load_checkpoint(path,c2)
    @test isempty(c2.cache)
    for _ in 1:7
        advance!(c,s,.3);advance!(c2,resumed,.3)
    end
    @test s.p==resumed.p && s.W==resumed.W && s.j==resumed.j && s.time==resumed.time
end

@testset "dry bound at the admissible q=1 endpoint" begin
    Random.seed!(62013)
    found=nothing
    for trial in 1:100
        n=8;a=.5 .+ rand(n);pref=.5 .+ rand(n);p=pref.*(.9 .+ .2rand(n))
        g=Geometry(a,collect(1:n),circshift(collect(1:n),-1),.5 .+ rand(n),.5 .+ rand(n),1.)
        c=TransportCore(g,pref,[.1,.3,.6];c2=1.)
        s=State(p,mass(c,p),.01randn(n,3),0.)
        led=step!(c,s,.1)
        dry=minimum(mass(c,s.p)-s.W)
        if dry<0
            followup=try step!(c,s,.1);"accepted" catch e;string(typeof(e),": ",sprint(showerror,e)) end
            found=(trial=trial,minimumDryMass=dry,qmax=led.qmax,followup=followup)
            break
        end
    end
    findings["qOneBoundary"]=found
    println("q=1 endpoint probe: ",JSON3.write(found))
end

@testset "large time and invalid advance intervals" begin
    g=Geometry([1.,1.],[1],[2],[1.],[1.],1.)
    c=TransportCore(g,[1.,1.],[1.];c2=1.)
    s=State([1.,1.],zeros(2,1),zeros(1,1),0.)
    neg=advance!(c,s,-1.)
    findings["negativeInterval"]=(accepted=length(neg.steps),time=s.time)
    inferr=try advance!(c,s,Inf);"accepted" catch e;string(typeof(e),": ",sprint(showerror,e)) end
    findings["infiniteInterval"]=inferr
    nan=advance!(c,s,NaN)
    findings["nanInterval"]=(accepted=length(nan.steps),time=s.time)
end

sourceAfter=bytes2hex(sha256(read(joinpath(@__DIR__,"conservative-core.jl"))))
@test sourceBefore==sourceAfter
path=joinpath(REVIEW_OUT,"review-core-probes-v2.json")
isfile(path) && error("review output already exists")
write(path,JSON3.write((sourceBefore=sourceBefore,sourceAfter=sourceAfter,findings=findings)))
