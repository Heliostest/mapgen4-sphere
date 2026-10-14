module CovariantMomentum
using LinearAlgebra
using ..ConservativeCore: StepRejected
export ConnectionGeometry,transport_momentum,velocity_tendency
struct ConnectionGeometry
    lat::Vector{Float64}
    lon::Vector{Float64}
    from::Vector{Int}
    to::Vector{Int}
    x::Matrix{Float64}
    east::Matrix{Float64}
    north::Matrix{Float64}
    connection::Matrix{Float64}
    function ConnectionGeometry(lat,lon,from,to)
        lat=Float64.(lat);lon=Float64.(lon);a=Int.(from);b=Int.(to);n=length(lat)
        n>0&&length(lon)==n&&length(a)==length(b) || throw(ArgumentError("geometry dimensions"))
        all(isfinite,lat)&&all(isfinite,lon)&&all(abs.(lat).<=pi/2) || throw(ArgumentError("invalid radians"))
        all(1 .<=a.<=n)&&all(1 .<=b.<=n)&&all(a.!=b) || throw(ArgumentError("invalid endpoints"))
        x=hcat(cos.(lat).*cos.(lon),cos.(lat).*sin.(lon),sin.(lat))
        e=hcat(-sin.(lon),cos.(lon),zero.(lon))
        z=hcat(-sin.(lat).*cos.(lon),-sin.(lat).*sin.(lon),cos.(lat))
        C=zeros(length(a),4)
        for k in eachindex(a)
            i,j=a[k],b[k];den=1+dot(x[i,:],x[j,:])
            den>1e-8 || throw(ArgumentError("ambiguous near-antipodal connection"))
            te=e[i,:]-dot(e[i,:],x[j,:])/den*(x[i,:]+x[j,:])
            tn=z[i,:]-dot(z[i,:],x[j,:])/den*(x[i,:]+x[j,:])
            C[k,:]=[dot(e[j,:],te),dot(e[j,:],tn),dot(z[j,:],te),dot(z[j,:],tn)]
            T=[C[k,1] C[k,2];C[k,3] C[k,4]]
            norm(T'T-I,Inf)<5e-12 || throw(ArgumentError("non-isometric connection"))
        end
        new(lat,lon,a,b,x,e,z,C)
    end
end
function validate(g,mo,mn,F,u)
    n=length(g.lat)
    length(mo)==length(mn)==n&&length(F)==length(g.from)&&size(u)==(n,2) || throw(ArgumentError("transport dimensions"))
    all(isfinite,mo)&&all(isfinite,mn)&&all(mo.>0)&&all(mn.>0)&&all(isfinite,F)&&all(isfinite,u) || throw(ArgumentError("nonfinite velocity/flux or nonpositive mass"))
    incoming=zeros(n);outgoing=zeros(n)
    for k in eachindex(F)
        a,b=F[k]>=0 ? (g.from[k],g.to[k]) : (g.to[k],g.from[k]);f=abs(F[k])
        outgoing[a]+=f;incoming[b]+=f
    end
    maximum(abs.(mn-mo-incoming+outgoing)./max.(mo,mn,incoming,outgoing))<5e-13 || throw(StepRejected("mass and momentum transfers disagree"))
    incoming,outgoing
end
@inline function edge(g,k,f,u)
    C=g.connection
    if f>=0
        a,b=g.from[k],g.to[k]
        return a,b,C[k,1]*u[a,1]+C[k,2]*u[a,2],C[k,3]*u[a,1]+C[k,4]*u[a,2]
    else
        a,b=g.to[k],g.from[k]
        return a,b,C[k,1]*u[a,1]+C[k,3]*u[a,2],C[k,2]*u[a,1]+C[k,4]*u[a,2]
    end
end
function incoming!(rhs,g,F,u)
    @inbounds for k in eachindex(F)
        _,b,v1,v2=edge(g,k,F[k],u);f=abs(F[k])
        rhs[b,1]+=f*v1;rhs[b,2]+=f*v2
    end
    rhs
end
"Instantaneous material velocity tendency for the same directed mass rates."
function velocity_tendency(g,m,F,u)
    # Validate finite inputs; rates need not define a positive finite-time mass.
    n=length(g.lat)
    length(m)==n&&length(F)==length(g.from)&&size(u)==(n,2) || throw(ArgumentError("tendency dimensions"))
    all(isfinite,m)&&all(m.>0)&&all(isfinite,F)&&all(isfinite,u) || throw(ArgumentError("invalid tendency inputs"))
    rhs=zeros(n,2)
    @inbounds for k in eachindex(F)
        _,b,v1,v2=edge(g,k,F[k],u);f=abs(F[k])
        rhs[b,1]+=f*(v1-u[b,1]);rhs[b,2]+=f*(v2-u[b,2])
    end
    rhs./m
end
function transport_momentum(g,mo,mn,F,u;maxiter=400)
    maxiter isa Integer&&maxiter>0 || throw(ArgumentError("positive iteration count required"))
    inc,out=validate(g,mo,mn,F,u)
    all(iszero,F)&&return (velocity=copy(u),iterations=0,localRelative=0.,energyRelative=0.,temporalLoss=0.,spatialLoss=0.)
    diagonal=mn+out;base=mo.*u;v=copy(u);next=similar(v);iterations=0
    scale=max(maximum(abs,u),floatmin(Float64));converged=false
    for k in 1:maxiter
        copyto!(next,base);incoming!(next,g,F,v);next./=diagonal
        delta=maximum(abs,next-v);v,next=next,v;iterations=k
        if delta<=8eps(Float64)*scale;converged=true;break;end
    end
    converged&&all(isfinite,v) || throw(StepRejected("momentum iteration failed"))
    rhs=copy(base);incoming!(rhs,g,F,v)
    localRelative=maximum(abs.(diagonal.*v-rhs)./((mo+inc+out).*scale))
    ko=sum(mo.*u.^2)/2;kn=sum(mn.*v.^2)/2
    temporal=sum(mo.*(v-u).^2)/2;spatial=0.
    @inbounds for k in eachindex(F)
        _,b,v1,v2=edge(g,k,F[k],v)
        spatial+=abs(F[k])*((v[b,1]-v1)^2+(v[b,2]-v2)^2)/2
    end
    energyRelative=abs(kn-ko+temporal+spatial)/max(ko,floatmin(Float64))
    localRelative<5e-12&&energyRelative<5e-12 || throw(StepRejected("momentum or energy identity failed"))
    (velocity=v,iterations=iterations,localRelative=localRelative,energyRelative=energyRelative,temporalLoss=temporal,spatialLoss=spatial)
end
end
