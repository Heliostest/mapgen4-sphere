module RotatingAcoustics
using SHA,Serialization
using ..ConservativeCore,..CoupledFCT,..GraphRotation
import ..ConservativeCore: step!,mass,energy,identity_hash
export RotatingCore
struct RotatingCore
    fct::FCTCore
    rotation::RotationMap
    function RotatingCore(fct,rotation)
        identity_hash(fct.modal.base)==identity_hash(rotation.c) || throw(ArgumentError("acoustic and rotation cores differ"))
        new(fct,rotation)
    end
end
mass(m::RotatingCore,p)=mass(m.fct,p)
energy(m::RotatingCore,s)=energy(m.fct,s)
function identity_hash(m::RotatingCore)
    io=IOBuffer();r=m.rotation
    serialize(io,(version="c5-adjoint-coriolis-strang-v1",fct=identity_hash(m.fct),omega=r.omega,P=r.P,R=r.R,PJ=r.PJ))
    bytes2hex(sha256(take!(io)))
end
"""Atomic symmetric rotation/acoustic/shared-water composition.
Only scratch state advances until both rotation halves and transport succeed.
"""
function step!(m::RotatingCore,s::State,dt::Real)
    isfinite(dt)&&dt>0&&isfinite(s.time+dt)&&s.time+dt>s.time || throw(ArgumentError("invalid coupled timestep"))
    candidate=deepcopy(s)
    candidate.j=coriolis_step(m.rotation,candidate.j,dt/2)
    ledger=step!(m.fct,candidate,dt)
    candidate.j=coriolis_step(m.rotation,candidate.j,dt/2)
    s.p=candidate.p;s.W=candidate.W;s.j=candidate.j;s.time=candidate.time
    ledger
end
end
