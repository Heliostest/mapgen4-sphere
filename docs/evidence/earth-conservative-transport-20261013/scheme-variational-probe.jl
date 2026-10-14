# Reviewer-owned variational pressure + full quadrature-momentum wave probe.
probe=joinpath(@__DIR__,"scheme-reconstruction-probe.jl")
include_string(Main,first(split(read(probe,String),"\nroot=normpath")),probe)

function wave_probe(mesh,D,K;steps=512)
    A=mesh.area; H=mesh.edgeLength.*mesh.centerDistance
    x=cos.(mesh.lat).*cos.(mesh.lon); y=cos.(mesh.lat).*sin.(mesh.lon)
    omega=sqrt(2.); period=2pi/omega; dt=period/steps
    p=copy(x); j=(D*y)/omega
    factor=cholesky(Symmetric(Diagonal(A)+dt^2*K))
    energy(p,j)=(sum(A.*p.^2)+sum(H.*j.^2))/2
    E0=energy(p,j); maxEnergyResidual=0.; points=[]
    weighted_norm(v)=sqrt(sum(A.*v.^2))
    normalization=weighted_norm(x)
    for n in 1:steps
        pn=factor\(A.*p-dt*(D'*(H.*j)))
        jn=j+dt*(D*pn)
        residual=energy(pn,jn)-energy(p,j)+(sum(A.*(pn-p).^2)+sum(H.*(jn-j).^2))/2
        maxEnergyResidual=max(maxEnergyResidual,abs(residual)/E0)
        p,j=pn,jn
        if n%(steps÷4)==0
            theta=n*atan(omega*dt)
            amplitude=(1+(omega*dt)^2)^(-n/2)
            expected=amplitude*(x*cos(theta)-y*sin(theta))
            a=sum(A.*p.*x)/sum(A.*x.^2)
            b=sum(A.*p.*y)/sum(A.*y.^2)
            actual_phase=atan(-b,a)
            phase_error=atan(sin(actual_phase-theta),cos(actual_phase-theta))
            push!(points,(fractionPeriod=n/steps,relativePressureError=weighted_norm(p-expected)/normalization,lowModeAmplitude=hypot(a,b),referenceAmplitude=amplitude,lowModeRelativeAmplitudeError=abs(hypot(a,b)-amplitude)/amplitude,lowModePhaseErrorRadians=phase_error,highModeRemainder=weighted_norm(p-a*x-b*y)/normalization))
        end
    end
    (stepsPerPeriod=steps,reference="exact backward-Euler amplification and phase for continuum l=1 rotating compressional mode; initial p=x,j=D*y/sqrt(2)",maxEnergyIdentityResidual=maxEnergyResidual,points=points,maxRelativePressureError=maximum(z.relativePressureError for z in points),maxPhaseErrorRadians=maximum(abs(z.lowModePhaseErrorRadians) for z in points))
end

root=normpath(joinpath(@__DIR__,"../../.."))
data=JSON3.read(read(joinpath(root,"build/earth-speedy-transport/split-reference-seasonal-geometry.json"),String))
native=build_gaussian_mesh(data.latDegrees,data.lonDegrees,data.weights)
cases=[]
for nlat in (12,24,48,96,192)
    mesh=nlat==48 ? native : gauss_octahedral(nlat)
    D,B,oldK=reconstruction(mesh)
    H=mesh.edgeLength.*mesh.centerDistance
    K=D'*Diagonal(H)*D
    rows,cols,values=findnz(K)
    positive_off=count((rows.!=cols).&(values.>1e-14))
    metrics=harmonics(mesh,K)
    x=cos.(mesh.lat).*cos.(mesh.lon)
    err=(K*x)./mesh.area-2x
    nonpolar=abs.(mesh.lat).<deg2rad(80)
    polar=abs.(mesh.lat).>deg2rad(85)
    wave=nlat<=96 ? wave_probe(mesh,D,K) : nothing
    # Every gradient row has two sign groups. Their complete-bipartite split
    # exactly reproduces the signed quadrature divergence, without a correction.
    flux=sin.(collect(1:length(mesh.from)))
    reference_div=D'*(H.*flux)
    pair_div=zeros(length(mesh.area))
    Dt=sparse(D')
    splitEdges=0
    for e in eachindex(mesh.from)
        ids=rowvals(Dt)[nzrange(Dt,e)]
        vals=nonzeros(Dt)[nzrange(Dt,e)]
        positive=findall(>(0),vals); negative=findall(<(0),vals)
        total=sum(vals[positive])
        for ia in positive, ib in negative
            f=H[e]*flux[e]*vals[ia]*(-vals[ib])/total
            pair_div[ids[ia]]+=f; pair_div[ids[ib]]-=f
            splitEdges+=1
        end
    end
    item=(nrings=nlat,ncell=length(mesh.area),quadratureCount=size(D,1),expandedDirectedPairCount=splitEdges,positiveOffDiagonalCount=positive_off,harmonics=metrics,constantResidual=maximum(abs,K*ones(length(mesh.area))),relativeAsymmetry=norm(K-K')/norm(K),xErrorAwayFromPoles=sqrt(sum(mesh.area[nonpolar].*err[nonpolar].^2)/sum(mesh.area[nonpolar].*(2x[nonpolar]).^2)),xAbsoluteL2ExtremePolar=sqrt(sum(mesh.area[polar].*err[polar].^2)),xMaxExtremePolar=any(polar) ? maximum(abs,err[polar]) : nothing,sharedPairDecompositionResidual=maximum(abs,pair_div-reference_div),wave=wave)
    push!(cases,item)
    println("VARIATIONAL_CASE ",JSON3.write(item));flush(stdout)
end
result=(scope="symmetric variational D-transpose-H-D pressure operator; full pressure+quadrature momentum BE waves; no native model run",sourceSha256=bytes2hex(sha256(read(@__FILE__))),reconstructionSourceSha256=bytes2hex(sha256(read(probe))),geometrySourceSha256=bytes2hex(sha256(read(joinpath(@__DIR__,"conservative-grid.jl")))),cases=cases)
out=joinpath(root,"build/earth-conservative-transport/scheme-variational-probe.json")
isfile(out) && error("preserve prior evidence")
write(out,JSON3.write(result))
