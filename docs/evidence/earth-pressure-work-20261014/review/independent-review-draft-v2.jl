using LinearAlgebra, SparseArrays, Serialization, SHA, JSON3, Test, Random
const REPO=normpath(joinpath(@__DIR__,"../.."))
const DIR=joinpath(REPO,"docs/evidence/earth-pressure-work-20261014")
include(joinpath(DIR,"common.jl"))
include(joinpath(DIR,"pressure-core.jl"))
using .PressureWork
const SCRATCH=@__DIR__
const reviewfiles=["pressure-core.jl","test-energy.jl","test-step.jl","test-extremes.jl","protocol.md","common.jl"]
hashes()=Dict(f=>bytes2hex(sha256(read(joinpath(DIR,f)))) for f in reviewfiles)
const BEFORE=hashes()
write(joinpath(SCRATCH,"source-before.json"),JSON3.write(BEFORE))
function independent_core(;pscale=1.,c2=2.8,ds=[.07,.21,.72])
    a=[1.3,.9,2.2,1.7,1.1];f=[1,2,3,4,5,1,2,3];t=[2,3,4,5,1,3,4,5]
    d=[.6,.8,.5,.9,.7,1.1,1.2,1.3];l=[.4,.6,.5,.8,.6,.3,.4,.5]
    g=Geometry(a,f,t,l,d,1.7)
    c=TransportCore(g,pscale*[1.2,.8,1.4,.7,1.1],ds;c2=c2)
    PressureWorkCore(c)
end
bits(a,b)=reinterpret(UInt64,vec(a))==reinterpret(UInt64,vec(b))
same(a,b)=bits(a.p,b.p)&&bits(a.v,b.v)&&bits(a.W,b.W)&&reinterpret(UInt64,a.time)==reinterpret(UInt64,b.time)
function rhs(c,p,v)
    n=length(p);dp=zeros(n);dv=zeros(size(v));mu=c.c2*log.(p./c.pref)
    for e in eachindex(c.g.from)
        a,b=c.g.from[e],c.g.to[e];h=c.g.edgeLength[e]*c.g.centerDistance[e]
        for k in eachindex(c.ds)
            E=h*c.ds[k]*v[e,k]^2/4
            mu[a]+=E/c.g.area[a];mu[b]+=E/c.g.area[b]
        end
    end
    for e in eachindex(c.g.from)
        a,b=c.g.from[e],c.g.to[e]
        F=c.g.edgeLength[e]/c.g.radius*(p[a]+p[b])/2*sum(c.ds.*v[e,:])
        dp[a]-=F/c.g.area[a];dp[b]+=F/c.g.area[b]
        for k in eachindex(c.ds);dv[e,k]=(mu[a]-mu[b])/(c.g.radius*c.g.centerDistance[e]);end
    end
    dp,dv
end
function reference(c,p0,v0,dt,T)
    p=copy(p0);v=copy(v0)
    for k in 1:round(Int,T/dt)
        a,b=rhs(c,p,v);d,e=rhs(c,p+dt*a/2,v+dt*b/2);f,g=rhs(c,p+dt*d/2,v+dt*e/2);i,j=rhs(c,p+dt*f,v+dt*g)
        p+=dt*(a+2*d+2*f+i)/6;v+=dt*(b+2*e+2*g+j)/6
    end
    p,v
end
function big_residual(c,p0,v0,dt,y,p1anchor)
    # Each pressure derivative is anchored at the exact Float64 endpoint used by
    # production, avoiding a different cancellation when reconstructing p1.
    n=length(p0);L=length(c.ds);ne=size(v0,1);T=BigFloat;pp=T.(p1anchor);vv=T.(v0)
    yy=T.(y);A=T.(c.g.area);pref=T.(c.pref);ds=T.(c.ds);dtt=T(dt);cc=T(c.c2)
    v1=copy(vv)
    for e in 1:ne
        a,b=c.g.from[e],c.g.to[e]
        impulse=dtt*cc*(yy[n+a]-yy[n+b])/(T(c.g.radius)*T(c.g.centerDistance[e]))
        v1[e,:].+=impulse
    end
    mu=zeros(T,n)
    for i in 1:n
        p,old=pp[i],T(p0[i]);r=pref[i]
        mu[i]=cc*(p==old ? log(old/r) : (p*log(p/r)-p-old*log(old/r)+old)/(p-old))
    end
    rx=copy(yy[1:n])
    for e in 1:ne
        a,b=c.g.from[e],c.g.to[e];h=T(c.g.edgeLength[e])*T(c.g.centerDistance[e]);F=zero(T)
        for k in 1:L
            z=h*ds[k]*(vv[e,k]^2+v1[e,k]^2)/8
            mu[a]+=z/A[a];mu[b]+=z/A[b]
            F+=ds[k]*(T(p0[a])+T(p0[b])+pp[a]+pp[b])/4*(vv[e,k]+v1[e,k])/2
        end
        F*=dtt*T(c.g.edgeLength[e])/T(c.g.radius)
        rx[a]+=F/(A[a]*pref[a]);rx[b]-=F/(A[b]*pref[b])
    end
    vcat(rx,yy[n+1:2n]-mu/cc)
