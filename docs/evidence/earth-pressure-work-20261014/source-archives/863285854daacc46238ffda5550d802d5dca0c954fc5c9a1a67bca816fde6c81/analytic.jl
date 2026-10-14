include("common.jl")
include("pressure-core.jl")
using .PressureWork
function main()
    rows=[];axes=[normalize([.37,.53,.76]),normalize([.81,-.47,.19])]
    for nr in (24,48,96)
        graph=jsonfile(joinpath(C4,"c4-graphs-v1-$(nr)-graph.json"));lat=Float64.(graph.lat);lon=Float64.(graph.lon)
        x,east,north=xyz_basis(lat,lon);n=length(lat);polar=abs.(lat).>deg2rad(75.)
        for variable in (false,true)
            pref=variable ? 1 .+.15x[:,1] : ones(n);c=graph_core(graph,pref,[1.]);m=PressureWorkCore(c);wind=WindMap(c,lat,lon)
            edgePolar=polar[c.g.from].|polar[c.g.to]
            for (ia,axis) in enumerate(axes)
                t=x*axis;V=transpose(axis).-t.*x;rot=reduce(vcat,[transpose(cross(axis,x[i,:])) for i in 1:n])
                p=pref.*exp.(.2t)
                for (kind,A,B,f,fp,div) in (("gradient1",0.,1.,ones(n),zeros(n),-2t),("mixed",1.,.7,ones(n),zeros(n),-1.4t),("gradient3",0.,1.,(15t.^2 .-3)/2,15t,-6*(5t.^3 .-3t)))
                    U=A*rot+B*f.*V;u,v=components(U,east,north);ve=wind.east*u+wind.north*v
                    dg=discrete_gradient(m,p,p,ve,ve);candidate=-(c.divergence*(dg.flux*c.ds))./c.g.area
                    exact=-p.*(div+.2B*f.*(1 .-t.^2)+(variable ? .15U[:,1]./pref : zeros(n)))
                    mu=.2t+.5*(A^2 .+B^2*f.^2).*(1 .-t.^2)
                    forceVector=-(.2 .+B^2*f.*fp.*(1 .-t.^2)-(A^2 .+B^2*f.^2).*t).*V
                    fu,fv=components(forceVector,east,north);forceExact=wind.east*fu+wind.north*fv;forceCandidate=c.gradient*dg.mu
                    normA(z)=sqrt(sum(c.g.area.*vec(z).^2)/sum(c.g.area));normH(z)=sqrt(sum(m.h.*vec(z).^2)/sum(m.h))
                    pressureError=normA(candidate-exact)/normA(exact);potentialError=normA(dg.mu-mu)/normA(mu)
                    forceError=normH(forceCandidate-forceExact)/normH(forceExact)
                    polarPressure=sqrt(sum(c.g.area[polar].*(candidate-exact)[polar].^2)/sum(c.g.area[polar]))/normA(exact)
                    polarForce=sqrt(sum(m.h[edgePolar].*vec(forceCandidate-forceExact)[edgePolar].^2)/sum(m.h[edgePolar]))/normH(forceExact)
                    push!(rows,(rings=nr,variable=variable,axis=ia,kind=kind,pressureRelative=pressureError,potentialRelative=potentialError,forceRelative=forceError,polarPressure=polarPressure,polarForce=polarForce))
                end
            end
        end
        println(JSON3.write((rings=nr,worstPressure=maximum(r.pressureRelative for r in rows if r.rings==nr),worstPotential=maximum(r.potentialRelative for r in rows if r.rings==nr),worstForce=maximum(r.forceRelative for r in rows if r.rings==nr))));flush(stdout)
    end
    write_result((passed=false,rows=rows))
    for i in 1:12
        a,b,c=rows[i],rows[i+12],rows[i+24]
        @test a.pressureRelative>b.pressureRelative>c.pressureRelative
        @test a.potentialRelative>b.potentialRelative>c.potentialRelative
        @test max(c.pressureRelative,c.potentialRelative)<.35
    end
    @test all(r->isfinite(r.forceRelative)&&isfinite(r.polarForce),rows)
    write_result((passed=true,rows=rows,forceRefinementObserved=all(rows[i].forceRelative>rows[i+12].forceRelative>rows[i+24].forceRelative for i in 1:12)))
end
@testset "C8 manufactured pressure flux and Bernoulli potential" begin;main();end
