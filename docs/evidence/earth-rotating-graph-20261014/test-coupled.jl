include("common.jl")
include("coupled-core.jl")
using .RotatingAcoustics
function main()
    c,lat,lon=small_core();omega=[.23,-.15,.42];rot=RotationMap(c,lat,lon,omega);fct=FCTCore(ModalCore(c));m=RotatingCore(fct,rot)
    n=length(lat);ne=length(c.prefFace);nl=length(c.ds);rng=MersenneTwister(41)
    p=c.pref.*(1 .+.001randn(rng,n));j=.001randn(rng,ne,nl)
    initial=State(p,mass(c,p).*.012,j,0.)
    # Independent full-system dense exponential, no split-step reference.
    B=zeros(n,ne)
    for e in 1:ne;B[c.g.from[e],e]=1;B[c.g.to[e],e]=-1;end
    D=B*Diagonal(c.g.edgeLength/c.g.radius)
    G=Diagonal(1 ./(c.g.radius*c.g.centerDistance))*B'
    pressureForce=c.c2*Diagonal(c.prefFace)*G*Diagonal(1 ./c.pref)
    C=Matrix(rot.PJ*rot.R);A=zeros(n+ne*nl,n+ne*nl)
    for k in 1:nl
        ix=n+(k-1)*ne+1:n+k*ne
        A[1:n,ix]=-c.ds[k]*Diagonal(1 ./c.g.area)*D
        A[ix,1:n]=pressureForce;A[ix,ix]=C
    end
    y0=vcat(initial.p,vec(initial.j));T=.8;exact=exp(T*A)*y0
    scale=norm(vcat(initial.p-c.pref,vec(initial.j)));errors=[]
    for dt in (.1,.05,.025,.0125)
        s=deepcopy(initial);e0=energy(m,s)
        for _ in 1:round(Int,T/dt);step!(m,s,dt);end
        push!(errors,norm(vcat(s.p,vec(s.j))-exact)/scale)
        @test abs(energy(m,s)-e0)/e0<1e-11
        @test maximum(abs,s.W./mass(m,s.p).-0.012)<1e-13
    end
    ratios=errors[1:end-1]./errors[2:end]
    @test all(>(3.5),ratios)
    # A constant reference ratio and zero velocity remain stationary.
    rest=State(1.1c.pref,mass(c,1.1c.pref).*.01,zeros(ne,nl),0.);saved=deepcopy(rest)
    step!(m,rest,.1);@test rest.p≈saved.p atol=1e-14;@test maximum(abs,rest.j)<1e-14
    # Exact zero-spin compatibility with the frozen C2 step, not just tolerance.
    zero=RotatingCore(fct,RotationMap(c,lat,lon,zeros(3)));a=deepcopy(initial);b=deepcopy(initial)
    step!(zero,a,.1);step!(fct,b,.1);@test a.p==b.p&&a.W==b.W&&a.j==b.j&&a.time==b.time
    # Failure after first rotation half-step cannot commit any authoritative field.
    bad=deepcopy(initial);bad.j .*=1e10;before=deepcopy(bad)
    @test_throws StepRejected step!(m,bad,.1)
    @test bad.p==before.p&&bad.W==before.W&&bad.j==before.j&&bad.time==before.time
    bad=deepcopy(initial);bad.W[1]=-1;before=deepcopy(bad)
    @test_throws ArgumentError step!(m,bad,.1)
    @test bad.p==before.p&&bad.W==before.W&&bad.j==before.j&&bad.time==before.time
    @test_throws ArgumentError step!(m,deepcopy(initial),0.)
    @test_throws ArgumentError step!(m,deepcopy(initial),NaN)
    checkpoint=joinpath(OUT,ENV["ROT_RUN_NAME"]*"-checkpoint.bin")
    s=deepcopy(initial);step!(m,s,.1);save_checkpoint(checkpoint,m,s)
    c2,lat2,lon2=small_core();rebuilt=RotatingCore(FCTCore(ModalCore(c2)),RotationMap(c2,lat2,lon2,omega))
    @test identity_hash(rebuilt)==identity_hash(m)
    restored=load_checkpoint(checkpoint,rebuilt)
    for _ in 1:4;step!(m,s,.1);step!(rebuilt,restored,.1);end
    @test s.p==restored.p&&s.W==restored.W&&s.j==restored.j&&s.time==restored.time
    @test identity_hash(m)!=identity_hash(zero)
    @test_throws ArgumentError load_checkpoint(checkpoint,zero)
    write_result((passed=true,errors=errors,ratios=ratios,scope="independent dense full rotating acoustic operator"))
end
@testset "C5 atomic rotating acoustic and shared water" begin;main();end
