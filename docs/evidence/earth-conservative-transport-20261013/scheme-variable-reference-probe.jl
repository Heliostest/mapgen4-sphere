using LinearAlgebra,SparseArrays,JSON3,SHA
probe=joinpath(@__DIR__,"scheme-reconstruction-probe.jl")
include_string(Main,first(split(read(probe,String),"\nroot=normpath")),probe)
root=normpath(joinpath(@__DIR__,"../../.."))
input=joinpath(root,"build/earth-speedy-transport/split-reference-seasonal-geometry.json")
data=JSON3.read(read(input,String)); mesh=build_gaussian_mesh(data.latDegrees,data.lonDegrees,data.weights)
D,B,Kold=reconstruction(mesh)
pref=1e5 .* exp.(-9.81 .* Float64.(data.orographyM) ./ (287.04*288))
results=[]
for mean in ("arithmetic","geometric")
    pf=mean=="arithmetic" ? (pref[mesh.from]+pref[mesh.to])/2 : sqrt.(pref[mesh.from].*pref[mesh.to])
    K=D'*Diagonal(pf.*mesh.edgeLength.*mesh.centerDistance)*D
    rows,cols,vals=findnz(K)
    off=vals[rows.!=cols]
    positive=findall((rows.!=cols).&(vals.>0))
    negative=findall((rows.<cols).&(vals.<0))
    # An exact positive graph decomposition exists iff every offdiagonal <=0.
    gi=rows[negative]; gj=cols[negative]; gw=-vals[negative]
    incidence=sparse(vcat(gi,gj),vcat(collect(eachindex(gi)),collect(eachindex(gi))),vcat(ones(length(gi)),-ones(length(gi))),length(pref),length(gi))
    graphK=incidence*Diagonal(gw)*incidence'
    reconstruction_error=norm(K-graphK,Inf)/norm(K,Inf)
    item=(mean=mean,prefMin=minimum(pref),prefMax=maximum(pref),minimumOffDiagonal=minimum(off),maximumOffDiagonal=maximum(off),positiveOffDiagonalCount=length(positive),positiveOffDiagonalSum=sum(vals[positive]),upperNegativeEdgeCount=length(negative),constantResidual=maximum(abs,K*ones(length(pref))),relativeGraphReconstructionError=reconstruction_error,positiveExamples=[(i=rows[t],j=cols[t],coefficient=vals[t],latitudeI=rad2deg(mesh.lat[rows[t]]),longitudeI=rad2deg(mesh.lon[rows[t]])) for t in positive[1:min(10,length(positive))]])
    push!(results,item);println("REFERENCE_PROBE ",JSON3.write(item))
end
out=joinpath(root,"build/earth-conservative-transport/scheme-variable-reference-probe.json")
isfile(out) && error("preserve prior evidence")
write(out,JSON3.write((scope="actual native orography reference; no clipping of signed stiffness entries",sourceSha256=bytes2hex(sha256(read(@__FILE__))),geometrySha256=bytes2hex(sha256(read(input))),results=results)))
