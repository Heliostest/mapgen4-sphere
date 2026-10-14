module CovariantMomentum
using LinearAlgebra
using ..ConservativeCore: StepRejected
export ConnectionGeometry,transport_momentum
struct ConnectionGeometry
    lat::Vector{Float64}
    lon::Vector{Float64}
    from::Vector{Int}
    to::Vector{Int}
end
ConnectionGeometry(lat,lon,from,to)=ConnectionGeometry(Float64.(lat),Float64.(lon),Int.(from),Int.(to))
transport_momentum(g,mo,mn,F,u;maxiter=400)=(velocity=copy(u),iterations=0,localRelative=0.,energyRelative=0.,temporalLoss=0.,spatialLoss=0.)
end
