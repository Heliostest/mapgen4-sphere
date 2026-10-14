using JSON3,Serialization,LinearAlgebra,Test
include("conservative-core.jl")
include("conservative-grid.jl")
include("mimetic-gradient.jl")
using .ConservativeCore,.ConservativeGrid,.MimeticGradient
BLAS.set_num_threads(1)
const OUT=joinpath(@__DIR__,"../../../build/earth-conservative-transport")
function main()
    names=["candidate-c1-native-1800","candidate-c1-native-900","candidate-c1-native-450"]
    runs=[JSON3.read(read(joinpath(OUT,name*".json"),String)) for name in names]
    states=[deserialize(joinpath(OUT,name*"-real-final.bin")).state for name in names]
    imports=[deserialize(joinpath(OUT,name*"-import.bin")) for name in names]
    @test all(imports[1]==v for v in imports)
    data=JSON3.read(read(joinpath(@__DIR__,"../../../build/earth-speedy-transport/split-reference-seasonal-geometry.json"),String))
    mesh=build_gaussian_mesh(data.latDegrees,data.lonDegrees,data.weights)
    g=Geometry(mesh.area,mesh.from,mesh.to,mesh.edgeLength,mesh.centerDistance,data.radiusM)
    D=reconstruction_gradient(mesh);pairs=pair_decomposition(D,mesh.edgeLength.*mesh.centerDistance,g.radius)
    c=TransportCore(g,imports[1].pref,imports[1].ds;c2=runs[1].c2,gradient=D/g.radius,transport_pairs=pairs,method=:variational)
    q(s)=s.W./mass(c,s.p)
    weightedNorm(v)=sqrt(sum(mesh.area.*v.^2)/sum(mesh.area))
    pressureDifferences=[weightedNorm(states[i].p-states[i+1].p) for i in 1:2]
    humidityDifferences=[sqrt(sum(mass(c,states[i].p).*(q(states[i])-q(states[i+1])).^2)/sum(mass(c,states[i].p))) for i in 1:2]
    velocityDifferences=[sqrt(sum((mesh.edgeLength.*mesh.centerDistance).*vec(sum((states[i].j-states[i+1].j).^2 .* transpose(c.ds),dims=2)))/sum(mesh.edgeLength.*mesh.centerDistance))/(sum(c.prefFace)/length(c.prefFace)) for i in 1:2]
    initial=imports[1];j=zeros(length(mesh.from),length(c.ds))
    for k in eachindex(c.ds)
        j[:,k]=(initial.pressure[mesh.from]+initial.pressure[mesh.to])/2 .* sample_native_velocity(mesh,initial.u[:,k],initial.v[:,k])
    end
    original=State(initial.pressure,mass(c,initial.pressure).*initial.water,j,0.)
    energyFractions=[energy(c,s)/energy(c,original) for s in states]
    constant=deserialize(joinpath(OUT,names[1]*"-constant-final.bin")).state
    sharp=deserialize(joinpath(OUT,names[1]*"-sharp-final.bin")).state
    massPathIndependent=states[1].p==constant.p==sharp.p && states[1].j==constant.j==sharp.j
    @test massPathIndependent
    @test all(v.time==3*86400 for v in states)
    @test pressureDifferences[2]<pressureDifferences[1]
    @test humidityDifferences[2]<humidityDifferences[1]
    result=(scope="same original 2001 import, new source-free variational core; own-state time refinement and diagnostics only",initialImportIdentical=true,pressurePathIndependentOfTracer=massPathIndependent,pressureRmsAdjacentStepDifferencesPa=pressureDifferences,pressureRefinementRatio=pressureDifferences[1]/pressureDifferences[2],humidityRmsAdjacentStepDifferences=humidityDifferences,humidityRefinementRatio=humidityDifferences[1]/humidityDifferences[2],velocityDifferenceDiagnosticMps=velocityDifferences,acousticEnergyFractionAfterThreeDays=energyFractions,grid=(lat=data.latDegrees,lon=data.lonDegrees),initialColumnWaterMm=initial.pressure.*(initial.water*c.ds)/data.gravityMps2,finalColumnWaterMm=states[1].p.*(q(states[1])*c.ds)/data.gravityMps2,initialSharpQ=Float64.(data.lonDegrees.<180)*.02,finalSharpColumnQ=q(sharp)*c.ds)
    name=get(ENV,"CORE_RUN_NAME","analysis")
    write(joinpath(OUT,name*".json"),JSON3.write(result))
    println(JSON3.write((pressureRefinementRatio=result.pressureRefinementRatio,humidityRefinementRatio=result.humidityRefinementRatio,energyFractions=energyFractions,massPathIndependent=massPathIndependent)))
end
@testset "native time refinement and tracer-independent pressure path" begin
    main()
end
