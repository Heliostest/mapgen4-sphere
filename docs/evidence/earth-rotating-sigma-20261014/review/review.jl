using LinearAlgebra, SparseArrays, Random, Test, SHA, Serialization, JSON3
include("../../docs/evidence/earth-rotating-sigma-20261014/common.jl")
include("../../docs/evidence/earth-rotating-sigma-20261014/vector-core.jl")
using .VectorInvariant

# Independent Cartesian reconstruction and oriented incidence calculation.
# This intentionally does not include dense-reference.jl or call candidate RHS.
function fixture(;ds=[.07,.19,.31,.43], pref=nothing, reverseEdges=false)
    lat=[-.91,-.63,-.24,.03,.32,.52,.81,1.1]
    lon=[.17,1.14,2.56,4.12,5.75,2.04,4.91,.78]
    x=hcat(cos.(lat).*cos.(lon),cos.(lat).*sin.(lon),sin.(lat))
    from=Int[];to=Int[];dist=Float64[];len=Float64[]
    for i=1:8,j=i+1:8
        d=acos(clamp(dot(x[i,:],x[j,:]),-1,1))
        push!(from,reverseEdges&&iseven(length(from)) ? j : i)
        push!(to,from[end]==i ? j : i)
        push!(dist,d);push!(len,(.12+.006length(from))*d)
    end
    area=[1.21,1.83,.94,2.17,1.08,1.46,1.73,.88]
    pr=pref===nothing ? 1.2 .+.15x[:,1] : pref
    g=Geometry(area,from,to,len,dist,1.7)
    c=TransportCore(g,pr,ds;c2=2.4)
    VectorCore(PressureWorkCore(c),lat,lon,[.019,-.027,.041])
end
function independent(m,p,v)
    c=m.pressure.base;g=c.g;n=length(p);ne,nl=size(v)
    x=hcat(cos.(m.lat).*cos.(m.lon),cos.(m.lat).*sin.(m.lon),sin.(m.lat))
    h=g.edgeLength.*g.centerDistance;A=g.area;H=zeros(ne);K=zeros(n,nl)
    U=zeros(n,3,nl);T=zeros(ne,2,3)
    for e=1:ne
        a,b=g.from[e],g.to[e];H[e]=h[e]*(p[a]+p[b])/2
        chord=x[b,:]-x[a,:]
        for (side,i) in enumerate((a,b))
            T[e,side,:]=(chord-dot(chord,x[i,:])*x[i,:])/(2g.centerDistance[e])
            for k=1:nl
                U[i,:,k]+=H[e]*v[e,k]*T[e,side,:]/(A[i]*p[i])
                K[i,k]+=h[e]*v[e,k]^2/(4A[i])
            end
        end
    end
    curl=zeros(n,nl);L=zeros(n,nl)
    for e=1:ne,k=1:nl
        a,b=g.from[e],g.to[e];out=0.
        for (side,i) in enumerate((a,b))
            out+=dot(T[e,side,:],-cross(x[i,:],U[i,:,k]))
        end
        alpha=g.edgeLength[e]/g.radius
        curl[a,k]+=alpha*out/A[a];curl[b,k]-=alpha*out/A[b]
        rate=alpha*(p[a]+p[b])/2*v[e,k]*c.ds[k]
        L[a,k]+=rate;L[b,k]-=rate
    end
    pdot=-vec(sum(L;dims=2))./A;F=zeros(n,nl+1)
    for i=1:n,k=1:nl
        F[i,k+1]=F[i,k]-L[i,k]-A[i]*c.ds[k]*pdot[i]
    end
    rot=zeros(ne,nl);vort=zeros(ne,nl);vert=zeros(ne,nl);grad=zeros(ne,nl);press=zeros(ne,nl)
    Kbar=K*c.ds
    for e=1:ne
        a,b=g.from[e],g.to[e];d=g.radius*g.centerDistance[e]
        for k=1:nl
            for (side,i) in enumerate((a,b))
                clockwise=-cross(x[i,:],U[i,:,k])
                rot[e,k]+=dot(T[e,side,:],2dot(m.omega,x[i,:])*clockwise)
                vort[e,k]+=dot(T[e,side,:],curl[i,k]*clockwise)
            end
            grad[e,k]=((K[a,k]-Kbar[a])-(K[b,k]-Kbar[b]))/d
            press[e,k]=(c.c2*log((p[a]/c.pref[a])/(p[b]/c.pref[b]))+Kbar[a]-Kbar[b])/d
        end
        for k=1:nl-1
            q=h[e]*(F[a,k+1]/A[a]+F[b,k+1]/A[b])/2
            vert[e,k]+=q*(v[e,k]-v[e,k+1])/(2H[e]*c.ds[k])
            vert[e,k+1]+=q*(v[e,k]-v[e,k+1])/(2H[e]*c.ds[k+1])
        end
    end
    (pdot=pdot,vdot=press+rot+vort+grad+vert,total=rot+vort+grad+vert,
     rotation=rot,vorticity=vort,vertical=vert,layerGradient=grad,curl=curl,verticalFlux=F,
     H=H,K=K,pressure=press)
