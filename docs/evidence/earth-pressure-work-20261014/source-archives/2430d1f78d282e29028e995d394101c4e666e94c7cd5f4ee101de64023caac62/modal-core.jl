module ModalAcoustics
using LinearAlgebra,SparseArrays,Serialization,SHA
using ..ConservativeCore
import ..ConservativeCore: step!,mass,energy,identity_hash
export ModalCore,acoustic_step,shared_transfers

struct ModalCore
    base::TransportCore
    sqrtmass::Vector{Float64}
    vectors::Matrix{Float64}
    absoluteVectors::Matrix{Float64}
    omega::Vector{Float64}
    preparationSeconds::Float64
    eigenResidual::Float64
end
function ModalCore(c::TransportCore)
    started=time();sm=sqrt.(c.g.area.*c.pref)
    S=c.c2*(Diagonal(1 ./sm)*c.stiffness*Diagonal(1 ./sm))
    norm(S-S')<=2e-12*norm(S) || throw(ArgumentError("acoustic operator must be symmetric"))
    eig=eigen(Symmetric(Matrix(S)));scale=maximum(abs,eig.values)
    tol=1e-12*scale
    minimum(eig.values)>=-tol || throw(ArgumentError("negative acoustic eigenvalue"))
    null=findall(abs.(eig.values).<=tol)
    length(null)==1 || throw(ArgumentError("modal candidate requires one connected null mode"))
    # Only the verified constant-ratio null mode gets its analytic zero limit.
    v=eig.vectors[:,only(null)];abs(dot(v,sm)/norm(sm))>1-1e-10 || throw(ArgumentError("unexpected null mode"))
    omega=sqrt.(max.(eig.values,0.));omega[null].=0.
    sample=unique([1,cld(length(sm),2),length(sm)])
    residual=norm(S*eig.vectors[:,sample]-eig.vectors[:,sample]*Diagonal(eig.values[sample]))/max(norm(S),eps())
    residual<1e-11 || throw(ArgumentError("inaccurate eigenbasis"))
    ModalCore(c,sm,eig.vectors,abs.(eig.vectors),omega,time()-started,residual)
end
mass(m::ModalCore,p)=mass(m.base,p)
energy(m::ModalCore,s)=energy(m.base,s)
function identity_hash(m::ModalCore)
    io=IOBuffer();serialize(io,(version=2,base=identity_hash(m.base),omega=m.omega,vectors=m.vectors))
    bytes2hex(sha256(take!(io)))
end

# Entire functions avoid loss of significance as omega*dt approaches zero.
function weights(z)
    z2=z*z
    if abs(z)<.01
        sinc=1-z2/6+z2^2/120-z2^3/5040+z2^4/362880
        cosc=.5-z2/24+z2^2/720-z2^3/40320+z2^4/3628800
        sincc=1/6-z2/120+z2^2/5040-z2^3/362880+z2^4/39916800
    else
        sinc=sin(z)/z;cosc=2(sin(z/2)/z)^2;sincc=(1-sinc)/z2
    end
    (cosminus=-2sin(z/2)^2,sinc=sinc,cosc=cosc,sincc=sincc)
end

"""Exact fixed-linear pressure/momentum evolution and integral(j).
Certify positive pressure over the whole interval using a modal derivative
bound and recursive interval subdivision. These are certificate intervals,
not hidden integration steps. Failure changes no authoritative state.
"""
function acoustic_step(m::ModalCore,s::State,dt::Real)
    isfinite(dt)&&dt>0&&isfinite(s.time+dt)&&s.time+dt>s.time || throw(ArgumentError("invalid timestep"))
    c=m.base;n=length(c.pref);nl=length(c.ds)
    length(s.p)==n && size(s.W)==(n,nl) && size(s.j)==(length(c.prefFace),nl) || throw(ArgumentError("state shape mismatch"))
    all(isfinite,s.p)&&minimum(s.p)>0&&all(isfinite,s.j) || throw(ArgumentError("invalid acoustic state"))
    r=s.p./c.pref;rbar=sum(c.g.area.*s.p)/sum(m.sqrtmass.^2)
    a=m.vectors'*(m.sqrtmass.*(r.-rbar))
    b=m.vectors'*(-(c.divergence*(s.j*c.ds))./m.sqrtmass)
    function delta(t)
        w=weights.(m.omega*t)
        [w[i].cosminus*a[i]+t*w[i].sinc*b[i] for i in eachindex(a)]
    end
    # For each mode, |y'| <= omega*|a| + |b|, including omega=0.
    slope=(m.absoluteVectors*(m.omega.*abs.(a)+abs.(b)))./m.sqrtmass
    checks=Ref(0);lowest=Ref(Inf)
    function certify(left,right,depth)
        mid=(left+right)/2;rmid=r+(m.vectors*delta(mid))./m.sqrtmass;checks[]+=1
        all(isfinite,rmid)&&minimum(rmid)>0 || throw(StepRejected("nonpositive intermediate pressure"))
        lower=minimum(rmid-(right-left)/2*slope)
        if lower>128eps(Float64)*maximum(abs,rmid)
            lowest[]=min(lowest[],lower);return
        end
        depth<12 || throw(StepRejected("cannot certify interval pressure positivity"))
        certify(left,mid,depth+1);certify(mid,right,depth+1)
    end
    certify(0.,Float64(dt),0)
    w=weights.(m.omega*dt)
    integral=[dt*w[i].sinc*a[i]+dt^2*w[i].cosc*b[i] for i in eachindex(a)]
    doubleIntegral=[dt^2*w[i].cosc*a[i]+dt^3*w[i].sincc*b[i] for i in eachindex(a)]
    p=s.p+c.pref.*((m.vectors*delta(dt))./m.sqrtmass)
    j=s.j.+c.c2*c.prefFace.*(c.gradient*((m.vectors*integral)./m.sqrtmass))
    integratedJ=dt*s.j.+c.c2*c.prefFace.*(c.gradient*((m.vectors*doubleIntegral)./m.sqrtmass))
    all(isfinite,p)&&minimum(p)>0&&all(isfinite,j)&&all(isfinite,integratedJ) || throw(StepRejected("invalid acoustic output"))
    (p=p,j=j,integratedJ=integratedJ,positivityChecks=checks[],minimumCertifiedRatio=lowest[])
end

function shared_transfers(c,oldp,newp,integratedJ)
    n=length(oldp);nl=length(c.ds);nt=length(c.transferFrom)
    F=c.transferCoefficient.*integratedJ[c.transferQuadrature,:].*transpose(c.ds)
    oldmass=mass(c,oldp);newmass=mass(c,newp)
    horizontal=-(c.B*F);vertical=zeros(n,nl+1)
    for k in 1:nl
        vertical[:,k+1]=vertical[:,k]+horizontal[:,k]-(newmass[:,k]-oldmass[:,k])
    end
    bottom=maximum(abs,vertical[:,end])
    bottom<=2e-11*maximum(oldmass) || throw(StepRejected("sigma bottom closure residual"))
    from=Vector{Int}(undef,nt*nl+n*(nl-1));to=similar(from);transfer=Vector{Float64}(undef,length(from))
    for k in 1:nl
        r=(k-1)*nt+1:k*nt
        from[r]=c.transferFrom.+(k-1)*n;to[r]=c.transferTo.+(k-1)*n;transfer[r]=F[:,k]
    end
    for k in 1:nl-1
        r=nt*nl+(k-1)*n+1:nt*nl+k*n
        from[r]=collect(1:n).+(k-1)*n;to[r]=collect(1:n).+k*n;transfer[r]=vertical[:,k+1]
    end
    (from=from,to=to,transfer=transfer,oldmass=oldmass,newmass=newmass,bottom=bottom)
end

function step!(m::ModalCore,s::State,dt::Real)
    c=m.base;a=acoustic_step(m,s,dt);f=shared_transfers(c,s.p,a.p,a.integratedJ)
    tr=transport_tracer(f.oldmass,f.newmass,f.from,f.to,f.transfer,s.W)
    air=sum(f.newmass)-sum(f.oldmass);water=sum(tr.water)-sum(s.W);q=tr.water./f.newmass
    led=(airResidual=abs(air),waterResidual=abs(water),dryResidual=abs(air-water),localAirRelativeResidual=tr.localAirRelativeResidual,localWaterRelativeResidual=tr.localWaterRelativeResidual,localDryRelativeResidual=tr.localDryRelativeResidual,bottomResidual=f.bottom,positivityChecks=a.positivityChecks,minimumCertifiedRatio=a.minimumCertifiedRatio,qmin=minimum(q),qmax=maximum(q),dt=Float64(dt))
    s.p=a.p;s.W=tr.water;s.j=a.j;s.time+=dt
    led
end
end
