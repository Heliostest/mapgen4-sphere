module CompatibleMomentum
using LinearAlgebra,SparseArrays
using ..ConservativeCore,..ModalAcoustics,..GraphRotation,..CovariantMomentum
export CompatibleTransport,split_tendency,transport_step
struct CompatibleTransport
    rotation::RotationMap
    connection::ConnectionGeometry
    refmass::Vector{Float64}
    RP::SparseMatrixCSC{Float64,Int}
end
function CompatibleTransport(rot,lat,lon)
    c=rot.c;nl=length(c.ds)
    f=shared_transfers(c,c.pref,c.pref,zeros(length(c.prefFace),nl))
    CompatibleTransport(rot,ConnectionGeometry(repeat(lat,nl),repeat(lon,nl),f.from,f.to),vec(mass(c,c.pref)),rot.R*rot.P)
end
split_tendency(m,j,F)=zero(j)
transport_step(m,j,F;maxiter=400)=(j=copy(j),iterations=0,equationRelative=0.,energyRelative=0.,loss=0.)
end
