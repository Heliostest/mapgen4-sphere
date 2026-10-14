# Independent same-longitude pressure reconstruction probe. No core edits/runs.
using LinearAlgebra, SparseArrays, JSON3, SHA
include(joinpath(@__DIR__, "conservative-grid.jl"))
using .ConservativeGrid

function reconstruction(mesh)
    n, ne = length(mesh.area), length(mesh.from)
    rings = [sort(findall(==(r),mesh.ringIndex);by=i->mesh.lon[i]) for r in 1:maximum(mesh.ringIndex)]
    I, J, V = Int[], Int[], Float64[]
    function interp!(e,ring,lon,factor)
        ids = rings[ring]
        width = 2pi/length(ids)
        fractional = mod(lon-mesh.lon[first(ids)],2pi)/width
        a = floor(Int,fractional)
        alpha = fractional-a
        push!(I,e); push!(J,ids[mod1(a+1,length(ids))]); push!(V,factor*(1-alpha))
        push!(I,e); push!(J,ids[mod1(a+2,length(ids))]); push!(V,factor*alpha)
    end
    for e in 1:ne
        i,j=mesh.from[e],mesh.to[e]
        fac=1/mesh.centerDistance[e]
        if mesh.edgeKind[e] == :zonal
            push!(I,e,e); push!(J,i,j); push!(V,fac,-fac)
        else
            interp!(e,mesh.ringIndex[i],mesh.edgeLon[e],fac)
            interp!(e,mesh.ringIndex[j],mesh.edgeLon[e],-fac)
        end
    end
    D=sparse(I,J,V,ne,n)
    B=sparse(vcat(mesh.from,mesh.to),vcat(collect(1:ne),collect(1:ne)),vcat(ones(ne),-ones(ne)),n,ne)
    K=B*Diagonal(mesh.edgeLength)*D
    D,B,K
end

function gauss_octahedral(nlat)
    beta=[k/sqrt(4k*k-1) for k in 1:nlat-1]
    dec=eigen(SymTridiagonal(zeros(nlat),beta))
    mu=dec.values
    gw=2 .* dec.vectors[1,:].^2
    lat,lon,w=Float64[],Float64[],Float64[]
    for r in 1:nlat
        nlon=4min(r,nlat+1-r)+16
        append!(lat,fill(rad2deg(asin(mu[r])),nlon))
        append!(lon,[360*j/nlon for j in 0:nlon-1])
        append!(w,fill(gw[r]/(2nlon),nlon))
    end
    build_gaussian_mesh(lat,lon,w)
end

function harmonics(mesh,K)
    x=cos.(mesh.lat).*cos.(mesh.lon); y=cos.(mesh.lat).*sin.(mesh.lon); z=sin.(mesh.lat)
    out=[]
    for (name,f,lambda) in (("x",x,2.),("y",y,2.),("z",z,2.),("xy",x.*y,6.),("xz",x.*z,6.),("3z2-1",3 .* z.^2 .- 1,6.))
        poslap=(K*f)./mesh.area
        err=poslap-lambda*f
        push!(out,(name=name,relativeL2=sqrt(sum(mesh.area.*err.^2)/sum(mesh.area.*(lambda*f).^2)),maxError=maximum(abs,err),rayleigh=sum(mesh.area.*f.*poslap)/sum(mesh.area.*f.^2),exactEigenvalue=lambda))
    end
    out
end

function spectral_probe(mesh,K)
    # Area similarity scaling improves the conditioning of this dense eigensolve.
    scale=Diagonal(1 ./ sqrt.(mesh.area))
    Q=Matrix(scale*K*scale)
    eig=eigvals(Q)
    nonzero=filter(x->abs(x)>1e-8,eig)
    complexModes=filter(x->abs(imag(x))>1e-9*max(1,abs(x)),nonzero)
    negativeModes=filter(x->real(x)<-1e-9*max(1,abs(x)),nonzero)
    waveRates=vcat(sqrt.(complex.(-nonzero)),-sqrt.(complex.(-nonzero)))
    amplifications=[(dt=dt,maxAmplification=maximum(1 ./ abs.(1 .- dt .* waveRates))) for dt in (0.001,0.01,0.1,1.0)]
    (method="dense eigenvalues of area-similar actual discrete pressure operator; constant pref and c=R=1",n=length(mesh.area),minimumRealEigenvalue=minimum(real,eig),maximumRealEigenvalue=maximum(real,eig),largestImaginaryEigenvalue=maximum(abs,imag.(eig)),complexModeCount=length(complexModes),negativeRealModeCount=length(negativeModes),maxAcousticGrowthRate=maximum(real,waveRates),largestImaginaryExamples=[(real=real(x),imag=imag(x)) for x in sort(complexModes;by=x->abs(imag(x)),rev=true)[1:min(6,length(complexModes))]],backwardEulerAmplification=amplifications,symmetricPartMinimum=eigmin(Symmetric((Q+Q')/2)))
end

root=normpath(joinpath(@__DIR__,"../../.."))
input=joinpath(root,"build/earth-speedy-transport/split-reference-seasonal-geometry.json")
data=JSON3.read(read(input,String))
native=build_gaussian_mesh(data.latDegrees,data.lonDegrees,data.weights)
cases=[]
for nlat in (12,24,48,96)
    mesh=nlat==48 ? native : gauss_octahedral(nlat)
    D,B,K=reconstruction(mesh)
    values=nonzeros(K)
    rows,cols,vals=findnz(K)
    positiveOff=sum(vals[(rows.!=cols).&(vals.>0)])
    metrics=harmonics(mesh,K)
    spec=nlat<=48 ? spectral_probe(mesh,K) : nothing
    item=(nrings=nlat,ncell=length(mesh.area),harmonics=metrics,constantResidual=maximum(abs,K*ones(length(mesh.area))),globalColumnSumResidual=maximum(abs,vec(sum(K;dims=1))),relativeAsymmetry=norm(K-K')/norm(K),positiveOffDiagonalSum=positiveOff,spectrum=spec)
    push!(cases,item)
    println("RECONSTRUCTION_CASE ",JSON3.write(item)); flush(stdout)
end
result=(scope="same-longitude periodic linear interpolation to each meridional edge; independent geometry-only experiment",sourceSha256=bytes2hex(sha256(read(@__FILE__))),geometrySourceSha256=bytes2hex(sha256(read(joinpath(@__DIR__,"conservative-grid.jl")))),inputSha256=bytes2hex(sha256(read(input))),cases=cases)
out=joinpath(root,"build/earth-conservative-transport/scheme-reconstruction-probe.json")
isfile(out) && error("preserve prior evidence: result path already exists")
mkpath(dirname(out)); write(out,JSON3.write(result))
println("WROTE ",out)
