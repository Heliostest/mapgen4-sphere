module RotatingAcoustics
using SHA,Serialization
using ..ConservativeCore,..CoupledFCT,..GraphRotation
import ..ConservativeCore: step!,mass,energy,identity_hash
export RotatingCore
struct RotatingCore
    fct::FCTCore
    rotation::RotationMap
end
mass(m::RotatingCore,p)=mass(m.fct,p)
energy(m::RotatingCore,s)=energy(m.fct,s)
identity_hash(m::RotatingCore)=identity_hash(m.fct)
step!(m::RotatingCore,s::State,dt::Real)=step!(m.fct,s,dt)
end
