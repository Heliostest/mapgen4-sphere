module CoupledCompatible
using SHA,Serialization
using ..ConservativeCore,..ModalAcoustics,..GraphRotation,..CompatibleMomentum,..FluxCorrectedTransport
import ..ConservativeCore: step!,mass,energy,identity_hash,save_checkpoint,load_checkpoint
export CoupledCore
struct CoupledCore
    modal::ModalCore
    transport::CompatibleTransport
    strength::Float64
    function CoupledCore(modal,transport;strength=1.)
        identity_hash(modal.base)==identity_hash(transport.rotation.c) || throw(ArgumentError("coupled core mismatch"))
        isfinite(strength)&&0<=strength<=1 || throw(ArgumentError("strength must be in [0,1]"))
        new(modal,transport,Float64(strength))
    end
end
mass(m::CoupledCore,p)=mass(m.modal,p)
energy(m::CoupledCore,s)=energy(m.modal,s)
function validate(m,s)
    c=m.modal.base;n=length(c.pref);nl=length(c.ds)
    length(s.p)==n&&size(s.W)==(n,nl)&&size(s.j)==(length(c.prefFace),nl) || throw(ArgumentError("coupled state shape"))
    all(isfinite,s.p)&&all(s.p.>0)&&all(isfinite,s.W)&&all(0 .<=s.W.<=mass(c,s.p))&&all(isfinite,s.j)&&isfinite(s.time) || throw(ArgumentError("invalid coupled state"))
end
function identity_hash(m::CoupledCore)
    io=IOBuffer();t=m.transport;r=t.rotation;g=t.connection
    serialize(io,(version="c7-adjoint-split-form-lie-v2-mixed-energy-guard",modal=identity_hash(m.modal),strength=m.strength,
        P=r.P,R=r.R,PJ=r.PJ,RPJ=r.RPJ,omega=r.omega,RP=t.RP,refmass=t.refmass,
        lat=g.lat,lon=g.lon,from=g.from,to=g.to,connection=g.connection))
    bytes2hex(sha256(take!(io)))
end
function save_checkpoint(path,m::CoupledCore,s::State)
    validate(m,s);mkpath(dirname(path));serialize(path,(version=7,identity=identity_hash(m),state=s))
end
function load_checkpoint(path,m::CoupledCore)
    r=deserialize(path)
    r.version==7&&r.identity==identity_hash(m)&&r.state isa State||throw(ArgumentError("checkpoint identity mismatch"))
    validate(m,r.state);deepcopy(r.state)
end
function step!(m::CoupledCore,s::State,dt::Real;maxiter=400)
    validate(m,s)
    isfinite(dt)&&dt>0&&isfinite(s.time+dt)&&s.time+dt>s.time||throw(ArgumentError("invalid timestep"))
    candidate=deepcopy(s);rot=m.transport.rotation;c=m.modal.base;e0=energy(m,s)
    isfinite(e0)||throw(StepRejected("nonfinite initial reference energy"))
    candidate.j=coriolis_step(rot,candidate.j,dt/2)
    a=acoustic_step(m.modal,candidate,dt)
    f=shared_transfers(c,s.p,a.p,a.integratedJ)
    tr=transport_fct(f.oldmass,f.newmass,f.from,f.to,f.transfer,s.W)
    rotated=coriolis_step(rot,a.j,dt/2)
    transport=transport_step(m.transport,rotated,m.strength*f.transfer;maxiter=maxiter)
    candidate.p=a.p;candidate.W=tr.water;candidate.j=transport.j;candidate.time+=dt
    absoluteBalance=abs(energy(m,candidate)-e0+transport.loss)
    # Near a uniform pressure ratio the perturbation energy can vanish, while
    # pressure arithmetic still rounds on the unsubtracted pressure scale.
    # A quadratic energy then has O(eps*sqrt(Eref*E0)+eps^2*Eref) roundoff.
    referenceScale=.5c.c2*sum(c.g.area.*c.pref.*(s.p./c.pref).^2)
    roundoffAllowance=256eps(Float64)*(sqrt(referenceScale)*sqrt(e0)+eps(Float64)*referenceScale)
    allowance=1e-9*e0+roundoffAllowance
    isfinite(absoluteBalance)&&isfinite(allowance)&&absoluteBalance<=allowance||throw(StepRejected("complete reference-energy balance failed"))
    totalBalance=absoluteBalance/max(e0,eps(Float64)^2*referenceScale,floatmin(Float64))
    q=tr.water./f.newmass
    ledger=(localAirRelativeResidual=tr.localAirRelativeResidual,localWaterRelativeResidual=tr.localWaterRelativeResidual,
        localDryRelativeResidual=tr.localDryRelativeResidual,equationRelative=transport.equationRelative,energyRelative=transport.energyRelative,
        loss=transport.loss,completeEnergyRelative=totalBalance,completeEnergyAbsolute=absoluteBalance,completeEnergyAllowance=allowance,
        completeEnergyRoundoffAllowance=roundoffAllowance,iterations=transport.iterations,qmin=minimum(q),qmax=maximum(q),
        positivityChecks=a.positivityChecks,minimumCertifiedRatio=a.minimumCertifiedRatio,bottomResidual=f.bottom,dt=Float64(dt))
    s.p=candidate.p;s.W=candidate.W;s.j=candidate.j;s.time=candidate.time
    ledger
end
end