end
function rk4(m,p,v,h,steps)
    p=copy(p);v=copy(v)
    for k=1:steps
        a=independent(m,p,v);b=independent(m,p+h/2*a.pdot,v+h/2*a.vdot)
        c=independent(m,p+h/2*b.pdot,v+h/2*b.vdot);d=independent(m,p+h*c.pdot,v+h*c.vdot)
        p+=h/6*(a.pdot+2b.pdot+2c.pdot+d.pdot)
        v+=h/6*(a.vdot+2b.vdot+2c.vdot+d.vdot)
    end
    p,v
end
bits(a,b)=reinterpret(UInt64,vec(a))==reinterpret(UInt64,vec(b))
same(a,b)=bits(a.p,b.p)&&bits(a.v,b.v)&&bits(a.W,b.W)&&reinterpret(UInt64,a.time)==reinterpret(UInt64,b.time)
function main()
    Random.seed!(96413);m=fixture();c=m.pressure.base
    p=c.pref.*exp.(.27sin.(1:8));v=.17randn(28,4)
    rows=[]
    @testset "Cartesian RHS, orientation, metrics, invariance" begin
        for a in (.002,.17,.9), q in (.01,1.,97.)
            pp=q*p;vv=(a/.17)*v;r=independent(m,pp,vv);z=neutral_tendency(m,pp,vv)
            for field in (:total,:rotation,:vorticity,:vertical,:layerGradient,:curl,:verticalFlux)
                @test norm(getproperty(r,field)-getproperty(z,field))<5e-13*max(norm(getproperty(r,field)),1.)
            end
            work(x)=sum(r.H.*vv.*x.*transpose(c.ds))
            scale=sum(r.H.*abs.(vv).*abs.(r.total).*transpose(c.ds))
            @test abs(work(r.rotation))<1e-13*scale
            @test abs(work(r.vorticity))<1e-13*scale
            @test abs(work(r.vertical)+work(r.layerGradient))<1e-13*scale
            @test abs(work(r.vertical))>1e-5*scale
            eprime=work(r.vdot)+dot(c.g.area.*(r.K*c.ds+c.c2*log.(pp./c.pref)),r.pdot)
            @test abs(eprime)<1e-12*sum(c.g.area.*abs.(r.pdot))
            push!(rows,(amplitude=a,pressureScale=q,rhsError=norm(r.total-z.total),energyDerivative=eprime,verticalWork=work(r.vertical),gradientWork=work(r.layerGradient)))
        end
        z=neutral_tendency(m,p,v)
        @test norm(neutral_tendency(fixture(;pref=11c.pref),p,v).total-z.total)==0
        @test norm(neutral_tendency(m,7p,v).total-z.total)<1e-14
        rev=fixture(;ds=reverse(c.ds));zr=neutral_tendency(rev,p,reverse(v;dims=2))
        @test norm(reverse(zr.total;dims=2)-z.total)<1e-14
        @test norm(zr.verticalFlux+reverse(z.verticalFlux;dims=2))<1e-14
        edge=fixture(;reverseEdges=true);sg=[edge.pressure.base.g.from[e]==c.g.from[e] ? 1. : -1. for e=1:28]
        ze=neutral_tendency(edge,p,sg.*v)
        @test norm(ze.total-sg.*z.total)<1e-14
        @test norm(ze.curl-z.curl)<1e-14
        equal=repeat(v[:,1:1],1,4);equalz=neutral_tendency(m,p,equal)
        @test norm(equalz.vertical)<1e-14
        @test norm(equalz.layerGradient)<1e-14
        @test norm(equalz.rotation)>1e-5
    end
    initial=BarotropicState(copy(p),mass(m,p).*.01,copy(v),0.)
    temporal=Any[];referenceGap=0.
    @testset "Independent RK4 and midpoint" begin
        pa,va=rk4(m,p,v,.001,240);pb,vb=rk4(m,p,v,.0005,480)
        distance(pp,vv,pr,vr)=sqrt(sum(((pp-pr)./c.pref).^2)+sum((vv-vr).^2)/c.c2)
        referenceGap=distance(pa,va,pb,vb);@test referenceGap<1e-11
        for h in (.06,.03,.015,.0075)
            s=deepcopy(initial)
            for i=1:round(Int,.24/h);step!(m,s,h);end
            push!(temporal,(dt=h,error=distance(s.p,s.v,pb,vb),energyRelative=abs(energy(m,s)/energy(m,initial)-1)))
            @test temporal[end].energyRelative<1e-12
        end
        @test all(temporal[i].error/temporal[i+1].error>3.8 for i=1:3)
        one=neutral_step(m,p,v,.11);back=neutral_step(m,p,one.v,-.11)
        @test norm(v-back.v)/norm(v)<1e-13
        @test norm(one.v-v-.11independent(m,p,(one.v+v)/2).total)/norm(v)<1e-13
    end
    @testset "Rest, invalid input, checkpoints, rollback" begin
        for ratio in (1.,sqrt(2.)),amp in (0.,1e-12,1e-100)
            pp=ratio*c.pref;vv=amp*v;s=BarotropicState(pp,mass(m,pp).*.01,vv,0.)
            l=step!(m,s,.02);@test l.completeEnergyAbsolute<=l.completeEnergyAllowance
            @test all(isfinite,s.p)&&all(isfinite,s.v)
        end
        for opts in ((maxiter=1,),(pressure_maxiter=1,))
            s=deepcopy(initial);before=deepcopy(s);@test_throws StepRejected step!(m,s,.5;opts...);@test same(s,before)
        end
        for dt in (0.,-1.,Inf,NaN)
            s=deepcopy(initial);before=deepcopy(s);@test_throws ArgumentError step!(m,s,dt);@test same(s,before)
        end
        for bad in (:negativeP,:nanV,:invalidW,:time)
            s=deepcopy(initial);bad==:negativeP&&(s.p[1]=-1);bad==:nanV&&(s.v[1]=NaN)
            bad==:invalidW&&(s.W[1]=Inf);bad==:time&&(s.time=Inf)
            before=deepcopy(s);@test_throws ArgumentError step!(m,s,.02);@test same(s,before)
        end
        path="build/c9-independent-review/checkpoint.bin";s=deepcopy(initial);step!(m,s,.025)
        save_checkpoint(path,m,s);rebuilt=fixture();r=load_checkpoint(path,rebuilt);@test same(s,r)
        for k=1:4;step!(m,s,.025);step!(rebuilt,r,.025);@test same(s,r);end
        altered=fixture(;ds=[.07,.19,.32,.42]);@test_throws ArgumentError load_checkpoint(path,altered)
        altered=fixture();altered.omega[1]+=1e-8;@test_throws ArgumentError load_checkpoint(path,altered)
    end
    write("build/c9-independent-review/results.json",JSON3.write((passed=true,rows=rows,referenceGap=referenceGap,temporal=temporal)))
end
main()
