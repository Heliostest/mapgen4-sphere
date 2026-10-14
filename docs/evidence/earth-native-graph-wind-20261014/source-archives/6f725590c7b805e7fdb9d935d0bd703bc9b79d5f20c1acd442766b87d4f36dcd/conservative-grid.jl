module ConservativeGrid

export Mesh, build_gaussian_mesh, sample_native_velocity

"""
Finite-volume geometry on a unit sphere, with cells in the input ordering.

`area` is steradians; angular lengths/distances and all coordinates are radians.
Each internal edge appears once. `:zonal` edges point east, `:meridional` edges
point from the southern ring to the northern ring. Two-cell rings have two
distinct zonal faces between the same pair of cells. There are no exterior pole
faces. Multiplying area by R² and edgeLength/centerDistance by R gives SI geometry.

`centerDistance` is the normal coordinate distance (parallel arc for zonal,
latitude difference for meridional), not the great-circle separation between
longitude-staggered adjacent cell centers.
"""
struct Mesh
    area::Vector{Float64}
    from::Vector{Int}
    to::Vector{Int}
    edgeLength::Vector{Float64}
    centerDistance::Vector{Float64}
    edgeKind::Vector{Symbol}
    lat::Vector{Float64}
    lon::Vector{Float64}
    edgeLat::Vector{Float64}
    edgeLon::Vector{Float64}
    ringIndex::Vector{Int}
end

# Split periodic longitude arcs at the arbitrary 0/2π coordinate seam.
function longitude_pieces(ids, lon, width)
    pieces = Tuple{Float64,Float64,Int}[]
    for i in ids
        lo, hi = lon[i] - width/2, lon[i] + width/2
        if lo < 0
            push!(pieces, (0.0, hi, i), (lo+2pi, 2pi, i))
        elseif hi > 2pi
            push!(pieces, (lo, 2pi, i), (0.0, hi-2pi, i))
        else
            push!(pieces, (lo, hi, i))
        end
    end
    sort!(pieces; by=first)
end

