include("common.jl")
include("../earth-rotating-sigma-20261014/vector-core.jl")
using .VectorInvariant
rows=[]
for nr in (24,48,96)
    graph=jsonfile(joinpath(C4,"c4-graphs-v1-$(nr)-graph.json"));lat=Float64.(graph.lat);lon=Float64.(graph.lon)
    x,east,north=xyz_basis(lat,lon);n=length(lat);c=graph_core(graph,ones(n),[1.]);pw=PressureWorkCore(c);m=VectorCore(pw,lat,lon,zeros(3))
    ep=abs.(lat[c.g.from]).>deg2rad(75.) .|| abs.(lat[c.g.to]).>deg2rad(75.)
    for (ia,axis) in enumerate([normalize([.37,.53,.76]),normalize([.81,-.47,.19])])
        t=x*axis;V=transpose(axis).-t.*x;f=(15t.^2 .-3)/2;fp=15t;p=exp.(.2t)
        ue,un=components(f.*V,east,north);ve=m.east*ue+m.north*un
        exactK=f.^2 .*(1 .-t.^2)/2;K=vec(pw.S'*(pw.h.*ve.^2)./(4c.g.area))
        pu,pv=components(-.2V,east,north);pressureExact=m.east*pu+m.north*pv
        ku,kv=components(-(f.*fp.*(1 .-t.^2)-f.^2 .*t).*V,east,north);kineticExact=m.east*ku+m.north*kv
        exact=pressureExact+kineticExact; normH(z)=sqrt(sum(pw.h.*z.^2)/sum(pw.h))
        err(z)=(globalError=normH(z)/normH(exact),polar=sqrt(sum(pw.h[ep].*vec(z)[ep].^2)/sum(pw.h[ep]))/normH(exact))
        H=pw.h.*(pw.S*p/2);re=(m.east'*(H.*ve))./(c.g.area.*p);rn=(m.north'*(H.*ve))./(c.g.area.*p)
        exactInputCurl=(c.divergence*(m.east*un-m.north*ue))./c.g.area
        got=neutral_tendency(m,p,ve)
        push!(rows,(rings=nr,axis=ia,pressure=err(c.gradient*(.2t)-pressureExact),exactKGradient=err(c.gradient*exactK-kineticExact),kineticSampling=err(c.gradient*(K-exactK)),curlForce=err(got.vorticity),total=err(c.gradient*(.2t+K)+got.total-exact),
            reconstruction=sqrt(sum(c.g.area.*((re-ue).^2+(rn-un).^2))/sum(c.g.area.*(ue.^2+un.^2))),curlExactInput=sqrt(sum(c.g.area.*exactInputCurl.^2)/sum(c.g.area)),curlActual=sqrt(sum(c.g.area.*got.curl.^2)/sum(c.g.area))))
    end
end
@testset "C10 reproduced kinetic sampling defect" begin
    finest=filter(r->r.rings==96,rows)
    @test all(r->r.kineticSampling.polar>10r.exactKGradient.polar,finest)
    @test isapprox(finest[1].total.polar,.12335433329548087;rtol=1e-11)
end
write_result((passed=true,rows=rows))
