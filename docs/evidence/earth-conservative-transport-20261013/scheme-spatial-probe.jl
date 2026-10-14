# Reviewer-owned geometry-only probe. No native model execution or mutation.
using JSON3, SHA
include(joinpath(@__DIR__, "conservative-grid.jl"))
using .ConservativeGrid

function laplacian(mesh, f)
    rhs = zeros(length(f))
    for e in eachindex(mesh.from)
        i, j = mesh.from[e], mesh.to[e]
        flux = mesh.edgeLength[e]/mesh.centerDistance[e]*(f[i]-f[j])
        rhs[i] -= flux; rhs[j] += flux
    end
    rhs ./ mesh.area
end

function harmonic_metrics(mesh)
    x = cos.(mesh.lat).*cos.(mesh.lon)
    y = cos.(mesh.lat).*sin.(mesh.lon)
    z = sin.(mesh.lat)
    results = []
    for (name, f, lambda) in (("x",x,2.),("y",y,2.),("z",z,2.),("xy",x.*y,6.),("xz",x.*z,6.),("3z2-1",3 .* z.^2 .- 1,6.))
        lf = laplacian(mesh,f)
        error = lf + lambda*f
        push!(results,(name=name,relativeL2=sqrt(sum(mesh.area.*error.^2)/sum(mesh.area.*(lambda*f).^2)),maxError=maximum(abs,error),rayleigh=-sum(mesh.area.*f.*lf)/sum(mesh.area.*f.^2),exactEigenvalue=lambda))
    end
    results
end

root=normpath(joinpath(@__DIR__,"../../.."))
input=joinpath(root,"build/earth-speedy-transport/split-reference-seasonal-geometry.json")
data=JSON3.read(read(input,String))
mesh=build_gaussian_mesh(data.latDegrees,data.lonDegrees,data.weights)
metrics=harmonic_metrics(mesh)
result=(scope="read-only geometry probe; measures physical spherical harmonic error rather than discrete eigenmode algebra",geometrySourceSha256=bytes2hex(sha256(read(joinpath(@__DIR__,"conservative-grid.jl")))),inputSha256=bytes2hex(sha256(read(input))),cellCount=length(mesh.area),metrics=metrics,flatStaggeredCounterexample=(description="row spacing h, column spacing h, alternating half-cell longitude offset: meridional two-point operator adds one quarter of the zonal second derivative",exactLaplacianX2=2.,twoPointLaplacianX2=2.5))
out=joinpath(root,"build/earth-conservative-transport/scheme-spatial-probe.json")
mkpath(dirname(out))
write(out,JSON3.write(result))
println(JSON3.write(result))
