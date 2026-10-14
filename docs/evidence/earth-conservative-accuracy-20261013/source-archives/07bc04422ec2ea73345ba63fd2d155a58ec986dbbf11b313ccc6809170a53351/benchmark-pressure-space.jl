using Test,LinearAlgebra,JSON3
include("../earth-conservative-transport-20261013/conservative-core.jl")
include("../earth-conservative-transport-20261013/conservative-grid.jl")
include("../earth-conservative-transport-20261013/mimetic-gradient.jl")
include("modal-core.jl")
include("fct-transport.jl")
include("fct-core.jl")
using .ConservativeCore,.ConservativeGrid,.MimeticGradient,.ModalAcoustics,.FluxCorrectedTransport,.CoupledFCT
BLAS.set_num_threads(1)
function mesh_at(nr)
    if nr==48
        d=JSON3.read(read(joinpath(@__DIR__,"../../../build/earth-speedy-transport/split-reference-seasonal-geometry.json"),String))
        return build_gaussian_mesh(d.latDegrees,d.lonDegrees,d.weights)
    end
    e=eigen(SymTridiagonal(zeros(nr),[i/sqrt(4i^2-1) for i in 1:nr-1]));lat=Float64[];lon=Float64[];weights=Float64[]
    for r in 1:nr
        n=20+4min(r-1,nr-r);append!(lat,fill(rad2deg(asin(e.values[r])),n));append!(lon,collect(0:n-1)*360/n);append!(weights,fill(e.vectors[1,r]^2/n,n))
    end
    build_gaussian_mesh(lat,lon,weights)
end
function main()
    rows=[]
    for nr in (12,24,48)
        mesh=mesh_at(nr);n=length(mesh.area);D=reconstruction_gradient(mesh);H=mesh.edgeLength.*mesh.centerDistance
        c=TransportCore(Geometry(mesh.area,mesh.from,mesh.to,mesh.edgeLength,mesh.centerDistance,1.),ones(n),[1.];c2=1.,gradient=D,transport_pairs=pair_decomposition(D,H,1.),method=:variational)
        m=FCTCore(ModalCore(c));x=cos.(mesh.lat).*cos.(mesh.lon);y=cos.(mesh.lat).*sin.(mesh.lon);z=sin.(mesh.lat)
        for (name,field,lambda) in (("tilted-l1",(x+y+z)/sqrt(3.),2.),("l2",2x.*y,6.))
            p=1 .+.001field;s=State(p,.012mass(c,p),zeros(length(mesh.from),1),0.);e0=energy(c,s);steps=128;dt=2pi/sqrt(lambda)/steps
            maxError=0.;maxBudget=0.;qError=0.
            for k in 1:steps
                led=step!(m,s,dt);maxBudget=max(maxBudget,led.localAirRelativeResidual,led.localWaterRelativeResidual)
                qError=max(qError,maximum(abs,s.W./mass(c,s.p).-0.012))
                if k%(steps÷8)==0
                    expected=field*cos(k*sqrt(lambda)*dt)
                    maxError=max(maxError,sqrt(sum(mesh.area.*((s.p.-1)/.001-expected).^2)/sum(mesh.area.*field.^2)))
                end
            end
            strong=(c.stiffness*field)./mesh.area-lambda*field;polar=abs.(mesh.lat).>deg2rad(75.)
            row=(rings=nr,cells=n,field=name,maxWaveRelativeError=maxError,strongOperatorRelativeError=sqrt(sum(mesh.area.*strong.^2)/sum(mesh.area.*(lambda*field).^2)),polarMaxAbsoluteError=maximum(abs,strong[polar]),maxLocalRelative=maxBudget,constantQError=qError,relativeEnergyError=(energy(c,s)-e0)/e0)
            push!(rows,row);println(JSON3.write(row));flush(stdout)
            @test maxBudget<5e-12
            @test qError<1e-12
            @test abs(row.relativeEnergyError)<1e-9
        end
    end
    for name in ("tilted-l1","l2")
        r=filter(x->x.field==name,rows);@test all(r[i+1].maxWaveRelativeError<r[i].maxWaveRelativeError for i in 1:2)
    end
    write(joinpath(@__DIR__,"../../../build/earth-conservative-accuracy",ENV["ACCURACY_RUN_NAME"]*".json"),JSON3.write((scope="Exact time stepping against continuum spherical harmonics isolates spatial error. Strong/polar operator is unchanged and remains unaccepted.",rows=rows,strongPolarAcceptance=false)))
end
@testset "C2 spatial waves with full shared water step" begin;main();end
