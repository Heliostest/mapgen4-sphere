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
# Intentionally wrong fixed-metric baseline for RED tests.
secant(a,b,r)=(value=log(a/r),derivative=0.)
function energies(m,p,v)
    c=m.base;k=sum(m.h.*c.prefFace.*(v.^2*c.ds))/2
    u=c.c2*sum(c.g.area.*(p-c.pref).^2 ./c.pref)/2
    (kinetic=k,potential=u,total=k+u)
end
energy(m::PressureWorkCore,s::BarotropicState)=energies(m,s.p,s.v).total
function discrete_gradient(m,p0,p1,v0,v1)
    c=m.base
    (mu=c.c2*log.(p0./c.pref),flux=c.prefFace.*v0,kappa=zeros(length(p0)))
end
end
