module GraphRotation
using LinearAlgebra,SparseArrays,SHA,Serialization
using ..ConservativeCore,..GraphWind,..CoupledFCT
export RotationMap,reconstruct,coriolis_tendency,coriolis_step
struct RotationMap
    c::TransportCore
end
RotationMap(c,lat,lon,omega)=RotationMap(c)
reconstruct(m,j)=zeros(2length(m.c.pref),size(j,2))
coriolis_tendency(m,j)=zero(j)
coriolis_step(m,j,h)=copy(j)
end
