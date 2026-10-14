module PressureWork
using LinearAlgebra,SparseArrays,Serialization,SHA
using ..ConservativeCore,..ModalAcoustics,..FluxCorrectedTransport
import ..ConservativeCore: step!,mass,energy,identity_hash,save_checkpoint,load_checkpoint
export PressureWorkCore,BarotropicState,energies,discrete_gradient,pressure_step,secant
struct PressureWorkCore
    base::TransportCore
    S::SparseMatrixCSC{Float64,Int}
    h::Vector{Float64}
end
function PressureWorkCore(c)
    n=length(c.pref);ne=length(c.prefFace)
    S=sparse(vcat(1:ne,1:ne),vcat(c.g.from,c.g.to),ones(2ne),ne,n)
    PressureWorkCore(c,S,c.g.edgeLength.*c.g.centerDistance)
end
mutable struct BarotropicState
    p::Vector{Float64}
    W::Matrix{Float64}
    v::Matrix{Float64}
    time::Float64
end
mass(m::PressureWorkCore,p)=mass(m.base,p)
function secant(a,b,r)
    all(x->isfinite(x)&&x>0,(a,b,r))||throw(ArgumentError("positive finite secant endpoints/reference required"))
    x=(b-a)/a
    if abs(x)<.01
        phi=sum((-1.)^(k+1)*x^k/(k*(k+1)) for k in 1:12)
        derivative=sum((-1.)^k*x^k/(k+2) for k in 0:12)/a
        return (value=logratio(a,r)+phi,derivative=derivative)
    end
    lo,hi=minmax(a,b);q=lo/hi;logq=log(lo)-log(hi);fraction=q/(1-q)
    value=logratio(hi,r)-1-fraction*logq
    derivative=b==hi ? (1+fraction*logq)/(hi-lo) : -(1+(1+fraction)*logq)/(hi-lo)
    (value=value,derivative=derivative)
end
function logratio(a,r)
    q=a/r
    .5<q<2 ? log1p((a-r)/r) : log(a)-log(r)
end
function compression(p,r)
    x=(p-r)/r
    abs(x)<.01 ? r*sum((-1.)^k*x^k/(k*(k-1)) for k in 2:14) : p*logratio(p,r)-p+r
end
function energies(m,p,v)
    c=m.base;k=sum(m.h.*(m.S*p/2).*(v.^2*c.ds))/2
    u=c.c2*sum(c.g.area.*compression.(p,c.pref))
    (kinetic=k,potential=u,total=k+u)
