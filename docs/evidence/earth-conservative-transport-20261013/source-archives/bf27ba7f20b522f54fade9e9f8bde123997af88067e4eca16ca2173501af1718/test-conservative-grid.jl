using Test
using JSON3

# Independent fixtures catch missing/double-counted seams, wrong polar closure,
# and accidental replacement of the native Gaussian quadrature areas.
const GRID_ADAPTER = joinpath(@__DIR__, "conservative-grid.jl")
@testset "Conservative Gaussian grid adapter exists" begin
    @test isfile(GRID_ADAPTER)
end
include(GRID_ADAPTER)
using .ConservativeGrid

function edge_net(mesh, flux)
    net = zeros(length(mesh.area))
    for e in eachindex(mesh.from)
        net[mesh.from[e]] += flux[e]
        net[mesh.to[e]] -= flux[e]
    end
    net
end

function connected(mesh)
    seen = falses(length(mesh.area))
    seen[1] = true
    queue = [1]
    while !isempty(queue)
        i = pop!(queue)
        for e in eachindex(mesh.from)
            j = mesh.from[e] == i ? mesh.to[e] : mesh.to[e] == i ? mesh.from[e] : 0
            if j != 0 && !seen[j]
                seen[j] = true
                push!(queue, j)
            end
        end
    end
    all(seen)
end

@testset "Hand-computed four cells: two hemispheres, two longitude cells" begin
    mesh = build_gaussian_mesh([-30., -30., 30., 30.], [0., 180., 0., 180.], fill(0.25, 4))
    @test mesh.area ≈ fill(pi, 4)
    @test sum(mesh.area) ≈ 4pi
    @test length(mesh.from) == 6
    @test connected(mesh)
    ze = findall(==(:zonal), mesh.edgeKind)
    me = findall(==(:meridional), mesh.edgeKind)
    @test length(ze) == 4
    @test length(me) == 2
    @test mesh.edgeLength[ze] ≈ fill(pi/2, 4)
    @test mesh.centerDistance[ze] ≈ fill(sqrt(3)*pi/2, 4)
    @test mesh.edgeLength[me] ≈ fill(pi, 2)
    @test mesh.centerDistance[me] ≈ fill(pi/3, 2)
    @test Set(zip(mesh.from[ze], mesh.to[ze])) == Set([(1,2), (2,1), (3,4), (4,3)])
    @test Set(zip(mesh.from[me], mesh.to[me])) == Set([(1,3), (2,4)])
    @test all(mesh.lat[mesh.from[me]] .< mesh.lat[mesh.to[me]])
    @test maximum(abs, edge_net(mesh, sample_native_velocity(mesh, ones(4), zeros(4)) .* mesh.edgeLength)) < 1e-14
    @test maximum(abs, edge_net(mesh, sample_native_velocity(mesh, cos.(mesh.lat), zeros(4)) .* mesh.edgeLength)) < 1e-14
    @test sample_native_velocity(mesh, [2., 4., 6., 8.], [10., 20., 30., 40.])[ze] ≈ [3., 3., 7., 7.]
    north_velocity = sample_native_velocity(mesh, zeros(4), [10., 20., 30., 40.])
    @test Dict((mesh.from[e], mesh.to[e]) => north_velocity[e] for e in me) == Dict((1,3)=>20., (2,4)=>30.)
end

@testset "Hand-computed eight cells: staggered seam produces eight shared arcs" begin
    mesh = build_gaussian_mesh(vcat(fill(-30.,4), fill(30.,4)), [0.,90.,180.,270.,45.,135.,225.,315.], fill(0.125,8))
    ze = findall(==(:zonal), mesh.edgeKind)
    me = findall(==(:meridional), mesh.edgeKind)
    @test length(mesh.from) == 16
    @test mesh.area ≈ fill(pi/2,8)
    @test mesh.edgeLength[ze] ≈ fill(pi/2,8)
    @test mesh.centerDistance[ze] ≈ fill(sqrt(3)*pi/4,8)
    @test mesh.edgeLength[me] ≈ fill(pi/4,8)
    @test Set(zip(mesh.from[me], mesh.to[me])) == Set([(1,5),(1,8),(2,5),(2,6),(3,6),(3,7),(4,7),(4,8)])
    @test sum(mesh.edgeLength[me]) ≈ 2pi
    @test connected(mesh)
end

@testset "Reduced nonmatching rings preserve unequal Gaussian areas" begin
    # Southern ring occupies mu in [-1,-0.5], northern ring [-0.5,1].
    # Their boundary is exactly -30 degrees, distinct from center midpoint -15.
    lats = [-60.,-60.,30.,30.,30.,30.]
    lons = [350.,170.,350.,80.,170.,260.]
    weights = [0.125,0.125,0.1875,0.1875,0.1875,0.1875]
    mesh = build_gaussian_mesh(lats,lons,weights)
    @test mesh.area == 4pi .* weights
    @test mesh.lat ≈ deg2rad.(lats)
    @test mesh.lon ≈ deg2rad.(lons)
    me = findall(==(:meridional),mesh.edgeKind)
    ze = findall(==(:zonal),mesh.edgeKind)
    @test length(me) == 6
    @test sort(mesh.edgeLength[me]) ≈ sort(sqrt(3)/2 .* [pi/4,pi/4,pi/4,pi/4,pi/2,pi/2])
    @test sum(mesh.edgeLength[me]) ≈ sqrt(3)*pi
    @test all(isapprox.(mesh.edgeLat[me],-pi/6;atol=1e-14))
    @test sort(mesh.edgeLength[ze]) ≈ [pi/3,pi/3,2pi/3,2pi/3,2pi/3,2pi/3]
    # A north velocity affine in latitude is reconstructed exactly at boundary.
    vn = sample_native_velocity(mesh,zeros(6),3 .* mesh.lat .+ 2)
    @test vn[me] ≈ fill(2-pi/2,6)
    @test connected(mesh)
    for cell in eachindex(mesh.area)
        incident = [e for e in me if mesh.from[e] == cell || mesh.to[e] == cell]
        @test sum(mesh.edgeLength[incident]) ≈ (cell <= 2 ? sqrt(3)*pi/2 : sqrt(3)*pi/4)
    end
    # Input ordering is not part of the geometric contract.
    p = [5,2,6,1,3,4]
    shuffled = build_gaussian_mesh(lats[p],lons[p],weights[p])
    @test shuffled.area == mesh.area[p]
    @test connected(shuffled)
    @test sort(shuffled.edgeLength) ≈ sort(mesh.edgeLength)
