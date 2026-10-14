module ConservativeCore
using SparseArrays, LinearAlgebra, Serialization, SHA
export Geometry,TransportCore,State,step!,advance!,mass,energy,StepRejected,
       save_checkpoint,load_checkpoint,transport_tracer,identity_hash

struct Geometry
    area::Vector{Float64}
    from::Vector{Int}
    to::Vector{Int}
    edgeLength::Vector{Float64}
    centerDistance::Vector{Float64}
    radius::Float64
    function Geometry(area,from,to,len,dist,radius)
        a,f,t,l,d=Float64.(area),Int.(from),Int.(to),Float64.(len),Float64.(dist)
        n=length(a);ne=length(f)
        n>0 && length(t)==length(l)==length(d)==ne || throw(ArgumentError("invalid geometry shape"))
        all(x->isfinite(x)&&x>0,a) && all(x->isfinite(x)&&x>0,l) && all(x->isfinite(x)&&x>0,d) && isfinite(radius) && radius>0 || throw(ArgumentError("geometry must be finite and positive"))
        all(i->1<=i<=n,f) && all(i->1<=i<=n,t) && all(f.!=t) || throw(ArgumentError("invalid edge endpoint"))
        new(a,f,t,l,d,Float64(radius))
    end
end

struct StepRejected <: Exception
    reason::String
end
Base.showerror(io::IO,e::StepRejected)=print(io,"StepRejected: ",e.reason)

mutable struct State
    p::Vector{Float64} # Pa, authoritative cell pressure
    W::Matrix{Float64} # area * ds * pressure * humidity, authoritative water
    j::Matrix{Float64} # Pa m/s, persistent acoustic pressure flux on shared edges
    time::Float64
    function State(p,W,j,time)
        all(x->isfinite(x)&&x>0,p) || throw(ArgumentError("pressure must be positive"))
        all(x->isfinite(x)&&x>=0,W) || throw(ArgumentError("water must be nonnegative"))
        all(isfinite,j) && isfinite(time) || throw(ArgumentError("state must be finite"))
        size(W,1)==length(p) || throw(ArgumentError("state size mismatch"))
        new(Float64.(p),Matrix{Float64}(W),Matrix{Float64}(j),Float64(time))
    end
end

struct TransportCore
    g::Geometry
    pref::Vector{Float64}
    prefFace::Vector{Float64}
    ds::Vector{Float64}
    c2::Float64
    B::SparseMatrixCSC{Float64,Int}
    gradient::SparseMatrixCSC{Float64,Int}
    stiffness::SparseMatrixCSC{Float64,Int}
    method::Symbol
    cache::Dict{Float64,Any}
end

function TransportCore(g,pref,ds;c2=287.04*288,gradient=nothing,method=:tpfa)
    p=Float64.(pref);s=Float64.(ds);n=length(g.area);ne=length(g.from)
    length(p)==n && all(x->isfinite(x)&&x>0,p) || throw(ArgumentError("invalid reference pressure"))
    all(x->isfinite(x)&&x>0,s) && isapprox(sum(s),1.;atol=1e-14,rtol=0) || throw(ArgumentError("sigma thicknesses must be positive and sum to one"))
    isfinite(c2)&&c2>0 || throw(ArgumentError("c2 must be positive"))
    B=sparse(vcat(g.from,g.to),vcat(1:ne,1:ne),vcat(ones(ne),-ones(ne)),n,ne)
    gr=gradient===nothing ? spdiagm(0=>1 ./ (g.radius*g.centerDistance))*transpose(B) : sparse(Float64.(gradient))
    size(gr)==(ne,n) && maximum(abs,gr*ones(n))<1e-10/g.radius || throw(ArgumentError("gradient must annihilate a constant"))
    pf=(p[g.from]+p[g.to])/2
    stiffness=B*spdiagm(0=>g.edgeLength/g.radius.*pf)*gr
    TransportCore(g,p,pf,s,Float64(c2),B,gr,stiffness,method,Dict{Float64,Any}())
end

mass(c,p)=(c.g.area.*p)*transpose(c.ds)

"""Implicit upwind using exactly the supplied integrated oriented mass transfers.
The old/new masses must obey local continuity. No clipping or correction.
"""
function transport_tracer(oldmass,newmass,from,to,F,water)
    mo,mn,w=vec(oldmass),vec(newmass),vec(water);n=length(mo)
    length(mn)==length(w)==n && length(from)==length(to)==length(F) || throw(ArgumentError("transport shape mismatch"))
    all(>(0),mo)&&all(>(0),mn)&&all(>=(0),w)&&all(isfinite,F) || throw(ArgumentError("invalid transport inputs"))
    d=copy(mn);incoming=zeros(n)
    rows=Int[];cols=Int[];vals=Float64[]
    sizehint!(rows,n+length(F));sizehint!(cols,n+length(F));sizehint!(vals,n+length(F))
    for e in eachindex(F)
        a,b=from[e],to[e];f=F[e]
        incoming[a]-=f;incoming[b]+=f
        if f<0;a,b=b,a;f=-f;end
        d[a]+=f
        push!(rows,b);push!(cols,a);push!(vals,-f)
    end
    localair=mn-mo-incoming
    scale=max(maximum(mo),maximum(mn))
    maximum(abs,localair)<=2e-11*scale || throw(StepRejected("mass/tracer local continuity mismatch"))
    append!(rows,1:n);append!(cols,1:n);append!(vals,d)
    matrix=sparse(rows,cols,vals,n,n)
    q=matrix\w
    all(isfinite,q)&&minimum(q)>=0 || throw(StepRejected("nonpositive implicit tracer solve"))
    maximum(q)<=maximum(w./mo)+2e-11*max(maximum(w./mo),1e-30) || throw(StepRejected("tracer upper bound violated"))
    newwater=mn.*q
    waterincoming=zeros(n)
    for e in eachindex(F)
        a,b=from[e],to[e];f=F[e]
        transfer=f*(f>=0 ? q[a] : q[b])
        waterincoming[a]-=transfer;waterincoming[b]+=transfer
    end
    localwater=newwater-w-waterincoming
    (water=reshape(newwater,size(water)),localAirResidual=maximum(abs,localair),localWaterResidual=maximum(abs,localwater),linearResidual=maximum(abs,matrix*q-w))
