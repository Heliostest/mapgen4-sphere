module VectorInvariant
using LinearAlgebra,SparseArrays,SHA,Serialization
using ..ConservativeCore,..ModalAcoustics,..FluxCorrectedTransport,..GraphWind,..PressureWork
import ..ConservativeCore: step!,mass,energy,identity_hash,save_checkpoint,load_checkpoint
export VectorCore,neutral_tendency,neutral_step
struct VectorCore
    pressure::PressureWorkCore
    east::SparseMatrixCSC{Float64,Int}
    north::SparseMatrixCSC{Float64,Int}
    x::Matrix{Float64}
    lat::Vector{Float64}
    lon::Vector{Float64}
    omega::Vector{Float64}
    function VectorCore(pw,lat,lon,omega)
        omega isa AbstractVector&&length(omega)==3&&all(isfinite,omega)||throw(ArgumentError("finite Cartesian rotation required"))
        wind=WindMap(pw.base,lat,lon)
        x=hcat(cos.(lat).*cos.(lon),cos.(lat).*sin.(lon),sin.(lat))
        all(isfinite,2x*omega)||throw(ArgumentError("rotation overflow"))
        new(pw,wind.east,wind.north,x,Float64.(lat),Float64.(lon),Float64.(omega))
    end
end
function neutral_tendency(m,p,v)
    pw=m.pressure;c=pw.base;PressureWork.validate_pv(pw,p,v)
    n=length(p);nl=length(c.ds);pf=pw.S*p/2;H=pw.h.*pf
    ue=(m.east'*(H.*v))./(c.g.area.*p)
    un=(m.north'*(H.*v))./(c.g.area.*p)
    curl=(c.divergence*(m.east*un-m.north*ue))./c.g.area
    f=2m.x*m.omega
    rotation=m.east*(f.*un)-m.north*(f.*ue)
    vorticity=m.east*(curl.*un)-m.north*(curl.*ue)
    K=(pw.S'*(pw.h.*v.^2))./(4c.g.area)
    layerGradient=c.gradient*(K.-K*c.ds)
    L=(c.divergence*(pf.*v)).*transpose(c.ds)
    pdot=-vec(sum(L;dims=2))./c.g.area
    F=zeros(n,nl+1)
    for k in 1:nl;F[:,k+1]=F[:,k]-L[:,k]-c.g.area.*pdot*c.ds[k];end
    bottom=maximum(abs,F[:,end]);scale=max(maximum(abs,L),floatmin(Float64))
    bottom<=128eps(Float64)*scale||throw(StepRejected("momentum sigma bottom closure"))
    vertical=zeros(size(v))
    for k in 1:nl-1
        Q=(pw.h/2).*(pw.S*(F[:,k+1]./c.g.area))
        change=Q.*(v[:,k]-v[:,k+1])/2
        vertical[:,k]+=change./(H*c.ds[k])
        vertical[:,k+1]+=change./(H*c.ds[k+1])
    end
    total=rotation+vorticity+layerGradient+vertical
    all(isfinite,total)&&all(isfinite,curl)&&all(isfinite,F)||throw(StepRejected("nonfinite vector-invariant tendency"))
    (total=total,rotation=rotation,vorticity=vorticity,layerGradient=layerGradient,vertical=vertical,
     curl=curl,verticalFlux=F,bottomResidual=bottom)
end
neutral_step(m,p,v,dt;maxiter=400)=(v=copy(v),iterations=0,equationRelative=0.,energyRelative=0.)
step!(m::VectorCore,s::BarotropicState,dt;kwargs...)=nothing
end