end
energy(m::PressureWorkCore,s::BarotropicState)=energies(m,s.p,s.v).total
function discrete_gradient(m,p0,p1,v0,v1)
    c=m.base
    ell=[secant(p0[i],p1[i],c.pref[i]).value for i in eachindex(p0)]
    kappa=(m.S'*(m.h.*((v0.^2+v1.^2)*c.ds)))./(8c.g.area)
    (mu=c.c2*ell+kappa,flux=(m.S*(p0+p1)/4).*((v0+v1)/2),kappa=kappa)
end
function validate_pv(m,p,v)
    c=m.base
    p isa AbstractVector&&v isa AbstractMatrix&&length(p)==length(c.pref)&&size(v)==(length(c.prefFace),length(c.ds))||throw(ArgumentError("pressure/velocity shape mismatch"))
    all(isfinite,p)&&all(p.>0)&&all(isfinite,v)||throw(ArgumentError("positive finite pressure and finite velocity required"))
end
function validate(m,s)
    validate_pv(m,s.p,s.v)
    size(s.W)==(length(s.p),length(m.base.ds))&&all(isfinite,s.W)&&all(0 .<=s.W.<=mass(m,s.p))&&isfinite(s.time)||throw(ArgumentError("invalid water inventory or time"))
end
function residual_jacobian(m,p0,v0,dt,y;jacobian=true)
    c=m.base;n=length(p0);a=c.g.area;G=c.gradient;D=c.divergence
    x=y[1:n];eta=y[n+1:2n];p1=p0+c.pref.*x
    v1=v0.+(dt*c.c2)*(G*eta)
    d=discrete_gradient(m,p0,p1,v0,v1)
    residual=vcat(x+dt*(D*(d.flux*c.ds))./(a.*c.pref),eta-d.mu/c.c2)
    jacobian||return residual,nothing
    pfbar=m.S*(p0+p1)/4;vbar=(v0+v1)/2
    I0=spdiagm(0=>ones(n));AP=spdiagm(0=>1 ./ (a.*c.pref));P=spdiagm(0=>c.pref)
    J11=I0+(dt/4)*AP*D*spdiagm(0=>vbar*c.ds)*m.S*P
    J12=(dt^2*c.c2/2)*AP*D*spdiagm(0=>pfbar)*G
    J21=spdiagm(0=>[-c.pref[i]*secant(p0[i],p1[i],c.pref[i]).derivative for i in 1:n])
    J22=I0-(dt/4)*spdiagm(0=>1 ./a)*m.S'*spdiagm(0=>m.h.*(v1*c.ds))*G
    residual,[J11 J12;J21 J22]
end
function pressure_step(m,p0,v0,dt::Real;maxiter=30)
    validate_pv(m,p0,v0)
    isfinite(dt)&&dt!=0||throw(ArgumentError("finite nonzero timestep required"))
    maxiter isa Integer&&maxiter>0||throw(ArgumentError("positive Newton iteration limit required"))
    c=m.base;n=length(p0);initial=energies(m,p0,v0)
    isfinite(initial.total)||throw(StepRejected("nonfinite initial energy"))
    eta=discrete_gradient(m,p0,p0,v0,v0).mu/c.c2
    y=vcat(zeros(n),eta);iterations=0;backtracks=0;residual=Inf
    for iteration in 0:maxiter
        r,J=residual_jacobian(m,p0,v0,dt,y)
        all(isfinite,r)&&all(isfinite,J.nzval)||throw(StepRejected("nonfinite nonlinear system"))
        residual=maximum(abs,r)
        residual<=2e-14&&break
        iteration<maxiter||throw(StepRejected("pressure-work Newton iteration did not converge"))
        delta=try;-(J\r);catch;throw(StepRejected("pressure-work Newton factorization failed"));end
        all(isfinite,delta)||throw(StepRejected("nonfinite Newton correction"))
        accepted=false
        for k in 0:25
            trial=y+2.0^(-k)*delta;pp=p0+c.pref.*trial[1:n]
            if all(isfinite,trial)&&all(isfinite,pp)&&all(pp.>0)
                rr,_=residual_jacobian(m,p0,v0,dt,trial;jacobian=false)
                if all(isfinite,rr)&&maximum(abs,rr)<=(1-1e-4*2.0^(-k))*residual
                    y=trial;backtracks+=k;accepted=true;break
                end
            end
        end
        accepted||throw(StepRejected("positive residual-decreasing Newton trial unavailable"))
        iterations+=1
    end
    p=p0+c.pref.*y[1:n];v=v0.+(dt*c.c2)*(c.gradient*y[n+1:2n])
    d=discrete_gradient(m,p0,p,v0,v);integratedJ=dt*d.flux
    final=energies(m,p,v);absolute=abs(final.total-initial.total)
    referenceScale=c.c2*sum(c.g.area.*p0)
    allowance=1e-10*initial.total+512eps(Float64)*(sqrt(referenceScale)*sqrt(initial.total)+eps(Float64)*referenceScale)
    isfinite(absolute)&&isfinite(allowance)&&absolute<=allowance||throw(StepRejected("pressure-work energy balance failed"))
    equationP=maximum(abs,(p-p0+(c.divergence*(integratedJ*c.ds))./c.g.area)./c.pref)
    equationV=maximum(abs,v-v0.-dt*(c.gradient*d.mu))/max(maximum(abs,v0),sqrt(c.c2))
    equationP<5e-12&&equationV<5e-12||throw(StepRejected("original pressure-work equations failed"))
    (p=p,v=v,integratedJ=integratedJ,iterations=iterations,backtracks=backtracks,residual=residual,
     equationP=equationP,equationV=equationV,energyAbsolute=absolute,energyAllowance=allowance,
     kineticChange=final.kinetic-initial.kinetic,potentialChange=final.potential-initial.potential)
end
function step!(m::PressureWorkCore,s::BarotropicState,dt::Real;maxiter=30)
    validate(m,s)
    isfinite(dt)&&dt>0&&isfinite(s.time+dt)&&s.time+dt>s.time||throw(ArgumentError("timestep must advance finite time"))
    solved=pressure_step(m,s.p,s.v,dt;maxiter=maxiter)
    f=shared_transfers(m.base,s.p,solved.p,solved.integratedJ)
    tr=transport_fct(f.oldmass,f.newmass,f.from,f.to,f.transfer,s.W)
    ledger=(iterations=solved.iterations,backtracks=solved.backtracks,residual=solved.residual,
        equationP=solved.equationP,equationV=solved.equationV,energyAbsolute=solved.energyAbsolute,energyAllowance=solved.energyAllowance,
        kineticChange=solved.kineticChange,potentialChange=solved.potentialChange,bottomResidual=f.bottom,
        localAirRelativeResidual=tr.localAirRelativeResidual,localWaterRelativeResidual=tr.localWaterRelativeResidual,localDryRelativeResidual=tr.localDryRelativeResidual,
        qmin=minimum(tr.water./f.newmass),qmax=maximum(tr.water./f.newmass),dt=Float64(dt))
    s.p=solved.p;s.v=solved.v;s.W=tr.water;s.time+=dt
    ledger
end
function identity_hash(m::PressureWorkCore)
    io=IOBuffer();serialize(io,(version="c8-barotropic-bernoulli-symmetric-dg-v1",base=identity_hash(m.base),S=m.S,h=m.h))
    bytes2hex(sha256(take!(io)))
end
function save_checkpoint(path,m::PressureWorkCore,s::BarotropicState)
    validate(m,s);mkpath(dirname(path));serialize(path,(version=8,identity=identity_hash(m),state=s))
end
function load_checkpoint(path,m::PressureWorkCore)
    r=deserialize(path)
    r.version==8&&r.identity==identity_hash(m)&&r.state isa BarotropicState||throw(ArgumentError("checkpoint identity mismatch"))
    validate(m,r.state);deepcopy(r.state)
end
end