end
function derivative_oracle(c,p,v,dt,y)
    n=length(p);p1=p+c.pref.*y[1:n];h=big"1e-30";J=zeros(2n,2n)
    for i in 1:2n
        yp=BigFloat.(y);ym=copy(yp);yp[i]+=h;ym[i]-=h
        pp=BigFloat.(p1);pm=copy(pp)
        if i<=n;pp[i]+=BigFloat(c.pref[i])*h;pm[i]-=BigFloat(c.pref[i])*h;end
        J[:,i]=Float64.((big_residual(c,p,v,dt,yp,pp)-big_residual(c,p,v,dt,ym,pm))/(2h))
    end
    J
end
function main()
    rng=MersenneTwister(48392);m=independent_core();c=m.base;n=length(c.pref);ne=length(c.prefFace);L=length(c.ds)
    p=c.pref.*[1.04,.97,1.06,.94,1.02];v=.15randn(rng,ne,L)
    stats=Dict{String,Any}()
    @testset "independent C8 nonlinear, invariants and dense ODE" begin
        z=pressure_step(m,p,v,.075)
        @test z.equationP<2e-12&&z.equationV<2e-12
        backward=pressure_step(m,z.p,z.v,-.075)
        @test norm(backward.p-p)+norm(backward.v-v)<3e-12
        @test abs(dot(c.g.area,z.p-p))<2e-13
        @test norm((z.v[:,1]-z.v[:,3])-(v[:,1]-v[:,3]))<1e-14
        cyc=nullspace(Matrix(c.gradient'))
        @test norm(cyc'*(z.v-v))<1e-14
        pr,vr=reference(c,p,v,.00025,.3);pr2,vr2=reference(c,p,v,.000125,.3)
        dr=norm(pr-pr2)+norm(vr-vr2);@test dr<1e-11
        errs=[]
        for dt in (.075,.0375,.01875,.009375)
            a,b=copy(p),copy(v)
            for k in 1:round(Int,.3/dt);q=pressure_step(m,a,b,dt);a,b=q.p,q.v;end
            push!(errs,norm(a-pr2)+norm(b-vr2))
        end
        @test all(errs[1:3]./errs[2:4].>3.7)
        stats["ode"]=(referenceDifference=dr,errors=errs,ratios=errs[1:3]./errs[2:4])
        sweeps=[]
        for amplitude in (.01,.1,.6),dt in (.01,.1,.5,1.)
            pp=c.pref.*exp.(amplitude*[.3,-.8,.1,.5,-.2]);vv=amplitude*randn(rng,ne,L)
            q=pressure_step(m,pp,vv,dt)
            @test q.equationP<5e-12&&q.equationV<5e-12
            @test all(q.p.>0)
            push!(sweeps,(amplitude=amplitude,dt=dt,iterations=q.iterations,backtracks=q.backtracks))
        end
        stats["nonlinearSweeps"]=sweeps
    end
    @testset "independent BigFloat Jacobian" begin
        rows=[]
        for scale in (1e-100,1.,1e5,1e100),kind in ("near-boundary","broad-ratios")
            mm=independent_core(pscale=scale);cc=mm.base;pp=copy(cc.pref)
            ratio=kind=="near-boundary" ? [1.0101,.9899,1.03,.97,1.2] : [1e-8,.001,.05,7.,100.]
            yy=vcat(ratio.-1,.2randn(rng,n));vv=.2randn(rng,ne,L)
            _,J=PressureWork.residual_jacobian(mm,pp,vv,.3,yy)
            truth=derivative_oracle(cc,pp,vv,.3,yy)
            er=norm(Matrix(J)-truth)/norm(truth)
            maxer=maximum(abs.(Matrix(J)-truth)./max.(1.,abs.(truth)))
            @test er<5e-12&&maxer<5e-12
            push!(rows,(scale=scale,kind=kind,relative=er,maxScaled=maxer))
        end
        stats["jacobian"]=rows
    end
    @testset "invalid states, failures, identity and restart" begin
        s=BarotropicState(copy(p),mass(m,p)*.02,copy(v),.3);saved=deepcopy(s)
        for dt in (0.,-1.,Inf,NaN)
            @test_throws ArgumentError step!(m,s,dt)
            @test same(s,saved)
        end
        for limit in (0,-1,1.5)
            @test_throws ArgumentError step!(m,s,.1;maxiter=limit)
            @test same(s,saved)
        end
        @test_throws StepRejected step!(m,s,.1;maxiter=1)
        @test same(s,saved)
        for field in (:p,:W,:v,:time),value in (NaN,Inf)
            bad=deepcopy(s)
            field==:time ? (bad.time=value) : (getproperty(bad,field)[1]=value)
            before=deepcopy(bad)
            @test_throws ArgumentError step!(m,bad,.1)
            @test same(bad,before)
        end
        for code in (:negative_pressure,:negative_water,:over_water,:short_pressure,:wrong_velocity,:wrong_water)
            bad=deepcopy(s)
            code==:negative_pressure&&(bad.p[1]=-1.)
            code==:negative_water&&(bad.W[1]=-1.)
            code==:over_water&&(bad.W[1]=2mass(m,p)[1])
            code==:short_pressure&&(bad.p=bad.p[1:4])
            code==:wrong_velocity&&(bad.v=bad.v[:,1:2])
            code==:wrong_water&&(bad.W=bad.W[1:4,:])
            before=deepcopy(bad)
            @test_throws ArgumentError step!(m,bad,.1)
            @test same(bad,before)
        end
        cp=joinpath(SCRATCH,"independent-checkpoint.bin");save_checkpoint(cp,m,s)
        rebuilt=independent_core();loaded=load_checkpoint(cp,rebuilt)
        @test same(s,loaded)
        @test s.p !== loaded.p&&s.v !== loaded.v&&s.W !== loaded.W
        ids=[]
        for key in (:pref,:ds,:c2,:G,:h,:S,:area,:radius)
            changed=key==:c2 ? independent_core(c2=2.81) : deepcopy(m)
            key==:pref&&(changed.base.pref[1]*=1.001)
            key==:ds&&(changed.base.ds[1]+=.01;changed.base.ds[2]-=.01)
            key==:G&&(changed.base.gradient[1,1]+=1e-10)
            key==:h&&(changed.h[1]*=1.001)
            key==:S&&(changed.S[1,1]*=1.001)
            key==:area&&(changed.base.g.area[1]*=1.001)
            if key==:radius
                g=changed.base.g;gg=Geometry(g.area,g.from,g.to,g.edgeLength,g.centerDistance,g.radius+1e-6)
                changed=PressureWorkCore(TransportCore(gg,changed.base.pref,changed.base.ds;c2=changed.base.c2))
            end
            @test identity_hash(changed)!=identity_hash(m)
            @test_throws ArgumentError load_checkpoint(cp,changed)
            push!(ids,string(key))
        end
        for k in 1:5;step!(m,s,.05);step!(rebuilt,loaded,.05);end
        @test same(s,loaded)
        stats["checkpointIdentityVariants"]=ids
    end
    # Inject only inside this scratch Julia process. Specialized method executes
    # the real transport to completion before raising a late failure.
    @eval FluxCorrectedTransport begin
        const reviewCalls=Ref(0)
        const reviewMode=Ref(:throw)
        function transport_fct(oldmass::Matrix{Float64},newmass::Matrix{Float64},from::Vector{Int},to::Vector{Int},F::Vector{Float64},water::Matrix{Float64};centered_solver=:iterative)
            answer=invoke(transport_fct,Tuple{Any,Any,Any,Any,Any,Any},oldmass,newmass,from,to,F,water;centered_solver=centered_solver)
            reviewCalls[]+=1
            reviewMode[]==:throw&&throw(StepRejected("independent injected late water failure"))
            reviewMode[]==:nan ? merge(answer,(localWaterRelativeResidual=NaN,)) : merge(answer,(localWaterRelativeResidual=1e-5,))
        end
    end
    @testset "late water failure atomicity" begin
        for mode in (:throw,:nan,:large)
            FluxCorrectedTransport.reviewMode[]=mode
            s=BarotropicState(copy(p),mass(m,p)*.02,copy(v),0.);saved=deepcopy(s)
            @test_throws StepRejected step!(m,s,.1)
            @test same(s,saved)
        end
        @test FluxCorrectedTransport.reviewCalls[]==3
        stats["lateWaterFailureModes"]=["throw-after-real-solve","NaN-water-residual","excessive-water-residual"]
    end
    after=hashes();@test BEFORE==after
    write(joinpath(SCRATCH,"source-after.json"),JSON3.write(after))
    stats["sourceHashes"]=after;stats["passed"]=true
    write(joinpath(SCRATCH,"independent-review-results.json"),JSON3.write(stats))
    println(JSON3.write(stats))
end
main()
