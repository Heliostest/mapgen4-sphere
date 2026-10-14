module MimeticGradient

using SparseArrays

export reconstruction_gradient, pair_decomposition

"""
    reconstruction_gradient(mesh) -> SparseMatrixCSC{Float64,Int}

Angular pressure-gradient quadrature on a reduced longitude-ring mesh. Each
row uses the original mesh edge's coordinate direction, positive from-minus-to.
Zonal rows retain the adjacent-cell difference divided by angular normal
distance. At a meridional quadrature, each ring is periodically linearly
interpolated to the SAME edge longitude before the south-minus-north difference
is divided by latitude separation. Physical gradient is D/R.

This D is intended with its weighted adjoint divergence D'*diag(H)/R, where
H=edgeLength*centerDistance. It must NOT silently be combined with the original
geographic incidence divergence. Quadrature locations and shared transport
pairs are distinct objects. The variational stiffness is D'*diag(H*pref_face)*D.

The construction preserves Gaussian cell ordering and does not modify areas.
It does not claim pointwise polar consistency, a general M-matrix property, or
equivalence to native spectral dynamics. See the separate refinement evidence.
"""
function reconstruction_gradient(mesh)
    n, ne = length(mesh.area), length(mesh.from)
    length(mesh.to)==length(mesh.centerDistance)==length(mesh.edgeKind)==length(mesh.edgeLon)==ne ||
        throw(ArgumentError("inconsistent quadrature arrays"))
    length(mesh.ringIndex)==length(mesh.lon)==n || throw(ArgumentError("inconsistent cell arrays"))
    all(isfinite,mesh.centerDistance) && all(>(0),mesh.centerDistance) ||
        throw(ArgumentError("quadrature distances must be positive and finite"))
    all(isfinite,mesh.lon) && all(isfinite,mesh.edgeLon) || throw(ArgumentError("longitudes must be finite"))
    all(k->1<=k<=n,mesh.from) && all(k->1<=k<=n,mesh.to) || throw(ArgumentError("invalid quadrature cell index"))
    rings=[sort(findall(==(r),mesh.ringIndex);by=i->mesh.lon[i]) for r in 1:maximum(mesh.ringIndex)]
    all(ids->length(ids)>=2,rings) || throw(ArgumentError("each indexed ring needs at least two cells"))
    I,J,V=Int[],Int[],Float64[]
    function interpolate!(e,ring,longitude,factor)
        ids=rings[ring]
        width=2pi/length(ids)
        fractional=mod(longitude-mesh.lon[first(ids)],2pi)/width
        left=floor(Int,fractional)
        alpha=fractional-left
        push!(I,e);push!(J,ids[mod1(left+1,length(ids))]);push!(V,factor*(1-alpha))
        push!(I,e);push!(J,ids[mod1(left+2,length(ids))]);push!(V,factor*alpha)
    end
    for e in 1:ne
        i,j=mesh.from[e],mesh.to[e]
        scale=1/mesh.centerDistance[e]
        if mesh.edgeKind[e]==:zonal
            push!(I,e,e);push!(J,i,j);push!(V,scale,-scale)
        elseif mesh.edgeKind[e]==:meridional
            interpolate!(e,mesh.ringIndex[i],mesh.edgeLon[e],scale)
            interpolate!(e,mesh.ringIndex[j],mesh.edgeLon[e],-scale)
        else
            throw(ArgumentError("unsupported quadrature kind $(mesh.edgeKind[e])"))
        end
    end
    sparse(I,J,V,ne,n)
end

"""
    pair_decomposition(D,H,R) -> (from,to,quadrature,coefficient)

Represent each row's signed adjoint-divergence contribution as shared pair
transfers. For positive row coefficients a_i, negative coefficients -b_j and
s=sum(a), create every pair i->j with coefficient (H_e/R)*a_i*b_j/s. If j_e is
the persistent quadrature pressure momentum, its signed layer mass transfer is
dt*ds_k*coefficient*j_e. Negative j reverses the actual transport direction.

Summing the resulting pair incidence equals D'*diag(H)*j/R to floating-point
roundoff. This construction requires each D row to sum to zero. A materially
unbalanced row throws; no row coefficient or global residual is repaired.
Zero rows produce no pairs. Pair duplicates from distinct quadrature rows are
retained so momentum history and tracer flux origins remain explicit.
"""
function pair_decomposition(D::AbstractMatrix,H::AbstractVector,R::Real)
    ne,n=size(D)
    length(H)==ne || throw(ArgumentError("H must have one value per quadrature"))
    isfinite(R) && R>0 || throw(ArgumentError("radius must be positive and finite"))
    all(isfinite,H) && all(>(0),H) || throw(ArgumentError("quadrature weights must be positive and finite"))
    rowmatrix=sparse(transpose(Float64.(D)))
    all(isfinite,nonzeros(rowmatrix)) || throw(ArgumentError("gradient coefficients must be finite"))
    from,to,quadrature=Int[],Int[],Int[]
    coefficient=Float64[]
    for e in 1:ne
        range=nzrange(rowmatrix,e)
        ids=rowvals(rowmatrix)[range]
        values=nonzeros(rowmatrix)[range]
        positive=findall(>(0),values)
        negative=findall(<(0),values)
        isempty(positive) && isempty(negative) && continue
        (!isempty(positive) && !isempty(negative)) || throw(ArgumentError("gradient row $e must have both signs"))
        s=sum(values[positive]); t=-sum(values[negative])
        abs(s-t)<=64eps(Float64)*max(s,t) || throw(ArgumentError("gradient row $e does not sum to zero"))
        for a in positive,b in negative
            weight=(H[e]/R)*values[a]*(-values[b])/s
            isfinite(weight) && weight>0 || throw(ArgumentError("invalid transfer coefficient at quadrature $e"))
            push!(from,ids[a]);push!(to,ids[b]);push!(quadrature,e);push!(coefficient,weight)
        end
    end
    (;from,to,quadrature,coefficient)
end

end # module
