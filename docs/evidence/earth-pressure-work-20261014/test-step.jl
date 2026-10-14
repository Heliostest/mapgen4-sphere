include("common.jl")
include("pressure-core.jl")
using .PressureWork
function reference_rhs(c,p,v)
    # Explicit dense incidence and independent loops, not the solver gradient helper.
    n=length(p);ne=length(c.prefFace);B=zeros(n,ne);G=zeros(ne,n);h=c.g.edgeLength.*c.g.centerDistance
    for e in 1:ne
        a,b=c.g.from[e],c.g.to[e];B[a,e]=1;B[b,e]=-1
        G[e,a]=1/(c.g.radius*c.g.centerDistance[e]);G[e,b]=-G[e,a]
    end
    D=G'*Diagonal(h);pf=[(p[c.g.from[e]]+p[c.g.to[e]])/2 for e in 1:ne]
    mu=c.c2*log.(p./c.pref)
    for e in 1:ne,k in eachindex(c.ds),a in (c.g.from[e],c.g.to[e])
        mu[a]+=h[e]*c.ds[k]*v[e,k]^2/(4c.g.area[a])
    end
    -(D*(pf.*(v*c.ds)))./c.g.area,repeat(G*mu,1,length(c.ds))
end
function rk4(c,p,v,h,steps)
    p=copy(p);v=copy(v)
    for _ in 1:steps
        a,b=reference_rhs(c,p,v);d,e=reference_rhs(c,p+h*a/2,v+h*b/2)
        f,g=reference_rhs(c,p+h*d/2,v+h*e/2);i,j=reference_rhs(c,p+h*f,v+h*g)
        p+=h*(a+2*d+2*f+i)/6;v+=h*(b+2*e+2*g+j)/6
    end
    p,v
end
function main()
    c,_,_=small_core(ds=[.013,.187,.8]);m=PressureWorkCore(c);rng=MersenneTwister(802)
    p=c.pref.*(1 .+.04randn(rng,6));v=.08randn(rng,15,3);dt=.1
    result=pressure_step(m,p,v,dt)
    d=discrete_gradient(m,p,result.p,v,result.v)
    @test norm(result.p-p+dt*(c.divergence*(d.flux*c.ds))./c.g.area)<2e-13
    @test norm(result.v-v.-dt*(c.gradient*d.mu))<2e-13
    @test norm(result.p-p)>1e-4
    if get(ENV,"PW_RED_ONLY","false")=="true";return;end
    @test abs(energies(m,result.p,result.v).total-energies(m,p,v).total)<2e-13
    # Omitting any analytic Jacobian block must fail this independent derivative check.
    x=.003randn(rng,6);eta=.03randn(rng,6);y=vcat(x,eta)
    r,J=PressureWork.residual_jacobian(m,p,v,dt,y;jacobian=true)
    fd=zeros(12,12);h=1e-6
    for i in 1:12
        shift=zeros(12);shift[i]=h
        rp,_=PressureWork.residual_jacobian(m,p,v,dt,y+shift;jacobian=false)
        rm,_=PressureWork.residual_jacobian(m,p,v,dt,y-shift;jacobian=false)
        fd[:,i]=(rp-rm)/(2h)
    end
    jacobianError=norm(Matrix(J)-fd)/norm(fd);@test jacobianError<2e-9
    pr,vr=rk4(c,p,v,.0005,800);pr2,vr2=rk4(c,p,v,.00025,1600)
    referenceDifference=norm(pr-pr2)+norm(vr-vr2);@test referenceDifference<1e-10
    errors=[]
    for h in (.1,.05,.025,.0125)
        a,b=copy(p),copy(v)
        for _ in 1:round(Int,.4/h);q=pressure_step(m,a,b,h);a,b=q.p,q.v;end
        push!(errors,norm(a-pr2)+norm(b-vr2))
    end
    ratios=errors[1:3]./errors[2:4];@test all(ratios.>3.5)
    bits(a,b)=reinterpret(UInt64,vec(a))==reinterpret(UInt64,vec(b))
    same(a,b)=bits(a.p,b.p)&&bits(a.v,b.v)&&bits(a.W,b.W)&&reinterpret(UInt64,a.time)==reinterpret(UInt64,b.time)
    s=BarotropicState(copy(p),mass(m,p)*.012,copy(v),0.);saved=deepcopy(s)
    @test_throws StepRejected step!(m,s,.1;maxiter=1)
    @test same(s,saved)
    @test_throws ArgumentError step!(m,s,0.)
    @test_throws ArgumentError step!(m,s,Inf)
    @test same(s,saved)
    ledger=step!(m,s,.1)
    @test maximum(abs,s.W./mass(m,s.p).- .012)<1e-13
    @test ledger.localAirRelativeResidual<5e-12&&ledger.localWaterRelativeResidual<5e-12&&ledger.localDryRelativeResidual<5e-12
    path=joinpath(OUT,ENV["PW_RUN_NAME"]*"-checkpoint.bin");save_checkpoint(path,m,s)
    rebuilt=PressureWorkCore(small_core(ds=[.013,.187,.8])[1]);resumed=load_checkpoint(path,rebuilt)
    for _ in 1:4;step!(m,s,.05);step!(rebuilt,resumed,.05);end
    @test same(s,resumed)
    altered=PressureWorkCore(small_core(ds=[.013,.187,.8],c2=3.01)[1]);@test_throws ArgumentError load_checkpoint(path,altered)
    rest=[]
    for ratio in (1.,1.03,pi),amplitude in (0.,1e-8,1e-12,1e-14)
        pp=ratio*c.pref.*(1 .+amplitude*collect(1:6));vv=amplitude*ones(15,3)
        z=BarotropicState(pp,mass(m,pp)*.012,vv,0.);l=step!(m,z,.1)
        @test all(z.p.>0)&&all(isfinite,z.v)
        @test maximum(abs,z.W./mass(m,z.p).- .012)<1e-13
        @test l.energyAbsolute<=l.energyAllowance
        push!(rest,(ratio=ratio,amplitude=amplitude,absolute=l.energyAbsolute,allowance=l.energyAllowance))
    end
    write_result((passed=true,jacobianError=jacobianError,referenceDifference=referenceDifference,errors=errors,ratios=ratios,bitwiseRestart=true,rollback=true,rest=rest))
end
@testset "C8 nonlinear pressure work and atomic shared water" begin;main();end
