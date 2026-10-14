using LinearAlgebra,SparseArrays,Serialization,JSON3,SHA,Test,Random
include("../earth-conservative-transport-20261013/conservative-core.jl")
include("../earth-conservative-transport-20261013/conservative-grid.jl")
include("../earth-conservative-accuracy-20261013/modal-core.jl")
include("../earth-conservative-accuracy-20261013/fct-transport.jl")
include("../earth-native-graph-wind-20261014/graph-wind.jl")
include("../earth-pressure-work-20261014/pressure-core.jl")
using .PressureWork
using .ConservativeCore,.ConservativeGrid,.ModalAcoustics,.FluxCorrectedTransport,.GraphWind
BLAS.set_num_threads(1)
const OUT="build/earth-pressure-waves"
const C3="docs/evidence/earth-polar-pressure-20261014/raw"
const C4="docs/evidence/earth-native-graph-wind-20261014/raw"
jsonfile(p)=JSON3.read(read(p,String))
function graph_core(graph,pref,ds;radius=1.,c2=1.)
    g=Geometry(graph.area,graph.from,graph.to,graph.conductance.*graph.distance,graph.distance,radius)
    TransportCore(g,pref,ds;c2=c2,method=:fitted_graph)
end
function xyz_basis(lat,lon)
    x=hcat(cos.(lat).*cos.(lon),cos.(lat).*sin.(lon),sin.(lat))
    east=hcat(-sin.(lon),cos.(lon),zero.(lon))
    north=hcat(-sin.(lat).*cos.(lon),-sin.(lat).*sin.(lon),cos.(lat))
    x,east,north
end
components(F,east,north)=(sum(F.*east;dims=2),sum(F.*north;dims=2))
write_result(value)=write(joinpath(OUT,ENV["VC_RUN_NAME"]*".json"),JSON3.write(value))
function native_inputs()
    graph=jsonfile(joinpath(C3,"c3-spatial-near-audit-v1-native-graph.json"))
    initial=deserialize(joinpath(C4,"inputs/candidate-c1-native-1800-import.bin"))
    geometry=jsonfile(joinpath(C4,"inputs/split-reference-seasonal-geometry.json"))
    graph,initial,geometry
end
function small_core(;ds=[.3,.7],radius=2.,c2=3.)
    lat=[-.8,-.35,.2,.7,.4,-.5];lon=[.1,1.,2.,3.,4.3,5.4]
    x,_,_=xyz_basis(lat,lon);f=Int[];t=Int[];d=Float64[]
    for i in 1:6,k in i+1:6
        push!(f,i);push!(t,k);push!(d,atan(norm(cross(x[i,:],x[k,:])),dot(x[i,:],x[k,:])))
    end
    g=Geometry([1.,2.,1.5,2.5,3.,2.],f,t,(.4 .+.01collect(1:length(f))).*d,d,radius)
    TransportCore(g,1 .+.1x[:,1],ds;c2=c2),lat,lon
end

include("../earth-rotating-sigma-20261014/vector-core.jl")
using .VectorInvariant
candidate_graph(nr)=jsonfile("docs/evidence/earth-metric-moments-20261014/raw/c10-fit-$(nr)-v1-graph.json")
