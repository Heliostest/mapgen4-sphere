# Independent symmetric reconstruction candidate; old probe/result stay frozen.
probe=joinpath(@__DIR__,"scheme-reconstruction-probe.jl")
definitions=first(split(read(probe,String),"\nroot=normpath"))
include_string(Main,definitions,probe)

root=normpath(joinpath(@__DIR__,"../../.."))
data=JSON3.read(read(joinpath(root,"build/earth-speedy-transport/split-reference-seasonal-geometry.json"),String))
native=build_gaussian_mesh(data.latDegrees,data.lonDegrees,data.weights)
cases=[]
for nlat in (12,24,48,96,192)
    mesh=nlat==48 ? native : gauss_octahedral(nlat)
    D,B,K=reconstruction(mesh)
    S=(K+K')/2
    rows,cols,vals=findnz(S)
    npositive=count((rows.!=cols).&(vals.>1e-14))
    nedges=count((rows.<cols).&(vals.<-1e-14))
    metrics=harmonics(mesh,S)
    x=cos.(mesh.lat).*cos.(mesh.lon)
    e=(S*x)./mesh.area-2x
    nonpolar=abs.(mesh.lat).<deg2rad(80)
    extreme=abs.(mesh.lat).>deg2rad(85)
    # Well-balanced variable reference can use a positive mean on EACH expanded
    # symmetric graph edge; this retains graph positivity independently of pref.
    item=(nrings=nlat,ncell=length(mesh.area),nedges=nedges,positiveOffDiagonalCount=npositive,harmonics=metrics,constantResidual=maximum(abs,S*ones(length(mesh.area))),xErrorAwayFromPoles=sqrt(sum(mesh.area[nonpolar].*e[nonpolar].^2)/sum(mesh.area[nonpolar].*(2x[nonpolar]).^2)),xAbsoluteL2ExtremePolar=sqrt(sum(mesh.area[extreme].*e[extreme].^2)),xMaxExtremePolar=any(extreme) ? maximum(abs,e[extreme]) : nothing)
    push!(cases,item)
    println("SYMMETRIC_CASE ",JSON3.write(item));flush(stdout)
end
result=(scope="symmetric part of reconstructed pressure stiffness; expanded algebraic edges, not geographic faces",sourceSha256=bytes2hex(sha256(read(@__FILE__))),reconstructionSourceSha256=bytes2hex(sha256(read(probe))),geometrySourceSha256=bytes2hex(sha256(read(joinpath(@__DIR__,"conservative-grid.jl")))),cases=cases)
out=joinpath(root,"build/earth-conservative-transport/scheme-symmetric-probe.json")
isfile(out) && error("preserve earlier result")
write(out,JSON3.write(result))
