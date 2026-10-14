include("common.jl")
include("vector-core.jl")
using .VectorInvariant
function main()
    rows=[];axes=[normalize([.37,.53,.76]),normalize([.81,-.47,.19])]
    for nr in (24,48,96)
        graph=jsonfile(joinpath(C4,"c4-graphs-v1-$(nr)-graph.json"));lat=Float64.(graph.lat);lon=Float64.(graph.lon)
        x,east,north=xyz_basis(lat,lon);n=length(lat);polar=abs.(lat).>deg2rad(75.)
        for variable in (false,true)
            pref=variable ? 1 .+.15x[:,1] : ones(n);c=graph_core(graph,pref,[1.]);pw=PressureWorkCore(c);m=VectorCore(pw,lat,lon,zeros(3))
            ep=polar[c.g.from].|polar[c.g.to]
            for (ia,axis) in enumerate(axes)
                t=x*axis;V=transpose(axis).-t.*x;f=(15t.^2 .-3)/2;fp=15t;p=pref.*exp.(.2t)
                u,v=components(f.*V,east,north);ve=m.east*u+m.north*v
                exactVector=-(.2 .+f.*fp.*(1 .-t.^2)-f.^2 .*t).*V
                u,v=components(exactVector,east,north);exact=m.east*u+m.north*v
                baseline=c.gradient*discrete_gradient(pw,p,p,ve,ve).mu
                candidate=baseline+neutral_tendency(m,p,ve).total
                normH(z)=sqrt(sum(pw.h.*z.^2)/sum(pw.h))
                polarError(z)=sqrt(sum(pw.h[ep].*vec(z-exact)[ep].^2)/sum(pw.h[ep]))/normH(exact)
                push!(rows,(rings=nr,variable=variable,axis=ia,c8Force=normH(baseline-exact)/normH(exact),c9Force=normH(candidate-exact)/normH(exact),
                    c8Polar=polarError(baseline),c9Polar=polarError(candidate),addedCurlForce=normH(candidate-baseline)/normH(exact)))
            end
        end
    end
    write_result((passed=false,rows=rows))
    for i in 1:4
        @test rows[i].c9Force>rows[i+4].c9Force>rows[i+8].c9Force
        @test rows[i+8].c9Force<.35
    end
    write_result((passed=true,rows=rows,scope="Same degree3 potential-flow benchmark as C8, zero rotation; diagnostic does not imply exact discrete curl-grad"))
end
@testset "C9 degree3 potential-flow polar audit" begin;main();end
