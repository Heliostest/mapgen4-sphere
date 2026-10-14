module GraphRotation
using LinearAlgebra,SparseArrays,SHA,Serialization
using ..ConservativeCore,..GraphWind,..CoupledFCT
export RotationMap,reconstruct,coriolis_tendency,coriolis_step
struct RotationMap
    c::TransportCore
    P::SparseMatrixCSC{Float64,Int}
    R::SparseMatrixCSC{Float64,Int}
    PJ::SparseMatrixCSC{Float64,Int}
    RPJ::SparseMatrixCSC{Float64,Int}
    omega::Vector{Float64}
    cache::Dict{Float64,Any}
end
"""Metric-adjoint nodal reconstruction and energy-neutral graph Coriolis.
The reference metric is fixed. R is not an inverse, and j is never projected.
"""
function RotationMap(c,lat,lon,omega)
    omega isa AbstractVector && length(omega)==3 && all(isfinite,omega) || throw(ArgumentError("finite Cartesian rotation vector required"))
    wind=WindMap(c,lat,lon);n=length(c.pref)
    x=hcat(cos.(lat).*cos.(lon),cos.(lat).*sin.(lon),sin.(lat))
    f=2x*omega;all(isfinite,f)||throw(ArgumentError("rotation overflow"))
    P=hcat(wind.east,wind.north)*spdiagm(0=>repeat(c.pref,2))
    H=c.g.edgeLength.*c.g.centerDistance./c.prefFace
    R=spdiagm(0=>1 ./repeat(c.g.area.*c.pref,2))*P'*spdiagm(0=>H)
    J=sparse(vcat(1:n,n+1:2n),vcat(n+1:2n,1:n),vcat(f,-f),2n,2n)
    PJ=P*J
    RotationMap(c,P,R,PJ,R*PJ,Float64.(omega),Dict{Float64,Any}())
end
function validate(m,j)
    j isa AbstractMatrix && size(j)==(length(m.c.prefFace),length(m.c.ds)) && all(isfinite,j) || throw(ArgumentError("invalid graph momentum"))
end
reconstruct(m,j)=(validate(m,j);m.R*j)
coriolis_tendency(m,j)=m.PJ*reconstruct(m,j)
function coriolis_step(m,j,h::Real)
    validate(m,j);isfinite(h)||throw(ArgumentError("finite rotation timestep required"))
    (h==0||all(iszero,m.omega))&&return copy(j)
    rhs=m.R*j
    factor=get!(m.cache,Float64(h)) do
        lu(sparse(I,size(m.R,1),size(m.R,1))-(h/2)*m.RPJ)
    end
    z=factor\rhs
    next=j+h*(m.PJ*z)
    all(isfinite,next)||throw(StepRejected("nonfinite Coriolis solve"))
    residual=next-j-h*(m.PJ*(m.R*((j+next)/2)))
    scale=max(maximum(abs,j),maximum(abs,next),floatmin(Float64))
    maximum(abs,residual)<=2e-11*scale || throw(StepRejected("Coriolis midpoint residual"))
    next
end
end