end

@testset "Malformed or unsupported geometry fails explicitly" begin
    lat = [-30.,-30.,30.,30.]
    lon = [0.,180.,0.,180.]
    w = fill(0.25,4)
    @test_throws ArgumentError build_gaussian_mesh(lat[1:3],lon,w)
    @test_throws ArgumentError build_gaussian_mesh(Float64[],Float64[],Float64[])
    @test_throws ArgumentError build_gaussian_mesh([NaN,-30.,30.,30.],lon,w)
    @test_throws ArgumentError build_gaussian_mesh(lat,[Inf,180.,0.,180.],w)
    @test_throws ArgumentError build_gaussian_mesh([-90.,-90.,30.,30.],lon,w)
    @test_throws ArgumentError build_gaussian_mesh(lat,lon,[-0.25,0.25,0.5,0.5])
    @test_throws ArgumentError build_gaussian_mesh(lat,lon,fill(0.2,4))
    @test_throws ArgumentError build_gaussian_mesh(lat,lon,[0.2,0.3,0.25,0.25])
    @test_throws ArgumentError build_gaussian_mesh(lat,[0.,170.,0.,180.],w)
    @test_throws ArgumentError build_gaussian_mesh(lat,[0.,360.,0.,180.],w)
    @test_throws ArgumentError build_gaussian_mesh([-80.,-80.,-60.,-60.],lon,w)
    @test_throws ArgumentError build_gaussian_mesh([-30.,30.],[0.,0.],[0.5,0.5])
    mesh = build_gaussian_mesh(lat,lon,w)
    @test_throws ArgumentError sample_native_velocity(mesh,ones(3),zeros(4))
    @test_throws ArgumentError sample_native_velocity(mesh,ones(4),[0.,NaN,0.,0.])
end

@testset "Native Gaussian geometry: exact quadrature, closure, global incidence" begin
    input = normpath(joinpath(@__DIR__,"../../../build/earth-speedy-transport/split-reference-seasonal-geometry.json"))
    data = JSON3.read(read(input,String))
    mesh = build_gaussian_mesh(data.latDegrees,data.lonDegrees,data.weights)
    @test length(mesh.area) == 3168
    @test mesh.area == 4pi .* Float64.(data.weights)
    @test sum(mesh.area) ≈ 4pi atol=1e-12
    @test all(mesh.edgeLength .> 0)
    @test all(mesh.centerDistance .> 0)
    @test all(mesh.from .!= mesh.to)
    @test connected(mesh)
    @test length(mesh.from) == length(mesh.to) == length(mesh.edgeLength) == length(mesh.centerDistance) == length(mesh.edgeKind)
    # Every shared flux contributes exactly one plus and one minus globally.
    flux = [sin(0.31*e) for e in eachindex(mesh.from)]
    @test abs(sum(edge_net(mesh,flux))) < 1e-11
    solid = sample_native_velocity(mesh,cos.(mesh.lat),zeros(length(mesh.area)))
    divsolid = edge_net(mesh,solid .* mesh.edgeLength) ./ mesh.area
    @test maximum(abs,divsolid) < 1e-10
    # Shared arcs cover every interface once; each cell's side gets its own arc.
    for ring in 1:maximum(mesh.ringIndex)-1
        es = [e for e in eachindex(mesh.from) if mesh.edgeKind[e] == :meridional && mesh.ringIndex[mesh.from[e]] == ring]
        phi = mesh.edgeLat[first(es)]
        @test sum(mesh.edgeLength[es]) ≈ 2pi*cos(phi) atol=1e-12
        for cell in findall(==(ring),mesh.ringIndex)
            ce = [e for e in es if mesh.from[e] == cell]
            @test sum(mesh.edgeLength[ce]) ≈ 2pi*cos(phi)/count(==(ring),mesh.ringIndex) atol=1e-12
        end
        for cell in findall(==(ring+1),mesh.ringIndex)
            ce = [e for e in es if mesh.to[e] == cell]
            @test sum(mesh.edgeLength[ce]) ≈ 2pi*cos(phi)/count(==(ring+1),mesh.ringIndex) atol=1e-12
        end
    end
    println("GRID_METRICS ",JSON3.write((ncell=length(mesh.area),nedge=length(mesh.from),nrings=maximum(mesh.ringIndex),area_sum=sum(mesh.area),area_error=sum(mesh.area)-4pi,min_area=minimum(mesh.area),max_area=maximum(mesh.area),solid_body_divergence_max=maximum(abs,divsolid),global_incidence_residual=sum(edge_net(mesh,flux)))))
end
