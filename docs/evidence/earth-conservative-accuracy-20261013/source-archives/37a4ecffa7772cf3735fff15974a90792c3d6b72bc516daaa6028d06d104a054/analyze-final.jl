using JSON3,Serialization,LinearAlgebra,Test,SHA
include("../earth-conservative-transport-20261013/conservative-core.jl")
using .ConservativeCore
const OUT=joinpath(@__DIR__,"../../../build/earth-conservative-accuracy")
function main()
    names=["c2-final-1800","c2-final-900","c2-final-450"]
    inputPaths=vcat([joinpath(OUT,n*".json") for n in names],[joinpath(OUT,n*"-real-final.bin") for n in names],
        [joinpath(OUT,"c2-final-upwind-1800.json"),joinpath(OUT,"c2-final-upwind-1800-real-final.bin"),joinpath(OUT,"c2-final-sphere.json"),joinpath(OUT,"c2-final-pressure-space.json"),joinpath(@__DIR__,"../../../build/earth-conservative-transport/candidate-c1-tilted.json")],
        [joinpath(@__DIR__,"../../../build/earth-conservative-transport/candidate-c1-native-1800.json"),joinpath(@__DIR__,"../../../build/earth-conservative-transport/candidate-c1-temporal-reference-v2.json"),joinpath(@__DIR__,"../../../build/earth-speedy-transport/split-reference-seasonal-geometry.json")])
    hashes=Dict(p=>bytes2hex(sha256(read(p))) for p in inputPaths)
    runs=[JSON3.read(read(joinpath(OUT,n*".json"),String)) for n in names]
    s=[deserialize(joinpath(OUT,n*"-real-final.bin")).state for n in names]
    c1=JSON3.read(read(inputPaths[end-2],String));oldTime=JSON3.read(read(inputPaths[end-1],String));geometry=JSON3.read(read(inputPaths[end],String));area=4pi*Float64.(geometry.weights)
    @test all(r->r.c2==c1.c2,runs)
    @test all(r->r.gravity==geometry.gravityMps2,runs)
    @test all(r->r.days==3,runs)
    rows=[]
    for (i,r) in enumerate(runs)
        item=r.results[1];@test item.case=="real"
        @test item.accepted==round(Int,3*86400/r.dt) && item.rejections==0
        @test item.pressureTimeErrorPa<1e-6 && item.momentumTimeErrorMps<1e-7
        @test abs(item.waterDriftMm)<1e-9 && abs(item.airDriftKgM2)<1e-8
        @test max(item.maxLocalAirRelative,item.maxLocalWaterRelative,item.maxLocalDryRelative)<5e-12
        @test item.restartBitwiseEqual && item.qmin>=0
        push!(rows,(dt=r.dt,oldPressureTimeErrorPa=oldTime.rows[i].rmsTemporalErrorPa,newPressureTimeErrorPa=item.pressureTimeErrorPa,waterDriftMm=item.waterDriftMm,relativeEnergyError=item.relativeEnergyError,accepted=item.accepted,seconds=item.elapsedSeconds,maxCenteredIterations=item.maxCenteredIterations,maxCenteredRelativeResidual=item.maxCenteredRelativeResidual))
    end
    pressureDiffs=[sqrt(sum(area.*(s[i].p-s[i+1].p).^2)/sum(area)) for i in 1:2]
    @test maximum(pressureDiffs)<1e-6
    ds=Float64.(c1.ds);m=[(area.*state.p)*transpose(ds) for state in s];q=[s[i].W./m[i] for i in 1:3]
    qdiff=[sqrt(sum(m[i+1].*(q[i]-q[i+1]).^2)/sum(m[i+1])) for i in 1:2]
    # A separate, explicit transport time-refinement gate. Finest solution is
    # not analytic truth and cannot prove the claimed order by itself.
    qRefines=qdiff[2]<qdiff[1]
    upwind=deserialize(joinpath(OUT,"c2-final-upwind-1800-real-final.bin")).state
    @test upwind.p==s[1].p && upwind.j==s[1].j
    qup=upwind.W./m[1]
    meanq=sum(s[1].W)/sum(m[1]);contrast(q,m)=sum(m.*(q.-meanq).^2)/sum(m)
    result=(scope="C2 fixed-linear acoustic and conservative FCT subsystem only; native water fine-step differences are not analytic truth",inputs=hashes,rows=rows,pressureAdjacentRmsPa=pressureDiffs,humidityAdjacentRms=qdiff,humidityRefinementRatio=qdiff[1]/qdiff[2],humidityAdjacentDifferenceDecreases=qRefines,upwindVsFCTHumidityRms=sqrt(sum(m[1].*(qup-q[1]).^2)/sum(m[1])),upwindHumidityVariance=contrast(qup,m[1]),fctHumidityVariance=contrast(q[1],m[1]),samePressureAcrossTransportAlgorithms=true,allTracersSamePressure=runs[1].samePressureAcrossTracers,spatialPressure=JSON3.read(read(joinpath(OUT,"c2-final-pressure-space.json"),String)),sphereTransport=JSON3.read(read(joinpath(OUT,"c2-final-sphere.json"),String)),fullPhysicalCoupling=false,strongPolarAccuracy=false,climateAcceptance=false)
    write(joinpath(OUT,ENV["ACCURACY_RUN_NAME"]*".json"),JSON3.write(result))
    println(JSON3.write((rows=rows,pressureDiffs=pressureDiffs,humidityDiffs=qdiff,humidityRefinementRatio=result.humidityRefinementRatio)))
    @test qRefines
    @test all(p->bytes2hex(sha256(read(p)))==hashes[p],inputPaths)
end
@testset "same-parameter C2 final accuracy and budget audit" begin;main();end
