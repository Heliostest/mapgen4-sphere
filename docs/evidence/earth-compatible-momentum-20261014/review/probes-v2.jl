include("../../docs/evidence/earth-compatible-momentum-20261014/common.jl")
include("../../docs/evidence/earth-compatible-momentum-20261014/coupled-core.jl")
using .CoupledCompatible

const DIR=@__DIR__
const SOURCES=["common.jl","transport-core.jl","coupled-core.jl","dense-reference.jl","test-transport.jl","test-coupled.jl","test-covariance.jl","analytic.jl","native-run.jl","compare-time.jl","run.mjs"]
hashes()=Dict(f=>bytes2hex(sha256(read(joinpath("docs/evidence/earth-compatible-momentum-20261014",f)))) for f in SOURCES)
beforehash=hashes()
samebits(a,b)=reinterpret(UInt64,a.p)==reinterpret(UInt64,b.p)&&reinterpret(UInt64,vec(a.j))==reinterpret(UInt64,vec(b.j))&&reinterpret(UInt64,vec(a.W))==reinterpret(UInt64,vec(b.W))&&reinterpret(UInt64,a.time)==reinterpret(UInt64,b.time)

function independent(c,lat,lon,F)
    n=length(lat);nl=length(c.ds);ne=length(c.g.from)
    x=hcat(cos.(lat).*cos.(lon),cos.(lat).*sin.(lon),sin.(lat))
    e=hcat(-sin.(lon),cos.(lon),zeros(n));v=hcat(-sin.(lat).*cos.(lon),-sin.(lat).*sin.(lon),cos.(lat))
    P=zeros(ne,2n)
    for k in 1:ne
        a,b=c.g.from[k],c.g.to[k];delta=x[b,:]-x[a,:]
        for t in (a,b)
            P[k,t]=c.pref[t]*dot(delta,e[t,:])/(2c.g.centerDistance[k])
            P[k,t+n]=c.pref[t]*dot(delta,v[t,:])/(2c.g.centerDistance[k])
        end
    end
    P=kron(Matrix{Float64}(I,nl,nl),P)
    H=vec((c.g.edgeLength.*c.g.centerDistance./c.prefFace)*c.ds')
    M=reduce(vcat,[repeat(c.g.area.*c.pref*c.ds[k],2) for k in 1:nl])
    R=Diagonal(1 ./M)*P'*Diagonal(H)
    a=vcat([c.g.from.+n*(k-1) for k in 1:nl]...,[collect(1:n).+n*(k-1) for k in 1:nl-1]...)
    b=vcat([c.g.to.+n*(k-1) for k in 1:nl]...,[collect(1:n).+n*k for k in 1:nl-1]...)
    idx(t,q)=2n*div(t-1,n)+mod(t-1,n)+1+(q-1)*n
    N=zeros(2n*nl,2n*nl)
    losses=[]
    for k in eachindex(F)
        aa,bb=F[k]>=0 ? (a[k],b[k]) : (b[k],a[k]);f=abs(F[k]);na=mod(aa-1,n)+1;nb=mod(bb-1,n)+1
        axis=cross(x[na,:],x[nb,:]);s=norm(axis);angle=atan(s,dot(x[na,:],x[nb,:]))
        Q=Matrix{Float64}(I,3,3)
        if s>1e-14
            axis/=s;K=[0. -axis[3] axis[2];axis[3] 0. -axis[1];-axis[2] axis[1] 0.]
            Q=cos(angle)*I+(1-cos(angle))*(axis*axis')+sin(angle)*K
        end
        T=hcat(e[nb,:],v[nb,:])'*Q*hcat(e[na,:],v[na,:])
        ia=[idx(aa,q) for q in 1:2];ib=[idx(bb,q) for q in 1:2]
        N[ia,ia]-=f/2*I;N[ib,ib]-=f/2*I;N[ib,ia]+=f*T
        push!(losses,(ia,ib,f,T))
    end
    (P=P,R=R,M=M,H=H,N=N,L=P*Diagonal(1 ./M)*N*R,losses=losses)
end

function main()
    c,lat,lon=small_core(ds=[.013,.187,.8]);r=RotationMap(c,lat,lon,[.17,-.21,.31]);t=CompatibleTransport(r,lat,lon)
    modal=ModalCore(c);rng=MersenneTwister(714);j=randn(rng,length(c.prefFace),3);F=.001randn(rng,length(t.connection.from))
    d=independent(c,lat,lon,F);v=vec(j);sh=sqrt.(d.H)
    sv=svd(Diagonal(sh)*d.P;full=true);rankp=count(>(1e-12*maximum(sv.S)),sv.S);Q=sv.U[:,rankp+1:end]
    z=(Q*randn(rng,size(Q,2)))./sh
    @test norm(d.R*z)<2e-13*norm(z)
    @test norm(d.R-kron(Matrix{Float64}(I,3,3),Matrix(r.R)))<2e-13*norm(d.R)
    rows=[]
    for strength in (0.,.01,.37,1.)
        out=transport_step(t,j,strength*F);vnext=vec(out.j);mid=(vnext+v)/2
        exact=(I-strength*d.L/2)\((I+strength*d.L/2)*v)
        equation=norm(vnext-v-strength*d.L*mid)/norm(v)
        dense=norm(vnext-exact)/norm(exact)
        kernel=norm(Q'*(sh.*(vnext-v)))/norm(sh.*v)
        u=d.R*mid;loss=sum(strength*f*sum(abs2,u[ib]-T*u[ia])/2 for (ia,ib,f,T) in d.losses)
        energy=abs(dot(vnext,d.H.*vnext)/2-dot(v,d.H.*v)/2+loss)/(dot(v,d.H.*v)/2)
        @test max(equation,dense,kernel,energy)<5e-12
        @test isapprox(loss,out.loss;rtol=5e-12,atol=1e-18)
        push!(rows,(strength=strength,equation=equation,dense=dense,kernel=kernel,energy=energy))
    end
    out=transport_step(t,reshape(z,size(j)),F)
    @test norm(vec(out.j)-z)/norm(z)<5e-12
    transportTiny=[]
    for amplitude in (1e-8,1e-40,1e-100,1e-150,1e-160,1e-200,1e-300)
        try
            out=transport_step(t,amplitude*j,F)
            push!(transportTiny,(amplitude=amplitude,accepted=true,energy=out.energyRelative,equation=out.equationRelative))
        catch ex
            push!(transportTiny,(amplitude=amplitude,accepted=false,error=sprint(showerror,ex)))
        end
    end
    m=CoupledCore(modal,t;strength=.37);lin=RotatingCore(FCTCore(modal),r)
    p=c.pref.*(1 .+.003randn(rng,length(c.pref)));initial=State(p,mass(c,p)*.012,.08j,0.)
    a=deepcopy(initial);b=deepcopy(initial);step!(CoupledCore(modal,t;strength=0),a,.1);step!(lin,b,.1);@test samebits(a,b)
    a=deepcopy(initial);b=deepcopy(initial);@test_throws StepRejected step!(m,a,.1;maxiter=1);@test samebits(a,b)
    nearRest=[]
    for amplitude in (0.,1e-2,1e-4,1e-6,1e-7,1e-8,1e-9,1e-10,1e-12,1e-14)
        state=State(copy(c.pref),mass(c,c.pref)*.012,amplitude*j,0.);saved=deepcopy(state)
        try
            led=step!(m,state,.1)
            push!(nearRest,(amplitude=amplitude,accepted=true,energy=led.completeEnergyRelative))
        catch ex
            push!(nearRest,(amplitude=amplitude,accepted=false,unchanged=samebits(state,saved),error=sprint(showerror,ex)))
        end
    end
    @test all(x->x.accepted,nearRest)
    @test all(x->x.accepted,transportTiny)
    restEndpoint=[]
    for ratio in (1.,1.03,pi)
        state=State(ratio*c.pref,mass(c,ratio*c.pref)*.012,zeros(size(j)),0.)
        expected=deepcopy(state);step!(lin,expected,.1)
        led=step!(CoupledCore(modal,t;strength=0),state,.1)
        @test samebits(state,expected)
        @test led.completeEnergyAbsolute<=led.completeEnergyAllowance
        push!(restEndpoint,(ratio=ratio,exactC5=true,absolute=led.completeEnergyAbsolute,allowance=led.completeEnergyAllowance))
    end
    # Deliberately inject a finite non-skew expansion into the otherwise-valid
    # midpoint rotation. Its original equation still closes; the full energy
    # guard must reject it and leave all authoritative state bits unchanged.
    badPJ=r.PJ+.01r.P
    badrot=RotationMap(c,copy(r.P),copy(r.R),badPJ,r.R*badPJ,copy(r.omega),Dict{Float64,Any}())
    badt=CompatibleTransport(badrot,lat,lon);badm=CoupledCore(modal,badt;strength=.37)
    s=deepcopy(initial);saved=deepcopy(s);reason=""
    try;step!(badm,s,.1);catch ex;reason=sprint(showerror,ex);end
    @test occursin("complete reference-energy balance failed",reason)
    @test samebits(s,saved)
    tmp=deepcopy(initial);tmp.j=coriolis_step(badrot,tmp.j,.05)
    aa=acoustic_step(modal,tmp,.1);ff=shared_transfers(c,initial.p,aa.p,aa.integratedJ)
    jj=coriolis_step(badrot,aa.j,.05);transport=transport_step(badt,jj,.37ff.transfer)
    tmp.p=aa.p;tmp.j=transport.j
    e0=energy(badm,initial);gap=abs(energy(badm,tmp)-e0+transport.loss)
    eref=.5c.c2*sum(c.g.area.*c.pref.*(initial.p./c.pref).^2)
    allowance=1e-9*e0+256eps(Float64)*(sqrt(eref)*sqrt(e0)+eps(Float64)*eref)
    @test gap>1e4*allowance
    @test beforehash==hashes()
    result=(passed=true,sourceBefore=beforehash,sourceAfter=hashes(),denseRows=rows,kernelDimension=size(Q,2),transportTiny=transportTiny,nearRest=nearRest,restEndpoint=restEndpoint,injectedDefect=(relative=gap/e0,allowance=allowance,absolute=gap,reason=reason,rollback=true))
    write(joinpath(DIR,"probes-v2.json"),JSON3.write(result));println(JSON3.write(result))
end
@testset "Independent C7 probes" begin;main();end
