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
    function AdvectiveState(p,W,velocity,time)
        p isa AbstractVector&&W isa AbstractMatrix&&velocity isa AbstractMatrix || throw(ArgumentError("invalid state arrays"))
        size(W,1)==length(p)&&size(W,2)>0&&size(velocity)==(length(W),2) || throw(ArgumentError("invalid state shape"))
        all(isfinite,p)&&all(p.>0)&&all(isfinite,W)&&all(W.>=0)&&all(isfinite,velocity)&&isfinite(time) || throw(ArgumentError("invalid state values"))
        new(Float64.(p),Matrix{Float64}(W),Matrix{Float64}(velocity),Float64(time))
    end
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
mass(m::AdvectionCore,p)=mass(m.base,p)
energy(m::AdvectionCore,s::AdvectiveState)=sum(vec(mass(m,s.p)).*s.velocity.^2)/2
function validate(m,s)
    c=m.base
    length(s.p)==length(c.pref)&&size(s.W)==(length(c.pref),length(c.ds))&&size(s.velocity)==(length(s.W),2) || throw(ArgumentError("state/core shape mismatch"))
    all(isfinite,s.p)&&all(s.p.>0)&&all(isfinite,s.W)&&all(0 .<=s.W.<=mass(m,s.p))&&all(isfinite,s.velocity)&&isfinite(s.time) || throw(ArgumentError("invalid mass, humidity or velocity"))
end
function identity_hash(m::AdvectionCore)
    io=IOBuffer();g=m.connection
    serialize(io,(version="c6-pressure-upwind-covariant-implicit-v1",base=identity_hash(m.base),lat=g.lat,lon=g.lon,from=g.from,to=g.to,connection=g.connection,east=m.wind.east,north=m.wind.north))
    bytes2hex(sha256(take!(io)))
end
function save_checkpoint(path,m::AdvectionCore,s::AdvectiveState)
    validate(m,s);mkpath(dirname(path))
    serialize(path,(version=6,identity=identity_hash(m),state=s))
end
function load_checkpoint(path,m::AdvectionCore)
    r=deserialize(path)
    r.version==6&&r.identity==identity_hash(m)&&r.state isa AdvectiveState || throw(ArgumentError("checkpoint core identity mismatch"))
    validate(m,r.state)
    AdvectiveState(r.state.p,r.state.W,r.state.velocity,r.state.time)
end
"Atomic first-order pressureless momentum and shared-water advection."
function step!(m::AdvectionCore,s::AdvectiveState,dt::Real;momentum_maxiter=400)
    validate(m,s)
    isfinite(dt)&&dt>0&&isfinite(s.time+dt)&&s.time+dt>s.time || throw(ArgumentError("invalid timestep"))
    c=m.base;n=length(s.p);nl=length(c.ds)
    vn=m.wind.east*reshape(s.velocity[:,1],n,nl)+m.wind.north*reshape(s.velocity[:,2],n,nl)
    j=vn.*ifelse.(vn.>=0,s.p[c.g.from],s.p[c.g.to])
    p=s.p-dt*(c.divergence*(j*c.ds))./c.g.area
    all(isfinite,p)&&all(p.>0) || throw(StepRejected("explicit mass step lost positive pressure"))
    f=shared_transfers(c,s.p,p,dt*j)
    momentum=transport_momentum(m.connection,vec(f.oldmass),vec(f.newmass),f.transfer,s.velocity;maxiter=momentum_maxiter)
    tracer=transport_fct(f.oldmass,f.newmass,f.from,f.to,f.transfer,s.W)
    q=tracer.water./f.newmass
    led=(localAirRelativeResidual=tracer.localAirRelativeResidual,localWaterRelativeResidual=tracer.localWaterRelativeResidual,
        localDryRelativeResidual=tracer.localDryRelativeResidual,momentumRelative=momentum.localRelative,energyRelative=momentum.energyRelative,
        temporalLoss=momentum.temporalLoss,spatialLoss=momentum.spatialLoss,momentumIterations=momentum.iterations,
        qmin=minimum(q),qmax=maximum(q),bottomResidual=f.bottom,dt=Float64(dt))
    s.p=p;s.W=tracer.water;s.velocity=momentum.velocity;s.time+=dt
    led
end
end