end

"""One atomic BE acoustic and shared-flux tracer step. Rejections leave State intact."""
function step!(c::TransportCore,s::State,dt::Real)
    isfinite(dt)&&dt>0 || throw(ArgumentError("time step must be positive"))
    g=c.g;n=length(g.area);nl=length(c.ds);ne=length(g.from)
    length(s.p)==n && size(s.W)==(n,nl) && size(s.j)==(ne,nl) || throw(ArgumentError("state/core size mismatch"))
    rhs=g.area.*s.p-dt*(c.B*((g.edgeLength/g.radius).*(s.j*c.ds)))
    minimum(rhs)>0 || throw(StepRejected("nonpositive pressure predictor; subdivide"))
    factor=get!(c.cache,Float64(dt)) do
        lu(spdiagm(0=>g.area.*c.pref)+dt^2*c.c2*c.stiffness)
    end
    ratio=factor\rhs
    p=c.pref.*ratio
    all(isfinite,p)&&minimum(p)>0 || throw(StepRejected("nonpositive solved pressure; subdivide"))
    impulse=dt*c.c2*c.prefFace.*(c.gradient*ratio)
    j=s.j.+impulse
    F=dt.*(g.edgeLength/g.radius).*j.*transpose(c.ds)
    oldmass=mass(c,s.p);newmass=mass(c,p)
    horizontal=-(c.B*F)
    vertical=zeros(n,nl+1)
    for k in 1:nl
        vertical[:,k+1]=vertical[:,k]+horizontal[:,k]-(newmass[:,k]-oldmass[:,k])
    end
    # Closed bottom boundary, with its unconstrained residual reported separately.
    bottom=maximum(abs,vertical[:,end])
    bottom<=2e-11*maximum(oldmass) || throw(StepRejected("sigma bottom closure residual"))
    from=Vector{Int}(undef,ne*nl+n*(nl-1));to=similar(from);transfer=Vector{Float64}(undef,length(from))
    for k in 1:nl
        r=(k-1)*ne+1:k*ne
        from[r]=g.from.+(k-1)*n;to[r]=g.to.+(k-1)*n;transfer[r]=F[:,k]
    end
    for k in 1:nl-1
        r=ne*nl+(k-1)*n+1:ne*nl+k*n
        from[r]=collect(1:n).+(k-1)*n;to[r]=collect(1:n).+k*n;transfer[r]=vertical[:,k+1]
    end
    tr=transport_tracer(oldmass,newmass,from,to,transfer,s.W)
    air=sum(newmass)-sum(oldmass);water=sum(tr.water)-sum(s.W)
    pressureResidual=maximum(abs,g.area.*(p-s.p)+vec(sum(c.B*F,dims=2)))
    q=tr.water./newmass
    ledger=(airResidual=abs(air),waterResidual=abs(water),dryResidual=abs(air-water),localAirResidual=tr.localAirResidual,localWaterResidual=tr.localWaterResidual,bottomResidual=bottom,pressureResidual=pressureResidual,tracerLinearResidual=tr.linearResidual,qmin=minimum(q),qmax=maximum(q),pmin=minimum(p),dt=Float64(dt))
    s.p=p;s.W=tr.water;s.j=j;s.time+=dt
    ledger
end

function advance!(c,s,interval;minimum_dt=interval/2^16)
    target=s.time+interval;accepted=Any[];rejections=0
    while s.time<target
        dt=target-s.time
        while true
            try
                push!(accepted,step!(c,s,dt));break
            catch e
                e isa StepRejected || rethrow()
                rejections+=1;dt/=2
                dt>=minimum_dt || throw(StepRejected("minimum dt reached; $(e.reason)"))
            end
        end
    end
    (steps=accepted,rejections=rejections)
end

function energy(c,s)
    r=s.p./c.pref;rbar=sum(c.g.area.*s.p)/sum(c.g.area.*c.pref)
    .5c.c2*sum(c.g.area.*c.pref.*(r.-rbar).^2)+.5sum((c.g.edgeLength.*c.g.centerDistance./c.prefFace).*vec(sum(s.j.^2.*transpose(c.ds),dims=2)))
end

function identity_hash(c)
    io=IOBuffer()
    serialize(io,(version=1,geometry=c.g,pref=c.pref,ds=c.ds,c2=c.c2,gradient=c.gradient,method=c.method))
    bytes2hex(sha256(take!(io)))
end
function save_checkpoint(path,c,s)
    mkpath(dirname(path))
    serialize(path,(version=1,identity=identity_hash(c),state=s))
end
function load_checkpoint(path,c)
    record=deserialize(path)
    record.version==1 && record.identity==identity_hash(c) || throw(ArgumentError("checkpoint core identity mismatch"))
    s=record.state
    State(s.p,s.W,s.j,s.time)
end
end
