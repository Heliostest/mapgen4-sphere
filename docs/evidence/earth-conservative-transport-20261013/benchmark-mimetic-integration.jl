using Test,LinearAlgebra,JSON3
include("conservative-core.jl")
include("conservative-grid.jl")
include("mimetic-gradient.jl")
using .ConservativeCore,.ConservativeGrid,.MimeticGradient
BLAS.set_num_threads(1)
function mesh_at(nr)
    if nr==48
        v=JSON3.read(read(joinpath(@__DIR__,"../../../build/earth-speedy-transport/split-reference-seasonal-geometry.json"),String))
        return build_gaussian_mesh(v.latDegrees,v.lonDegrees,v.weights)
    end
    e=eigen(SymTridiagonal(zeros(nr),[i/sqrt(4i^2-1) for i in 1:nr-1]))
    lat=Float64[];lon=Float64[];w=Float64[]
    for r in 1:nr
        nc=20+4min(r-1,nr-r)
        append!(lat,fill(rad2deg(asin(e.values[r])),nc));append!(lon,collect(0:nc-1)*360/nc)
        append!(w,fill(e.vectors[1,r]^2/nc,nc))
    end
    build_gaussian_mesh(lat,lon,w)
end
function main()
    rows=[]
    for nr in (12,24,48,96)
        mesh=mesh_at(nr);D=reconstruction_gradient(mesh);H=mesh.edgeLength.*mesh.centerDistance
        g=Geometry(mesh.area,mesh.from,mesh.to,mesh.edgeLength,mesh.centerDistance,1.)
        pairs=pair_decomposition(D,H,1.)
        c=TransportCore(g,ones(length(g.area)),[1.];c2=1.,gradient=D,transport_pairs=pairs,method=:variational)
        x=cos.(mesh.lat).*cos.(mesh.lon);y=cos.(mesh.lat).*sin.(mesh.lon)
        amplitude=.001;omega=sqrt(2.);steps=512;dt=2pi/(omega*steps)
        p=1 .+ amplitude*x;s=State(p,.012mass(c,p),reshape(amplitude*(D*y)/omega,:,1),0.)
        initialWater=sum(s.W);initialAir=sum(mass(c,p));qerror=0.;energyResidual=0.;points=[]
        for k in 1:steps
            oldp=copy(s.p);oldj=copy(s.j);olde=energy(c,s)
            step!(c,s,dt)
            loss=.5sum(g.area.*(s.p-oldp).^2)+.5sum(H.*vec((s.j-oldj).^2))
            energyResidual=max(energyResidual,abs(energy(c,s)-olde+loss))
            qerror=max(qerror,maximum(abs,s.W./mass(c,s.p).-0.012))
            if k%(steps÷4)==0
                theta=k*atan(omega*dt);decay=(1+(omega*dt)^2)^(-k/2)
                expected=decay*(x*cos(theta)-y*sin(theta))
                error=sqrt(sum(g.area.*((s.p.-1)/amplitude-expected).^2)/sum(g.area.*x.^2))
                push!(points,(fractionPeriod=k/steps,error=error))
            end
        end
        item=(rings=nr,cells=length(p),quadratures=length(mesh.from),transfers=length(pairs.from),steps=steps,maxError=maximum(v.error for v in points),energyIdentityMaxResidual=energyResidual,constantTracerMaxError=qerror,waterDrift=sum(s.W)-initialWater,airDrift=sum(mass(c,s.p))-initialAir,points=points)
        push!(rows,item);println(JSON3.write(item));flush(stdout)
        @test abs(item.waterDrift)<1e-11
        @test abs(item.airDrift)<1e-10
        @test qerror<1e-12
        @test energyResidual<1e-15
    end
    @test all(rows[i+1].maxError<rows[i].maxError for i in 1:3)
    name=get(ENV,"CORE_RUN_NAME","mimetic-integration")
    write(joinpath(@__DIR__,"../../../build/earth-conservative-transport",name*".json"),JSON3.write((scope="actual core + actual reconstructed gradient + shared tracer integration; full spherical pressure wave against analytic BE continuum factor",rows=rows)))
end
@testset "complete mimetic core pressure-wave and water integration" begin
    main()
end
