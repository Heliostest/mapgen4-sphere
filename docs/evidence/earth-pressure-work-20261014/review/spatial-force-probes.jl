include("../../docs/evidence/earth-pressure-work-20261014/common.jl")
include("../../docs/evidence/earth-pressure-work-20261014/pressure-core.jl")
using .PressureWork
axis=normalize([.37,.53,.76])
for nr in (24,48,96)
    graph=jsonfile(joinpath(C4,"c4-graphs-v1-$(nr)-graph.json"))
    lat=Float64.(graph.lat);lon=Float64.(graph.lon);n=length(lat)
    x,east,north=xyz_basis(lat,lon);t=x*axis;U=transpose(axis).-t.*x
    c=graph_core(graph,ones(n),[1.]);m=PressureWorkCore(c);w=WindMap(c,lat,lon)
    u,v=components(U,east,north);vel=import_wind(w,ones(n),u,v)
    kappa=discrete_gradient(m,ones(n),ones(n),vel,vel).kappa
    exact=(1 .-t.^2)/2
    au,av=components(t.*U,east,north);expected=import_wind(w,ones(n),au,av)
    actual=c.gradient*kappa
    h=c.g.edgeLength.*c.g.centerDistance
    polar=(abs.(lat[c.g.from]).>deg2rad(75.)).|(abs.(lat[c.g.to]).>deg2rad(75.))
    cellError=sqrt(sum(c.g.area.*(kappa-exact).^2)/sum(c.g.area.*exact.^2))
    edgeError=sqrt(sum(h.*(actual-vec(expected)).^2)/sum(h.*expected.^2))
    polarError=sqrt(sum(h[polar].*(actual[polar]-vec(expected)[polar]).^2)/sum(h.*expected.^2))
    println((rings=nr,potentialRelative=cellError,forceRelative=edgeError,polarContribution=polarError))
end
