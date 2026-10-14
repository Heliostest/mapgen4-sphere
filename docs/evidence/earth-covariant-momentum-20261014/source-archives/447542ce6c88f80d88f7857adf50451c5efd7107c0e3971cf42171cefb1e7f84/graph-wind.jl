module GraphWind
using LinearAlgebra,SparseArrays
using ..ConservativeCore
export WindMap,import_wind,hodge_split
struct WindMap
    c::TransportCore
    east::SparseMatrixCSC{Float64,Int}
    north::SparseMatrixCSC{Float64,Int}
    factor::Any
end

"""Map all cell samples to effective C3 edges in the existing cell/edge order.
Angles are radians. The constructor rejects non-geodesic or reconstructed-face
cores: the nodal weak-divergence contract is specific to the two-point graph.
"""
function WindMap(c::TransportCore,lat,lon)
    g=c.g;n=length(g.area);ne=length(g.from)
    length(lat)==length(lon)==n || throw(ArgumentError("coordinate shape mismatch"))
    all(isfinite,lat)&&all(isfinite,lon)&&all(abs.(lat).<=pi/2) || throw(ArgumentError("invalid radians"))
    x=hcat(cos.(lat).*cos.(lon),cos.(lat).*sin.(lon),sin.(lat))
    east=hcat(-sin.(lon),cos.(lon),zero.(lon))
    north=hcat(-sin.(lat).*cos.(lon),-sin.(lat).*sin.(lon),cos.(lat))
    rows=Int[];cols=Int[];eu=Float64[];nv=Float64[]
    for e in 1:ne
        i,k=g.from[e],g.to[e];d=g.centerDistance[e]
        actual=atan(norm(cross(x[i,:],x[k,:])),dot(x[i,:],x[k,:]))
        0<actual<pi && isapprox(d,actual;atol=1e-12,rtol=1e-10) || throw(ArgumentError("coordinate/graph distance mismatch"))
        delta=x[k,:]-x[i,:]
        for node in (i,k)
            push!(rows,e);push!(cols,node)
            push!(eu,dot(delta,east[node,:])/(2d))
            push!(nv,dot(delta,north[node,:])/(2d))
        end
    end
    B=sparse(vcat(g.from,g.to),vcat(1:ne,1:ne),vcat(ones(ne),-ones(ne)),n,ne)
    expected=spdiagm(0=>1 ./ (g.radius*g.centerDistance))*B'
    norm(c.gradient-expected)<=2e-13*norm(expected) || throw(ArgumentError("wind map requires the two-point graph gradient"))
    # Pin a scalar potential gauge. No change to the divergence RHS or state.
    factor=try
        cholesky(Symmetric(c.stiffness[1:n-1,1:n-1]))
    catch
        throw(ArgumentError("graph must have one connected positive-energy component"))
    end
    WindMap(c,sparse(rows,cols,eu,ne,n),sparse(rows,cols,nv,ne,n),factor)
end

"""Return graph j [Pa m/s], using actual pressure times native east/north winds.
Sigma thickness is NOT applied here. The frozen shared transport applies it.
No potential-only projection, cell correction, clipping, or spectral truncation.
"""
function import_wind(m::WindMap,p,u,v)
    n=length(m.c.pref);nl=length(m.c.ds)
    p isa AbstractVector && length(p)==n && size(u)==size(v)==(n,nl) || throw(ArgumentError("native wind/pressure/layer shape mismatch"))
    all(x->isfinite(x)&&x>0,p)&&all(isfinite,u)&&all(isfinite,v) || throw(ArgumentError("invalid pressure or wind"))
    j=m.east*(p.*u)+m.north*(p.*v)
    all(isfinite,j) || throw(ArgumentError("nonfinite imported momentum"))
    j
end

"""Diagnostic kinetic-metric Hodge split; return BOTH components unchanged.
K=divergence*prefFace*gradient, H=edgeLength*distance/prefFace.
The graph cycle space, rather than a separate native spectral vorticity, is
retained. The full residual (including the pinned row) certifies compatibility.
"""
function hodge_split(m::WindMap,j)
    c=m.c;n=length(c.pref)
    size(j)==(length(c.prefFace),length(c.ds))&&all(isfinite,j) || throw(ArgumentError("invalid graph momentum"))
    rhs=c.divergence*j;phi=zeros(n,size(j,2))
    phi[1:n-1,:]=m.factor\rhs[1:n-1,:]
    for _ in 1:2
        residual=rhs-c.stiffness*phi
        phi[1:n-1,:]+=m.factor\residual[1:n-1,:]
    end
    divergent=c.prefFace.*(c.gradient*phi);solenoidal=j-divergent
    residual=c.divergence*solenoidal
    scale=max(maximum(abs,abs.(c.divergence)*abs.(j)),floatmin(Float64))
    maximum(abs,residual)<=1e-10*scale || throw(ArgumentError("incompatible Hodge residual"))
    (divergent=divergent,solenoidal=solenoidal,potential=phi,relativeResidual=maximum(abs,residual)/scale)
end
end
