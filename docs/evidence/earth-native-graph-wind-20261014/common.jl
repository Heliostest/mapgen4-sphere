using LinearAlgebra,SparseArrays,Serialization,JSON3,SHA,Test
include("../earth-conservative-transport-20261013/conservative-core.jl")
include("../earth-conservative-transport-20261013/conservative-grid.jl")
include("../earth-conservative-accuracy-20261013/modal-core.jl")
include("../earth-conservative-accuracy-20261013/fct-transport.jl")
include("../earth-conservative-accuracy-20261013/fct-core.jl")
include("graph-wind.jl")
using .ConservativeCore,.ConservativeGrid,.ModalAcoustics,.FluxCorrectedTransport,.CoupledFCT,.GraphWind
BLAS.set_num_threads(1)
const OUT="build/earth-native-graph-wind"
const C3="docs/evidence/earth-polar-pressure-20261014/raw"
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
function write_result(value)
    write(joinpath(OUT,ENV["WIND_RUN_NAME"]*".json"),JSON3.write(value))
end
function selected_native_graph()
    path=joinpath(C3,"c3-spatial-near-audit-v1-native-graph.json")
    audit=jsonfile(joinpath(C3,"c3-spatial-near-audit-v1.json"))
    bytes2hex(sha256(read(path)))==audit.nativeGraphSha256 || error("C3 graph/audit hash mismatch")
    audit.spatialCandidateAccepted && isempty(audit.failures) && length(audit.refinement)==55 || error("incomplete independent C3 audit")
    jsonfile(path)
end
