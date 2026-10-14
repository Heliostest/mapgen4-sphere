include("common.jl")
function main()
    names=ARGS;length(names)==4 || error("Supply 1800,900,450,225-second run names")
    records=[jsonfile(joinpath(OUT,n*".json")) for n in names]
    @test Float64.([r.dt for r in records])==[1800.,900.,450.,225.]
    @test all(r->r.passed&&r.duration==86400&&r.c2==82671.64740772452,records)
    @test all(r->r.importInfo==records[1].importInfo,records)
    states=[deserialize(joinpath(OUT,n*"-real-final.bin")) for n in names]
    @test all(s->s.identity==states[1].identity,states)
    @test all(s->s.state.time==86400.,states)
    graph=selected_native_graph();input=deserialize("build/earth-conservative-transport/candidate-c1-native-1800-import.bin")
    area=Float64.(graph.area);weight=(area.*states[end].state.p)*transpose(input.ds)
    q=[s.state.W./((area.*s.state.p)*transpose(input.ds)) for s in states]
    l2(z)=sqrt(sum(weight.*z.^2)/sum(weight))
    mean=sum(weight.*q[end])/sum(weight);scale=l2(q[end].-mean)
    adjacent=[l2(q[i]-q[i+1]) for i in 1:3]
    reference=[l2(q[i]-q[end]) for i in 1:3]
    pAdjacent=[sqrt(sum(area.*(states[i].state.p-states[i+1].state.p).^2)/sum(area)) for i in 1:3]
    result=(adjacentHumidityRMS=adjacent,referenceHumidityRMS=reference,referenceHumidityRelative=reference./scale,adjacentRatios=adjacent[1:2]./adjacent[2:3],pressureAdjacentRMSPa=pAdjacent,names=names,passed=false)
    write_result(result);println(JSON3.write(result))
    @test adjacent[1]>adjacent[2]>adjacent[3]>0
    @test reference[1]>reference[2]>reference[3]>0
    @test all(pAdjacent.<1e-6)
    write_result(merge(result,(passed=true,scope="1-day same-grid native humidity temporal refinement; fine-step reference not continuum climate truth")))
end
@testset "C4 native timestep refinement" begin;main();end
