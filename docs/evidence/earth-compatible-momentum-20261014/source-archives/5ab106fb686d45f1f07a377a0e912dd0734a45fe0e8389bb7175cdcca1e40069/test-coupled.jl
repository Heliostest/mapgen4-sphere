include("common.jl")
include("dense-reference.jl")
include("coupled-core.jl")
using .CoupledCompatible
bitsequal(a,b)=reinterpret(UInt64,vec(a))==reinterpret(UInt64,vec(b))
same(a,b)=bitsequal(a.p,b.p)&&bitsequal(a.W,b.W)&&bitsequal(a.j,b.j)&&reinterpret(UInt64,a.time)==reinterpret(UInt64,b.time)
function main()
    c,lat,lon=small_core();rot=RotationMap(c,lat,lon,[.23,-.15,.42]);t=CompatibleTransport(rot,lat,lon)
    modal=ModalCore(c);m=CoupledCore(modal,t);linear=RotatingCore(FCTCore(modal),rot)
    n=length(lat);ne=length(c.prefFace);nl=length(c.ds);rng=MersenneTwister(75)
    p=c.pref.*(1 .+.01randn(rng,n));j=.08randn(rng,ne,nl)
    initial=State(p,mass(c,p).*.012,j,0.);a=deepcopy(initial);b=deepcopy(initial)
    step!(m,a,.1);step!(linear,b,.1)
    @test a.p==b.p&&a.W==b.W&&a.time==b.time
    @test norm(a.j-b.j)>1e-7
    get(ENV,"CMP_RED_ONLY","false")=="true"&&return
    zero=CoupledCore(modal,t;strength=0);a=deepcopy(initial);b=deepcopy(initial)
    step!(zero,a,.1);step!(linear,b,.1);@test same(a,b)
    # Independent semidiscrete ODE: dense Cartesian nodal N and full edge lift,
    # plus independently assembled linear pressure/Coriolis operator.
    B=zeros(n,ne)
    for e in 1:ne;B[c.g.from[e],e]=1;B[c.g.to[e],e]=-1;end
    D=B*Diagonal(c.g.edgeLength/c.g.radius);G=Diagonal(1 ./(c.g.radius*c.g.centerDistance))*B'
    Pforce=c.c2*Diagonal(c.prefFace)*G*Diagonal(1 ./c.pref);C=Matrix(rot.PJ*rot.R)
    function rhs(y)
        p=y[1:n];j=reshape(y[n+1:end],ne,nl);pdot=-(D*(j*c.ds))./c.g.area
        horizontal=-(B*((c.g.edgeLength/c.g.radius).*j.*transpose(c.ds)))
        vertical=zeros(n,nl+1)
        for k in 1:nl;vertical[:,k+1]=vertical[:,k]+horizontal[:,k]-c.g.area.*pdot*c.ds[k];end
        F=vcat(vec((c.g.edgeLength/c.g.radius).*j.*transpose(c.ds)),vec(vertical[:,2:nl]))
        nonlinear=dense_reference(t,F).L*vec(j)
        vcat(pdot,vec(Pforce*p .+ C*j)+nonlinear)
    end
    function reference(h)
        y=vcat(initial.p,vec(initial.j));steps=round(Int,.8/h)
        for _ in 1:steps
            k1=rhs(y);k2=rhs(y+h*k1/2);k3=rhs(y+h*k2/2);k4=rhs(y+h*k3)
            y+=h*(k1+2k2+2k3+k4)/6
        end
        y
    end
    exact=reference(.001);finer=reference(.0005)
    @test norm(exact-finer)<1e-10
    errors=[];balance=0.
    for dt in (.1,.05,.025,.0125)
        s=deepcopy(initial);e0=energy(m,s);loss=0.
        for _ in 1:round(Int,.8/dt);led=step!(m,s,dt);loss+=led.loss;end
        push!(errors,norm(vcat(s.p,vec(s.j))-finer))
        balance=max(balance,abs(energy(m,s)-e0+loss)/e0)
        @test maximum(abs,s.W./mass(m,s.p).-0.012)<1e-13
    end
    ratios=errors[1:end-1]./errors[2:end]
    @test all(>(1.7),ratios)
    @test balance<5e-12
    rest=State(1.1c.pref,mass(c,1.1c.pref).*.01,zeros(ne,nl),0.);saved=deepcopy(rest)
    step!(m,rest,.1);@test rest.p≈saved.p atol=1e-14;@test maximum(abs,rest.j)<1e-14
    for mode in (:pressure,:iteration,:water)
        bad=deepcopy(initial)
        mode==:pressure&&(bad.j.*=1e10);mode==:water&&(bad.W[1]=-1);before=deepcopy(bad)
        if mode==:water;@test_throws ArgumentError step!(m,bad,.1)
        else;@test_throws StepRejected step!(m,bad,.1;maxiter=mode==:iteration ? 1 : 400);end
        @test same(bad,before)
    end
    for dt in (0.,-1.,NaN,Inf);@test_throws ArgumentError step!(m,deepcopy(initial),dt);end
    s=deepcopy(initial);step!(m,s,.1);path=joinpath(OUT,ENV["CMP_RUN_NAME"]*"-checkpoint.bin");save_checkpoint(path,m,s)
    c2,la,lo=small_core();rebuilt=CoupledCore(ModalCore(c2),CompatibleTransport(RotationMap(c2,la,lo,rot.omega),la,lo))
    @test identity_hash(m)==identity_hash(rebuilt)
    restored=load_checkpoint(path,rebuilt)
    for _ in 1:4;step!(m,s,.1);step!(rebuilt,restored,.1);@test same(s,restored);end
    @test_throws ArgumentError load_checkpoint(path,zero)
    @test_throws ArgumentError CoupledCore(modal,t;strength=-.1)
    write_result((passed=true,errors=errors,ratios=ratios,referenceDifference=norm(exact-finer),maxEnergyBalance=balance,bitwiseRestart=true,zeroMatchesC5=true,rollback=true))
end
@testset "C7 complete split dynamics and shared water" begin;main();end
