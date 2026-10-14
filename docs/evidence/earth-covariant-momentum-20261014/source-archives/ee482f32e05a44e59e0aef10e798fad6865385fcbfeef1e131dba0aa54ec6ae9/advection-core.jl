module NonlinearAdvection
using LinearAlgebra,SHA,Serialization
using ..ConservativeCore,..ModalAcoustics,..FluxCorrectedTransport,..GraphWind,..CovariantMomentum
import ..ConservativeCore: step!,mass,energy,identity_hash,save_checkpoint,load_checkpoint
export AdvectionCore,AdvectiveState
mutable struct AdvectiveState
    p::Vector{Float64}
    W::Matrix{Float64}
    velocity::Matrix{Float64}
    time::Float64
end
struct AdvectionCore
    base::TransportCore
    wind::WindMap
    connection::ConnectionGeometry
end
function AdvectionCore(c,lat,lon)
    f=shared_transfers(c,c.pref,c.pref,zeros(length(c.prefFace),length(c.ds)))
    AdvectionCore(c,WindMap(c,lat,lon),ConnectionGeometry(repeat(lat,length(c.ds)),repeat(lon,length(c.ds)),f.from,f.to))
end
step!(m::AdvectionCore,s::AdvectiveState,dt;momentum_maxiter=400)=nothing
end
