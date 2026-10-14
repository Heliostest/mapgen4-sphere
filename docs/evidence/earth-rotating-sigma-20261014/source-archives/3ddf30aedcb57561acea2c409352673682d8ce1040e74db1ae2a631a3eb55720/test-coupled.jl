include("common.jl")
include("vector-core.jl")
include("dense-reference.jl")
using .VectorInvariant
bits(a,b)=reinterpret(UInt64,vec(a))==reinterpret(UInt64,vec(b))
same(a,b)=bits(a.p,b.p)&&bits(a.v,b.v)&&bits(a.W,b.W)&&reinterpret(UInt64,a.time)==reinterpret(UInt64,b.time)
function main()
    Random.seed!(9073);c,lat,lon=small_core(;ds=[.12,.33,.55]);pw=PressureWorkCore(c);omega=[.03,-.05,.07]
    m=VectorCore(pw,lat,lon,omega);p=c.pref.*exp.(.08cos.(1:6));v=.07randn(15,3)
    initial=BarotropicState(p,mass(pw,p)*.012,v,0.)
    a=neutral_step(m,p,v,.07);s=deepcopy(initial);led=step!(m,s,.04)
    @test norm(a.v-v)>1e-6
    @test s.time==.04
    @test norm(s.p-p)>1e-6
    @test norm(s.v-v)>1e-6
    if get(ENV,"VC_RED_ONLY","false")=="true";write_result((passed=false,stage="missing midpoint and coupled update"));return;end
    @test led.completeEnergyAbsolute<=led.completeEnergyAllowance
    @test maximum(abs,s.W./mass(m,s.p).- .012)<2e-15
    @test maximum((led.localAirRelativeResidual,led.localWaterRelativeResidual,led.localDryRelativeResidual))<5e-12
    back=neutral_step(m,p,a.v,-.07)
    @test norm(back.v-v)/norm(v)<3e-13
    midpoint=(v+a.v)/2;equation=a.v-v-.07oracle(c,lat,lon,omega,p,midpoint).total
    @test norm(equation)/norm(v)<3e-13
    @test abs(energies(pw,p,a.v).kinetic-energies(pw,p,v).kinetic)<2e-13*energies(pw,p,v).kinetic
    @test bits(neutral_step(m,p,v,0.).v,v)
    refp,refv=reference_rk4(c,lat,lon,omega,p,v,.0005,400)
    finep,finev=reference_rk4(c,lat,lon,omega,p,v,.00025,800)
    distance(pa,va,pb,vb)=sqrt(sum(((pa-pb)./c.pref).^2)+sum((va-vb).^2)/c.c2)
    discrepancy=distance(refp,refv,finep,finev);@test discrepancy<1e-10
    errors=[]
    for dt in (.05,.025,.0125,.00625)
        t=deepcopy(initial)
        for _ in 1:round(Int,.2/dt);step!(m,t,dt);end
        push!(errors,distance(t.p,t.v,finep,finev))
        @test abs(energy(m,t)-energy(m,initial))<2e-11*energy(m,initial)
    end
    ratios=errors[1:end-1]./errors[2:end];@test all(ratios.>3.5)
    rest=[]
    for ratio in (1.,1.03,pi),amp in (0.,1e-8,1e-12,1e-14)
        pp=ratio*c.pref;vv=amp*randn(size(v));t=BarotropicState(pp,mass(m,pp)*.012,vv,0.)
        r=step!(m,t,.05);@test r.completeEnergyAbsolute<=r.completeEnergyAllowance
        push!(rest,(ratio=ratio,amplitude=amp,absolute=r.completeEnergyAbsolute,allowance=r.completeEnergyAllowance))
    end
    for dt in (0.,-.1,NaN,Inf),which in (:neutral,:coupled)
        t=deepcopy(initial);before=deepcopy(t)
        if which==:neutral&&dt==0.;continue;end
        if which==:neutral&&dt<0;@test all(isfinite,neutral_step(m,p,v,dt).v);continue;end
        @test_throws ArgumentError which==:neutral ? neutral_step(m,t.p,t.v,dt) : step!(m,t,dt)
        @test same(t,before)
    end
    for bad in (:pressure,:velocity,:water,:time)
        t=deepcopy(initial)
        bad==:pressure&&(t.p[1]=-1);bad==:velocity&&(t.v[1]=NaN);bad==:water&&(t.W[1]=Inf);bad==:time&&(t.time=Inf)
        before=deepcopy(t);@test_throws ArgumentError step!(m,t,.05);@test same(t,before)
    end
    for opts in ((maxiter=1,),(pressure_maxiter=1,))
        t=deepcopy(initial);before=deepcopy(t);@test_throws StepRejected step!(m,t,.1;opts...);@test same(t,before)
    end
    @test_throws ArgumentError neutral_step(m,p,v,.1;maxiter=0)
    @test_throws ArgumentError VectorCore(pw,lat,lon,[NaN,0.,0.])
    @test_throws ArgumentError VectorCore(pw,lat,lon,[1.,0.])
    checkpoint=joinpath(OUT,ENV["VC_RUN_NAME"]*"-checkpoint.bin");save_checkpoint(checkpoint,m,s)
    rebuilt=VectorCore(PressureWorkCore(deepcopy(c)),copy(lat),copy(lon),copy(omega));t=load_checkpoint(checkpoint,rebuilt)
    @test same(s,t)
    for _ in 1:4;step!(m,s,.025);step!(rebuilt,t,.025);@test same(s,t);end
    bad=VectorCore(pw,lat,lon,omega+[0.,0.,1e-8]);@test_throws ArgumentError load_checkpoint(checkpoint,bad)
    bad=VectorCore(pw,lat,lon,omega);bad.east.nzval[1]+=1e-8;@test_throws ArgumentError load_checkpoint(checkpoint,bad)
    write_result((passed=true,referenceDiscrepancy=discrepancy,errors=errors,ratios=ratios,rest=rest,bitwiseRestart=true,rollback=true,midpointEquation=norm(equation)/norm(v)))
end
@testset "C9 coupled rotating sigma dynamics" begin;main();end
