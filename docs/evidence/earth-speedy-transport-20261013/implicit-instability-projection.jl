# Independent projection of the recorded physical temperature tendency at first failure.
using SpeedyWeather, JLD2, JSON3, LinearAlgebra
const SW=SpeedyWeather
BLAS.set_num_threads(1)
sg=SW.SpectralGrid(NF=Float64,truncation=32,nlayers=8)
m=SW.PrimitiveDryModel(sg;feedback=nothing);v=SW.Variables(m)
grid=SW.get_step(v.grid.temperature,2);spectral=SW.get_step(v.tendencies.temperature)
rows=Any[]
for (label,ij,k) in (("thermal",412,4),("all",476,3))
    path="build/earth-speedy-transport/implicit-instability-"*label*"-v2-failure-fields.jld2"
    physical=JLD2.load(path,"physical")
    grid.data .= physical
    SW.transform!(spectral,grid,m.spectral_transform)
    SW.transform!(grid,spectral,m.spectral_transform)
    push!(rows,(;label,ij,k,gridPhysicalKDay=86400physical[ij,k],projectedPhysicalKDay=86400grid.data[ij,k],
        projectedPhysicalContributionAfterRAWK=3600*(1-.1*(1-.53)/2)*grid.data[ij,k],
        maxAbsGridPhysicalKDay=86400maximum(abs,physical),maxAbsProjectedPhysicalKDay=86400maximum(abs,grid.data)))
end
open(io->JSON3.write(io,rows),"build/earth-speedy-transport/implicit-instability-projection.json","w")
println(JSON3.write(rows))
