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
    else
        phi=(1+x)*log1p(x)/x-1
        derivative=(x-log1p(x))/(a*x^2)
    end
    (value=log(a/r)+phi,derivative=derivative)
end
function compression(x)
    abs(x)<.01 ? sum((-1.)^k*x^k/(k*(k-1)) for k in 2:14) : (1+x)*log1p(x)-x
end
function energies(m,p,v)
    c=m.base;k=sum(m.h.*(m.S*p/2).*(v.^2*c.ds))/2
    u=c.c2*sum(c.g.area.*c.pref.*compression.((p-c.pref)./c.pref))
    (kinetic=k,potential=u,total=k+u)
end
energy(m::PressureWorkCore,s::BarotropicState)=energies(m,s.p,s.v).total
function discrete_gradient(m,p0,p1,v0,v1)
    c=m.base
    ell=[secant(p0[i],p1[i],c.pref[i]).value for i in eachindex(p0)]
    kappa=(m.S'*(m.h.*((v0.^2+v1.^2)*c.ds)))./(8c.g.area)
    (mu=c.c2*ell+kappa,flux=(m.S*(p0+p1)/4).*((v0+v1)/2),kappa=kappa)
end
# Intentionally empty evolution for the coupled-step RED test.
pressure_step(m,p,v,dt;maxiter=30)=(p=copy(p),v=copy(v),integratedJ=zeros(size(v)))
end
