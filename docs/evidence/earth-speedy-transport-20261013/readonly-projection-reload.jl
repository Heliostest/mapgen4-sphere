# Read-only independent serialization check of the two new derived states.
using Test,JSON3,JLD2,SHA
include("transport-v2-model.jl")
include("scalar-initial-projection.jl")
using .ScalarInitialProjection
const ROOT=normpath(joinpath(@__DIR__,"../../.."))
const OUT=joinpath(ROOT,"build/earth-speedy-transport")
sg=SW.SpectralGrid(NF=Float64,truncation=32,nlayers=8)
m=repaired_model(sg,"seasonal")
records=Any[]
@testset "Derived initial state serialization preserves projected content" begin
    for year in (2001,2006)
        file=joinpath(OUT,"scalar-initial-projection-$year.jld2")
        saved=JLD2.load(file);v=SW.Variables(m)
        for(k,c) in saved["containers"];SW.copy_variables!(getproperty(v,Symbol(k)),c);end
        ledger=saved["scalar_initial_projection"]
        @test scalar_projection_state_sha(v)==ledger.afterStateSHA
        @test assert_scalar_auxiliary_zero(v,m)
        @test scalar_projection_inventory(v,m)==ledger.afterInventory
        @test ledger.sourceSHA!=bytes2hex(sha256(read(file)))
        push!(records,(;year,path=file,fileSHA=bytes2hex(sha256(read(file))),sourceSHA=ledger.sourceSHA,
            stateSHA=scalar_projection_state_sha(v),allAuxiliaryExactlyZero=true,inventory=scalar_projection_inventory(v,m)))
    end
end
result=(;scriptSHA=bytes2hex(sha256(read(@__FILE__))),records)
open(io->JSON3.write(io,result),joinpath(OUT,"readonly-projection-reload.json"),"w")
println(JSON3.write(result))
