using LinearAlgebra,SparseArrays,Serialization,JSON3,SHA,Test,Random
include("../earth-conservative-transport-20261013/conservative-core.jl")
include("../earth-conservative-accuracy-20261013/modal-core.jl")
include("../earth-conservative-accuracy-20261013/fct-transport.jl")
include("../earth-conservative-accuracy-20261013/fct-core.jl")
include("../earth-native-graph-wind-20261014/graph-wind.jl")
include("../earth-rotating-graph-20261014/rotation-core.jl")
include("momentum.jl")
using .ConservativeCore,.ModalAcoustics,.FluxCorrectedTransport,.CoupledFCT,.GraphWind,.GraphRotation,.CovariantMomentum
BLAS.set_num_threads(1)
const OUT="build/earth-covariant-momentum"
const C3="docs/evidence/earth-polar-pressure-20261014/raw"
const C4="docs/evidence/earth-native-graph-wind-20261014/raw"
jsonfile(p)=JSON3.read(read(p,String))
write_result(value)=write(joinpath(OUT,ENV["MOM_RUN_NAME"]*".json"),JSON3.write(value))
function graph_core(graph,pref,ds;radius=1.,c2=1.)
    g=Geometry(graph.area,graph.from,graph.to,graph.conductance.*graph.distance,graph.distance,radius)
    TransportCore(g,pref,ds;c2=c2,method=:fitted_graph)
end
function xyz_basis(lat,lon)
    x=hcat(cos.(lat).*cos.(lon),cos.(lat).*sin.(lon),sin.(lat))
    e=hcat(-sin.(lon),cos.(lon),zero.(lon))
    n=hcat(-sin.(lat).*cos.(lon),-sin.(lat).*sin.(lon),cos.(lat))
    x,e,n
end
components(U,e,n)=hcat(vec(sum(U.*e;dims=2)),vec(sum(U.*n;dims=2)))
function native_inputs()
    graph=jsonfile(joinpath(C3,"c3-spatial-near-audit-v1-native-graph.json"))
    initial=deserialize(joinpath(C4,"inputs/candidate-c1-native-1800-import.bin"))
    geo=jsonfile(joinpath(C4,"inputs/split-reference-seasonal-geometry.json"))
    graph,initial,geo
end
