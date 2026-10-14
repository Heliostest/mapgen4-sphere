include("../../docs/evidence/earth-covariant-momentum-20261014/common.jl")
include("../../docs/evidence/earth-covariant-momentum-20261014/advection-core.jl")
using .NonlinearAdvection
samebits(a,b)=size(a)==size(b)&&reinterpret(UInt64,vec(a))==reinterpret(UInt64,vec(b))
function main()
 graph,initial,geo=native_inputs();c=graph_core(graph,initial.pref,initial.ds;radius=Float64(geo.radiusM));lat=Float64.(graph.lat);lon=Float64.(graph.lon);rebuilt=AdvectionCore(c,lat,lon)
 rows=[];bound=String[]
 for kind in ("real","constant","sharp")
  cp="build/earth-covariant-momentum/c6-native-1800-v1-"*kind*"-checkpoint.bin"
  final="build/earth-covariant-momentum/c6-native-1800-v1-"*kind*"-final.bin"
  push!(bound,cp,final);s=load_checkpoint(cp,rebuilt);target=deserialize(final)
  @test target.identity==identity_hash(rebuilt)
  @test s.time==14400.
  for i=1:4;step!(rebuilt,s,1800.);end
  @test samebits(s.p,target.state.p)
  @test samebits(s.W,target.state.W)
  @test samebits(s.velocity,target.state.velocity)
  @test reinterpret(UInt64,s.time)==reinterpret(UInt64,target.state.time)
  push!(rows,(case=kind,restartedSteps=4,bitwise=true,time=s.time))
  println("Rebuilt checkpoint replay: "*kind);flush(stdout)
 end
 source="docs/evidence/earth-covariant-momentum-20261014/"
 for p in ["common.jl","advection-core.jl","momentum.jl"];push!(bound,source*p);end
 record=(passed=true,rows=rows,inputAndSourceHashes=Dict(p=>bytes2hex(sha256(read(p))) for p in bound))
 write("build/c6-independent-review/native-audit.json",JSON3.write(record));println(JSON3.write(record))
end
@testset "Independent native rebuilt checkpoint bit audit" begin;main();end