"""
    build_gaussian_mesh(latDegrees, lonDegrees, weights) -> Mesh

Construct a reduced, equally spaced longitude-ring mesh from per-cell Gaussian
quadrature weights normalized to sum one. Areas are exactly `4π .* weights`:
no remapping, latitude-cosine replacement, or normalization is performed.
Latitude boundaries follow cumulative ring weight in sin(latitude), closing
at both poles. Shared north/south faces are the overlaps of longitude arcs.

Each ring needs at least two distinct equally spaced longitude centers and
equal per-cell weights. Ring centers must lie inside their area-derived bands.
Longitude origins may differ between rings. Invalid inputs throw ArgumentError.
"""
function build_gaussian_mesh(latDegrees, lonDegrees, weights)
    n = length(weights)
    n > 0 || throw(ArgumentError("at least one latitude ring is required"))
    length(latDegrees) == length(lonDegrees) == n || throw(ArgumentError("latitude, longitude, and weight lengths must agree"))
    latd, lond, w = Float64.(latDegrees), Float64.(lonDegrees), Float64.(weights)
    all(isfinite, latd) && all(isfinite, lond) && all(isfinite, w) || throw(ArgumentError("geometry values must be finite"))
    all(x -> -90 < x < 90, latd) || throw(ArgumentError("cell centers must lie strictly between the poles"))
    all(>(0), w) || throw(ArgumentError("cell weights must be positive"))
    isapprox(sum(w), 1.0; atol=1e-12, rtol=0) || throw(ArgumentError("Gaussian cell weights must already sum to one"))
    lat, lon = deg2rad.(latd), deg2rad.(mod.(lond, 360.0))
    centers = sort(unique(lat))
    rings = [sort(findall(==(phi), lat); by=i -> lon[i]) for phi in centers]
    ringIndex = zeros(Int, n)
    mu = [-1.0]
    cumulative_weight = 0.0
    for (r, ids) in enumerate(rings)
        length(ids) >= 2 || throw(ArgumentError("each ring requires at least two longitude cells"))
        width = 2pi/length(ids)
        for j in eachindex(ids)
            gap = j == length(ids) ? lon[ids[1]] + 2pi - lon[ids[j]] : lon[ids[j+1]] - lon[ids[j]]
            isapprox(gap, width; atol=1e-11, rtol=1e-12) || throw(ArgumentError("longitude centers must be distinct and equally spaced within each ring"))
        end
        all(i -> isapprox(w[i], w[first(ids)]; atol=1e-15, rtol=1e-12), ids) || throw(ArgumentError("cell weights must agree within each longitude ring"))
        ringIndex[ids] .= r
        cumulative_weight += sum(w[ids])
        push!(mu, -1 + 2cumulative_weight)
    end
    mu[end] = 1.0 # exact polar closure; input normalization was checked above
    all(x -> -1 <= x <= 1, mu) || throw(ArgumentError("ring areas exceed the sphere"))
    bounds = asin.(mu)
    for r in eachindex(rings)
        bounds[r] < centers[r] < bounds[r+1] || throw(ArgumentError("latitude center is outside its weight-derived band"))
    end
    from, to = Int[], Int[]
    length_edge, distance, edgeLat, edgeLon = Float64[], Float64[], Float64[], Float64[]
    kind = Symbol[]
    function add_edge(i, j, len, dist, typ, phi, lambda)
        push!(from, i); push!(to, j)
        push!(length_edge, len); push!(distance, dist); push!(kind, typ)
        push!(edgeLat, phi); push!(edgeLon, mod(lambda, 2pi))
    end
    for (r, ids) in enumerate(rings)
        width = 2pi/length(ids)
        for j in eachindex(ids)
            i, next = ids[j], ids[mod1(j+1, length(ids))]
            add_edge(i, next, bounds[r+1]-bounds[r], cos(centers[r])*width,
                     :zonal, (bounds[r]+bounds[r+1])/2, lon[i]+width/2)
        end
    end
    for r in 1:length(rings)-1
        south, north = rings[r], rings[r+1]
        sp = longitude_pieces(south, lon, 2pi/length(south))
        np = longitude_pieces(north, lon, 2pi/length(north))
        # Joining pieces for the same cell pair eliminates a seam-created duplicate
        # face; longitude moments use the southern cell's unwrapped coordinates.
        overlaps = Dict{Tuple{Int,Int},Tuple{Float64,Float64}}()
        a, b = 1, 1
        while a <= length(sp) && b <= length(np)
            slo, shi, i = sp[a]
            nlo, nhi, j = np[b]
            lo, hi = max(slo,nlo), min(shi,nhi)
            if hi-lo > 1e-13
                width = hi-lo
                midpoint = lon[i] + mod((lo+hi)/2-lon[i]+pi, 2pi)-pi
                old_width, old_moment = get(overlaps, (i,j), (0.0,0.0))
                overlaps[(i,j)] = (old_width+width, old_moment+width*midpoint)
            end
            shi <= nhi ? (a += 1) : (b += 1)
        end
        for ((i,j), (width,moment)) in sort!(collect(overlaps); by=first)
            phi = bounds[r+1]
            add_edge(i, j, cos(phi)*width, centers[r+1]-centers[r],
                     :meridional, phi, moment/width)
        end
    end
    Mesh(4pi .* w, from, to, length_edge, distance, kind, lat, lon, edgeLat, edgeLon, ringIndex)
end

"""
    sample_native_velocity(mesh, u, v) -> Vector{Float64}

Project cell east/north velocity components onto oriented shared edges. Zonal
faces use the mean of the two zonal components. Meridional faces interpolate
the two northward components linearly to the latitude boundary. The single
sample is shared by both adjacent cells, so it supports conservative incidence.

This is a low-order interpolation. Reduced rings may have different endpoint
longitudes; it does not recover general analytic vector fields or guarantee
divergence-free sampling of arbitrary rigid rotations. Zonal solid-body flow
and northward velocity affine in latitude have the explicitly tested properties.
"""
function sample_native_velocity(mesh::Mesh, u, v)
    n = length(mesh.area)
    length(u) == length(v) == n || throw(ArgumentError("velocity must provide one u and v value per cell"))
    all(isfinite,u) && all(isfinite,v) || throw(ArgumentError("velocity values must be finite"))
    velocity = Vector{Float64}(undef, length(mesh.from))
    for e in eachindex(velocity)
        i, j = mesh.from[e], mesh.to[e]
        if mesh.edgeKind[e] == :zonal
            velocity[e] = (u[i]+u[j])/2
        else
            alpha = (mesh.edgeLat[e]-mesh.lat[i])/(mesh.lat[j]-mesh.lat[i])
            velocity[e] = (1-alpha)*v[i]+alpha*v[j]
        end
    end
    velocity
end

end # module
