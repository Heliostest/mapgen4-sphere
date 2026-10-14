module CompatibleMomentum
using LinearAlgebra,SparseArrays
using ..ConservativeCore,..ModalAcoustics,..GraphRotation,..GraphWind,..CovariantMomentum
export CompatibleTransport,split_tendency,transport_step
struct CompatibleTransport
    rotation::RotationMap
    connection::ConnectionGeometry
    refmass::Vector{Float64}
    RP::SparseMatrixCSC{Float64,Int}
end
function CompatibleTransport(rot,lat,lon)
    c=rot.c;nl=length(c.ds)
    wind=WindMap(c,lat,lon)
    expected=hcat(wind.east,wind.north)*spdiagm(0=>repeat(c.pref,2))
    norm(rot.P-expected)<=1e-12*norm(expected) || throw(ArgumentError("rotation/connection coordinates disagree"))
    f=shared_transfers(c,c.pref,c.pref,zeros(length(c.prefFace),nl))
    CompatibleTransport(rot,ConnectionGeometry(repeat(lat,nl),repeat(lon,nl),f.from,f.to),vec(mass(c,c.pref)),rot.R*rot.P)
end
function validate(m,j,F)
    c=m.rotation.c
    j isa AbstractMatrix&&size(j)==(length(c.prefFace),length(c.ds))&&F isa AbstractVector&&length(F)==length(m.connection.from) || throw(ArgumentError("transport dimensions"))
    all(isfinite,j)&&all(isfinite,F) || throw(ArgumentError("nonfinite momentum or transfers"))
end
# C5 matrix: (east nodes; north nodes) x layers. C6 connection: layer-major
# nodes x (east,north). Convert explicitly so sigma weights are applied once.
function unpack(m,V)
    n=length(m.rotation.c.pref)
    hcat(vec(V[1:n,:]),vec(V[n+1:2n,:]))
end
function pack(m,u)
    n=length(m.rotation.c.pref);nl=length(m.rotation.c.ds)
    vcat(reshape(u[:,1],n,nl),reshape(u[:,2],n,nl))
end
function nodal(m,F,u)
    result=zeros(size(u));g=m.connection
    @inbounds for k in eachindex(F)
        a,b,t1,t2=CovariantMomentum.edge(g,k,F[k],u);f=abs(F[k])
        result[a,1]-=f/2*u[a,1];result[a,2]-=f/2*u[a,2]
        result[b,1]+=f*(t1-u[b,1]/2);result[b,2]+=f*(t2-u[b,2]/2)
    end
    result
end
function split_tendency(m,j,F)
    validate(m,j,F)
    m.rotation.P*pack(m,nodal(m,F,unpack(m,m.rotation.R*j))./m.refmass)
end
function transport_step(m,j,F;maxiter=400)
    validate(m,j,F)
    maxiter isa Integer&&maxiter>0 || throw(ArgumentError("positive iteration count required"))
    all(iszero,F)&&return (j=copy(j),iterations=0,equationRelative=0.,energyRelative=0.,loss=0.)
    base=unpack(m,m.rotation.R*j);u=copy(base);scale=max(maximum(abs,base),floatmin(Float64));iterations=0;converged=false
    for k in 1:maxiter
        next=base+unpack(m,m.RP*pack(m,nodal(m,F,u)./m.refmass))/2
        all(isfinite,next) || throw(StepRejected("nonfinite compatible midpoint iteration"))
        delta=maximum(abs,next-u);u=next;iterations=k
        if delta<=8eps(Float64)*scale;converged=true;break;end
    end
    converged || throw(StepRejected("compatible midpoint iteration did not converge"))
    next=j+m.rotation.P*pack(m,nodal(m,F,u)./m.refmass)
    all(isfinite,next)||throw(StepRejected("nonfinite compatible edge update"))
    midpoint=(j+next)/2
    residual=next-j-split_tendency(m,midpoint,F)
    equationRelative=maximum(abs,residual)/max(maximum(abs,j),maximum(abs,next),floatmin(Float64))
    z=unpack(m,m.rotation.R*midpoint);loss=0.;g=m.connection
    @inbounds for k in eachindex(F)
        _,b,t1,t2=CovariantMomentum.edge(g,k,F[k],z)
        loss+=abs(F[k])/2*((z[b,1]-t1)^2+(z[b,2]-t2)^2)
    end
    c=m.rotation.c;H=(c.g.edgeLength.*c.g.centerDistance./c.prefFace)*transpose(c.ds)
    ko=sum(H.*j.^2)/2;kn=sum(H.*next.^2)/2
    energyRelative=abs(kn-ko+loss)/max(ko,floatmin(Float64))
    equationRelative<5e-12&&energyRelative<5e-12||throw(StepRejected("compatible momentum/energy residual"))
    (j=next,iterations=iterations,equationRelative=equationRelative,energyRelative=energyRelative,loss=loss)
end
end
