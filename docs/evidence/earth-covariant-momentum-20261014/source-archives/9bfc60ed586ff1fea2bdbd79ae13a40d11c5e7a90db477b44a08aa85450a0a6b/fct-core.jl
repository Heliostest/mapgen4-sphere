module CoupledFCT
using SHA
using ..ConservativeCore,..ModalAcoustics,..FluxCorrectedTransport
import ..ConservativeCore: step!,mass,energy,identity_hash
export FCTCore
struct FCTCore
    modal::ModalCore
end
mass(c::FCTCore,p)=mass(c.modal,p)
energy(c::FCTCore,s)=energy(c.modal,s)
identity_hash(c::FCTCore)=bytes2hex(sha256("c2-fct-v1:"*identity_hash(c.modal)))
function step!(m::FCTCore,s::State,dt::Real)
    c=m.modal.base;a=acoustic_step(m.modal,s,dt);f=shared_transfers(c,s.p,a.p,a.integratedJ)
    tr=transport_fct(f.oldmass,f.newmass,f.from,f.to,f.transfer,s.W)
    air=sum(f.newmass)-sum(f.oldmass);water=sum(tr.water)-sum(s.W);q=tr.water./f.newmass
    led=(airResidual=abs(air),waterResidual=abs(water),dryResidual=abs(air-water),localAirRelativeResidual=tr.localAirRelativeResidual,localWaterRelativeResidual=tr.localWaterRelativeResidual,localDryRelativeResidual=tr.localDryRelativeResidual,bottomResidual=f.bottom,positivityChecks=a.positivityChecks,minimumCertifiedRatio=a.minimumCertifiedRatio,qmin=minimum(q),qmax=maximum(q),limitedEdges=tr.limitedEdges,minimumLimiter=tr.minimumLimiter,centeredIterations=tr.centeredIterations,centeredRelativeResidual=tr.centeredRelativeResidual,dt=Float64(dt))
    s.p=a.p;s.W=tr.water;s.j=a.j;s.time+=dt
    led
end
end
