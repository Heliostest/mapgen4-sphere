# Additional wave verification; preserves every earlier candidate/result.
source=joinpath(@__DIR__,"scheme-variational-probe.jl")
include_string(Main,first(split(read(source,String),"\nroot=normpath")),source)

function general_wave(mesh,D,K,mode,steps)
    A=mesh.area; H=mesh.edgeLength.*mesh.centerDistance
    x=cos.(mesh.lat).*cos.(mesh.lon); y=cos.(mesh.lat).*sin.(mesh.lon); z=sin.(mesh.lat)
    f,g,lambda=mode=="l1_xy" ? (x,y,2.) : mode=="l1_zx" ? (z,x,2.) : (x.*y,x.*z,6.)
    omega=sqrt(lambda); dt=2pi/(omega*steps)
    p=copy(f); j=(D*g)/omega
    factor=cholesky(Symmetric(Diagonal(A)+dt^2*K))
    normA(v)=sqrt(sum(A.*v.^2)); normalization=normA(f)
    points=[]
    for n in 1:steps
        pn=factor\(A.*p-dt*(D'*(H.*j)))
        j+=dt*(D*pn);p=pn
        if n%(steps÷4)==0
            theta=n*atan(omega*dt); amp=(1+(omega*dt)^2)^(-n/2)
            expected=amp*(f*cos(theta)-g*sin(theta))
            push!(points,(fractionPeriod=n/steps,relativePressureError=normA(p-expected)/normalization))
        end
    end
    (mode=mode,stepsPerPeriod=steps,maxRelativePressureError=maximum(z.relativePressureError for z in points),points=points)
end

root=normpath(joinpath(@__DIR__,"../../.."))
data=JSON3.read(read(joinpath(root,"build/earth-speedy-transport/split-reference-seasonal-geometry.json"),String))
native=build_gaussian_mesh(data.latDegrees,data.lonDegrees,data.weights)
results=[]
for nlat in (12,24,48,96,192)
    mesh=nlat==48 ? native : gauss_octahedral(nlat)
    D,B,oldK=reconstruction(mesh); H=mesh.edgeLength.*mesh.centerDistance; K=D'*Diagonal(H)*D
    runs=[]
    for mode in ("l1_xy","l1_zx","l2_xy_xz")
        # 1024 steps provide a common refined time discretization on every grid.
        push!(runs,general_wave(mesh,D,K,mode,1024))
    end
    if nlat in (48,96)
        for steps in (256,4096)
            push!(runs,general_wave(mesh,D,K,"l1_xy",steps))
        end
    end
    # Resolvent error tests a weak elliptic solution, independently of wave time integration.
    x=cos.(mesh.lat).*cos.(mesh.lon)
    solution=cholesky(Symmetric(Diagonal(mesh.area)+K))\(mesh.area.*x)
    resolvent=sqrt(sum(mesh.area.*(solution-x/3).^2)/sum(mesh.area.*(x/3).^2))
    item=(nrings=nlat,ncell=length(mesh.area),wave=runs,relativeHelmholtzSolutionError=resolvent)
    push!(results,item);println("VARIATIONAL_REFINEMENT ",JSON3.write(item));flush(stdout)
end
result=(scope="independent full-wave and weak elliptic convergence; smooth pressure perturbations, no source-free atmosphere run",sourceSha256=bytes2hex(sha256(read(@__FILE__))),variationalProbeSha256=bytes2hex(sha256(read(source))),results=results)
out=joinpath(root,"build/earth-conservative-transport/scheme-variational-refinement.json")
isfile(out) && error("preserve prior evidence")
write(out,JSON3.write(result))
