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
step!(m::CoupledCore,s::State,dt;maxiter=400)=nothing
end
