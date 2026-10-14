using LinearAlgebra,JSON3,JLD2,SHA
include("transport-v2-model.jl")
BLAS.set_num_threads(1)
const ROOT=normpath(joinpath(@__DIR__,"../../.."))
const SOURCE=joinpath(ROOT,"build/earth-speedy-moisture-monsoon/coupled-seasonal-statistics-start.jld2")
saved=JLD2.load(SOURCE);sg=SW.SpectralGrid(NF=Float64,truncation=32,nlayers=8)
m=transport_model(sg,"seasonal");v=SW.Variables(m)
for (key,data) in saved["containers"];SW.copy_variables!(getproperty(v,Symbol(key)),data);end
result=[]
for step in 1:2,key in (:temperature,:humidity,:pressure,:vorticity,:divergence)
    x=SW.get_step(getproperty(v.prognostic,key),step)
    grid=SW.transform(x,m.spectral_transform)
    key==:humidity&&SW.hole_filling!(grid,m.hole_filling,m)
    old=SW.get_step(getproperty(v.grid,key),step)
    push!(result,(;step,field=string(key),maxDifferenceFromStoredHistory=maximum(abs,grid.data-old.data)))
end
println(JSON3.write((;sourceSHA=bytes2hex(sha256(read(SOURCE))),scriptSHA=bytes2hex(sha256(read(@__FILE__))),result)))
