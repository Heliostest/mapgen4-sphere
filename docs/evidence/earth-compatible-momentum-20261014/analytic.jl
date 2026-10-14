include("common.jl")
function main()
    rows=[];axes=[normalize([.37,.53,.76]),normalize([.81,-.47,.19])]
    for nr in (24,48,96)
        graph=jsonfile(joinpath(C4,"c4-graphs-v1-$(nr)-graph.json"))
        lat=Float64.(graph.lat);lon=Float64.(graph.lon);n=length(lat)
        x,east,north=xyz_basis(lat,lon);polar=abs.(lat).>deg2rad(75.)
        for variable in (false,true)
            pref=variable ? 1 .+.15x[:,1] : ones(n)
            c=graph_core(graph,pref,[1.]);wind=WindMap(c,lat,lon)
            m=CompatibleTransport(RotationMap(c,lat,lon,zeros(3)),lat,lon)
            H=c.g.edgeLength.*c.g.centerDistance./c.prefFace;edgePolar=polar[c.g.from].|polar[c.g.to]
            for (ia,axis) in enumerate(axes)
                t=x*axis;V=transpose(axis).-t.*x;f=(15t.^2 .-3)/2;fp=15t
                rot=reduce(vcat,[transpose(cross(axis,x[i,:])) for i in 1:n])
                for (kind,A,B) in (("rotation",1.,0.),("gradient3",0.,1.),("mixed",1.,.7))
                    U=A*rot+B*f.*V;u,v=components(U,east,north);j=import_wind(wind,pref,u,v)
                    F=c.transferCoefficient.*j[:,1]
                    candidate=split_tendency(m,j,F)
                    au=U*axis
                    derivative=A*reduce(vcat,[transpose(cross(axis,U[i,:])) for i in 1:n])+B*(fp.*au.*V+f.*(-au.*x-t.*U))
                    divergence=-12B*(5t.^3 .-3t)/2+(variable ? .15U[:,1]./pref : zeros(n))
                    exactVector=-(derivative-sum(derivative.*x;dims=2).*x)-divergence.*U/2
                    eu,ev=components(exactVector,east,north);exact=import_wind(wind,pref,eu,ev)
                    scale=sqrt(sum(H.*exact.^2)/sum(H));error=candidate-exact
                    push!(rows,(rings=nr,variable=variable,axis=ia,kind=kind,
                        relativeRMS=sqrt(sum(H.*error.^2)/sum(H))/scale,
                        polarRMS=sqrt(sum(H[edgePolar].*error[edgePolar,:].^2)/sum(H[edgePolar]))/scale))
                end
            end
        end
        println(JSON3.write((rings=nr,worstRMS=maximum(r.relativeRMS for r in rows if r.rings==nr),worstPolar=maximum(r.polarRMS for r in rows if r.rings==nr))));flush(stdout)
    end
    write_result((passed=false,rows=rows))
    for i in 1:12
        a,b,c=rows[i],rows[i+12],rows[i+24]
        @test a.relativeRMS>b.relativeRMS>c.relativeRMS
        @test a.polarRMS>b.polarRMS>c.polarRMS
        @test c.relativeRMS<.35
    end
    write_result((passed=true,rows=rows,equation="reference-mass split-form tendency, not full physical momentum"))
end
@testset "C7 analytic compatible split form" begin;main();end
