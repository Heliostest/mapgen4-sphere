include("../../docs/evidence/earth-rotating-sigma-20261014/common.jl")
include("../../docs/evidence/earth-rotating-sigma-20261014/vector-core.jl")
using .VectorInvariant
rows=[]
for path in ARGS
 graph=jsonfile(path);lat=Float64.(graph.lat);lon=Float64.(graph.lon);x,east,north=xyz_basis(lat,lon);n=length(lat)
 c=graph_core(graph,ones(n),[1.]);pw=PressureWorkCore(c);m=VectorCore(pw,lat,lon,zeros(3));ep=abs.(lat[c.g.from]).>deg2rad(75.) .|| abs.(lat[c.g.to]).>deg2rad(75.)
 for (ia,axis) in enumerate([normalize([.37,.53,.76]),normalize([.81,-.47,.19])])
  t=x*axis;V=transpose(axis).-t.*x;f=(15t.^2 .-3)/2;fp=15t;p=exp.(.2t);ue,un=components(f.*V,east,north);ve=m.east*ue+m.north*un
  eu,en=components(-(.2 .+f.*fp.*(1 .-t.^2)-f.^2 .*t).*V,east,north);exact=m.east*eu+m.north*en
  got=c.gradient*discrete_gradient(pw,p,p,ve,ve).mu+neutral_tendency(m,p,ve).total
  normH(z)=sqrt(sum(pw.h.*z.^2)/sum(pw.h));polar=sqrt(sum(pw.h[ep].*(got-exact)[ep].^2)/sum(pw.h[ep]))/normH(exact)
  push!(rows,(path=path,axis=ia,globalError=normH(got-exact)/normH(exact),polar=polar))
 end
end
println(JSON3.write(rows))
write("build/c10-diagnosis/compare-"*ENV["C10_PROBE"]*".json",JSON3.write(rows))
