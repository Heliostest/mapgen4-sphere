module VectorInvariant
using LinearAlgebra,SparseArrays,SHA,Serialization
using ..ConservativeCore,..ModalAcoustics,..FluxCorrectedTransport,..GraphWind,..PressureWork
import ..ConservativeCore: step!,mass,energy,identity_hash,save_checkpoint,load_checkpoint
export VectorCore,neutral_tendency,neutral_step
struct VectorCore
    pressure::PressureWorkCore
    lat::Vector{Float64}
    lon::Vector{Float64}
    omega::Vector{Float64}
end
VectorCore(pw,lat,lon,omega)=VectorCore(pw,Float64.(lat),Float64.(lon),Float64.(omega))
function neutral_tendency(m,p,v)
    z=zeros(size(v));n=length(p);nl=size(v,2)
    (total=z,rotation=z,vorticity=z,layerGradient=z,vertical=z,curl=zeros(n,nl),verticalFlux=zeros(n,nl+1))
end
neutral_step(m,p,v,dt;maxiter=400)=(v=copy(v),iterations=0,equationRelative=0.,energyRelative=0.)
step!(m::VectorCore,s::BarotropicState,dt;kwargs...)=nothing
end
