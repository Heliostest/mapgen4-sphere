module VectorInvariant
using LinearAlgebra,SparseArrays,SHA,Serialization
using ..ConservativeCore,..ModalAcoustics,..FluxCorrectedTransport,..GraphWind,..PressureWork
import ..ConservativeCore: step!,mass,energy,identity_hash,save_checkpoint,load_checkpoint
export VectorCore,neutral_tendency,neutral_step
struct VectorCore
    pressure::PressureWorkCore
    east::SparseMatrixCSC{Float64,Int}
    north::SparseMatrixCSC{Float64,Int}
    x::Matrix{Float64}
    lat::Vector{Float64}
    lon::Vector{Float64}
    omega::Vector{Float64}
    function VectorCore(pw,lat,lon,omega)
        omega isa AbstractVector&&length(omega)==3&&all(isfinite,omega)||throw(ArgumentError("finite Cartesian rotation required"))
        wind=WindMap(pw.base,lat,lon)
        x=hcat(cos.(lat).*cos.(lon),cos.(lat).*sin.(lon),sin.(lat))
        all(isfinite,2x*omega)||throw(ArgumentError("rotation overflow"))
        new(pw,wind.east,wind.north,x,Float64.(lat),Float64.(lon),Float64.(omega))
    end
end
function neutral_tendency(m,p,v)
    pw=m.pressure;c=pw.base;PressureWork.validate_pv(pw,p,v)
    n=length(p);nl=length(c.ds);pf=pw.S*p/2;H=pw.h.*pf
    ue=(m.east'*(H.*v))./(c.g.area.*p)
    un=(m.north'*(H.*v))./(c.g.area.*p)
    curl=(c.divergence*(m.east*un-m.north*ue))./c.g.area
    f=2m.x*m.omega
    rotation=m.east*(f.*un)-m.north*(f.*ue)
    vorticity=m.east*(curl.*un)-m.north*(curl.*ue)
    K=(pw.S'*(pw.h.*v.^2))./(4c.g.area)
    layerGradient=c.gradient*(K.-K*c.ds)
    L=(c.divergence*(pf.*v)).*transpose(c.ds)
    pdot=-vec(sum(L;dims=2))./c.g.area
    F=zeros(n,nl+1)
    for k in 1:nl;F[:,k+1]=F[:,k]-L[:,k]-c.g.area.*pdot*c.ds[k];end
    bottom=maximum(abs,F[:,end]);scale=max(maximum(abs,L),floatmin(Float64))
    bottom<=128eps(Float64)*scale||throw(StepRejected("momentum sigma bottom closure"))
    vertical=zeros(size(v))
    for k in 1:nl-1
        Q=(pw.h/2).*(pw.S*(F[:,k+1]./c.g.area))
        change=Q.*(v[:,k]-v[:,k+1])/2
        vertical[:,k]+=change./(H*c.ds[k])
        vertical[:,k+1]+=change./(H*c.ds[k+1])
    end
    total=rotation+vorticity+layerGradient+vertical
    all(isfinite,total)&&all(isfinite,curl)&&all(isfinite,F)||throw(StepRejected("nonfinite vector-invariant tendency"))
    (total=total,rotation=rotation,vorticity=vorticity,layerGradient=layerGradient,vertical=vertical,
     curl=curl,verticalFlux=F,bottomResidual=bottom)
end
function neutral_step(m::VectorCore,p,v,tau::Real;maxiter=400)
    PressureWork.validate_pv(m.pressure,p,v)
    isfinite(tau)||throw(ArgumentError("finite midpoint timestep required"))
    maxiter isa Integer&&maxiter>0||throw(ArgumentError("positive midpoint iteration limit required"))
    if tau==0||all(iszero,v)
        return (v=copy(v),iterations=0,equationRelative=0.,energyRelative=0.)
    end
    scale=max(maximum(abs,v),floatmin(Float64));z=copy(v);iterations=0;converged=false
    for k in 1:maxiter
        next=v+(tau/2)*neutral_tendency(m,p,z).total
        all(isfinite,next)||throw(StepRejected("nonfinite momentum midpoint"))
        delta=maximum(abs,next-z);z=next;iterations=k
        if delta<=8eps(Float64)*scale;converged=true;break;end
    end
    converged||throw(StepRejected("momentum midpoint did not converge"))
    next=v+tau*neutral_tendency(m,p,z).total
    residual=next-v-tau*neutral_tendency(m,p,(v+next)/2).total
    equationRelative=maximum(abs,residual)/max(scale,maximum(abs,next))
    initial=energies(m.pressure,p,v).kinetic;final=energies(m.pressure,p,next).kinetic
    absolute=abs(final-initial);allowance=(1e-10+256eps(Float64))*initial
    isfinite(absolute)&&isfinite(allowance)&&absolute<=allowance&&equationRelative<5e-12||throw(StepRejected("momentum midpoint energy or equation failed"))
    (v=next,iterations=iterations,equationRelative=equationRelative,energyRelative=absolute/max(initial,floatmin(Float64)))
end
mass(m::VectorCore,p)=mass(m.pressure,p)
energy(m::VectorCore,s::BarotropicState)=energy(m.pressure,s)
function step!(m::VectorCore,s::BarotropicState,dt::Real;maxiter=400,pressure_maxiter=30)
    pw=m.pressure;c=pw.base;PressureWork.validate(pw,s)
    isfinite(dt)&&dt>0&&isfinite(s.time+dt)&&s.time+dt>s.time||throw(ArgumentError("timestep must advance finite time"))
    e0=energy(m,s);isfinite(e0)||throw(StepRejected("nonfinite initial energy"))
    first=neutral_step(m,s.p,s.v,dt/2;maxiter=maxiter)
    pressure=pressure_step(pw,s.p,first.v,dt;maxiter=pressure_maxiter)
    f=shared_transfers(c,s.p,pressure.p,pressure.integratedJ)
    tr=transport_fct(f.oldmass,f.newmass,f.from,f.to,f.transfer,s.W)
    budgets=(tr.localAirRelativeResidual,tr.localWaterRelativeResidual,tr.localDryRelativeResidual)
    all(x->isfinite(x)&&0<=x<5e-12,budgets)&&isfinite(f.bottom)&&f.bottom<=5e-12*maximum(f.oldmass)||throw(StepRejected("shared air/water/dry budget failed"))
    last=neutral_step(m,pressure.p,pressure.v,dt/2;maxiter=maxiter)
    absolute=abs(energies(pw,pressure.p,last.v).total-e0)
    referenceScale=c.c2*sum(c.g.area.*s.p)
    allowance=1e-9*e0+1024eps(Float64)*(sqrt(referenceScale)*sqrt(e0)+eps(Float64)*referenceScale)
    isfinite(absolute)&&isfinite(allowance)&&absolute<=allowance||throw(StepRejected("complete rotating-sigma energy failed"))
    ledger=(firstIterations=first.iterations,pressureIterations=pressure.iterations,lastIterations=last.iterations,
        pressureBacktracks=pressure.backtracks,pressureResidual=pressure.residual,
        firstEquation=first.equationRelative,lastEquation=last.equationRelative,pressureEquation=max(pressure.equationP,pressure.equationV),
        firstEnergy=first.energyRelative,lastEnergy=last.energyRelative,
        completeEnergyAbsolute=absolute,completeEnergyAllowance=allowance,
        localAirRelativeResidual=budgets[1],localWaterRelativeResidual=budgets[2],localDryRelativeResidual=budgets[3],
        bottomResidual=f.bottom,qmin=minimum(tr.water./f.newmass),qmax=maximum(tr.water./f.newmass),dt=Float64(dt))
    s.p=pressure.p;s.v=last.v;s.W=tr.water;s.time+=dt
    ledger
end
function identity_hash(m::VectorCore)
    io=IOBuffer();serialize(io,(version="c9-actual-metric-rotating-sigma-strang-v1",pressure=identity_hash(m.pressure),
        east=m.east,north=m.north,x=m.x,lat=m.lat,lon=m.lon,omega=m.omega))
    bytes2hex(sha256(take!(io)))
end
function save_checkpoint(path,m::VectorCore,s::BarotropicState)
    PressureWork.validate(m.pressure,s);mkpath(dirname(path));serialize(path,(version=9,identity=identity_hash(m),state=s))
end
function load_checkpoint(path,m::VectorCore)
    r=deserialize(path)
    r.version==9&&r.identity==identity_hash(m)&&r.state isa BarotropicState||throw(ArgumentError("checkpoint identity mismatch"))
    PressureWork.validate(m.pressure,r.state);deepcopy(r.state)
end
end
