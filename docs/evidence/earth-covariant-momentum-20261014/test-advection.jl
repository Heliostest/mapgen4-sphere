include("common.jl")
include("advection-core.jl")
using .NonlinearAdvection
function fixture()
    x=[1. 1. 1.;1. -1. -1.;-1. 1. -1.;-1. -1. 1.]/sqrt(3)
    lat=asin.(x[:,3]);lon=atan.(x[:,2],x[:,1]);a=[1,1,1,2,2,3];b=[2,3,4,3,4,4]
    graph=(area=fill(pi,4),from=a,to=b,conductance=fill(.15,6),distance=fill(acos(-1/3),6))
    c=graph_core(graph,[1.,1.1,.9,1.05],[.3,.7]);m=AdvectionCore(c,lat,lon)
    vel=[.5 .2;-.2 .3;.1 -.4;.3 .1;-.1 -.2;.4 .1;-.3 -.1;.2 .3]
    s=AdvectiveState(copy(c.pref),mass(c,c.pref).*reshape(collect(.01:.01:.08),4,2),vel,0.)
    m,s,lat,lon
end
same(a,b)=a.p==b.p&&a.W==b.W&&a.velocity==b.velocity&&a.time==b.time
function main()
    m,s,lat,lon=fixture();before=deepcopy(s);c=m.base;dt=.2;n=length(s.p)
    vn=m.wind.east*reshape(s.velocity[:,1],n,:)+m.wind.north*reshape(s.velocity[:,2],n,:)
    j=vn.*ifelse.(vn.>=0,s.p[c.g.from],s.p[c.g.to])
    expectedP=s.p-dt*(c.divergence*(j*c.ds))./c.g.area
    step!(m,s,dt)
    @test s.p≈expectedP rtol=2e-14
    @test s.velocity!=before.velocity
    @test s.time==dt
    @test sum(s.W)≈sum(before.W) rtol=2e-13
    # Complete tests below also exercise the implementation after the RED run.
    get(ENV,"MOM_RED_ONLY","false")=="true"&&return
    @test energy(m,s)<energy(m,before)
    rebuilt=AdvectionCore(graph_core((area=c.g.area,from=c.g.from,to=c.g.to,conductance=c.g.edgeLength./c.g.centerDistance,distance=c.g.centerDistance),c.pref,c.ds),lat,lon)
    @test identity_hash(m)==identity_hash(rebuilt)
    file=joinpath(OUT,ENV["MOM_RUN_NAME"]*"-checkpoint.bin")
    save_checkpoint(file,m,s);restored=load_checkpoint(file,rebuilt)
    for _ in 1:4;step!(m,s,dt);step!(rebuilt,restored,dt);@test same(s,restored);end
    modified=AdvectionCore(c,lat,lon.+.1)
    @test_throws ArgumentError load_checkpoint(file,modified)
    for invalid in (0.,-1.,NaN,Inf)
        copy=deepcopy(s);@test_throws ArgumentError step!(m,s,invalid);@test same(s,copy)
    end
    bad=deepcopy(before);bad.velocity.*=1e6;copy=deepcopy(bad)
    @test_throws StepRejected step!(m,bad,dt)
    @test same(bad,copy)
    copy=deepcopy(before)
    @test_throws StepRejected step!(m,before,dt;momentum_maxiter=1)
    @test same(before,copy)
    q=.012;s=deepcopy(before);s.W=mass(c,s.p).*q;step!(m,s,dt)
    @test maximum(abs,s.W./mass(c,s.p).-q)<1e-13
    # Independent infinitesimal mass and velocity derivative checks.
    h=1e-6;small=deepcopy(before);f=shared_transfers(c,before.p,expectedP,dt*j)
    exact=velocity_tendency(m.connection,vec(f.oldmass),f.transfer/dt,before.velocity)
    step!(m,small,h)
    @test norm((small.velocity-before.velocity)/h-exact)<1e-6*norm(exact)
    write_result((passed=true,pressureDelta=norm(expectedP-before.p),restartBitwise=true,rollback=true))
end
@testset "C6 nonlinear shared momentum/water step" begin;main();end
