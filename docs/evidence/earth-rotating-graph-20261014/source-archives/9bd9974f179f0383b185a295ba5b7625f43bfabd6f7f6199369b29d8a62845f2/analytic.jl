include("common.jl")
function main()
    rows=[];balances=[];axes=[normalize([.37,.53,.76]),normalize([.81,-.47,.19])]
    for nr in (24,48,96)
        graph=jsonfile(joinpath(C4,"c4-graphs-v1-$(nr)-graph.json"))
        lat=Float64.(graph.lat);lon=Float64.(graph.lon);n=length(lat)
        x,east,north=xyz_basis(lat,lon);area=Float64.(graph.area);polar=abs.(lat).>deg2rad(75.)
        for variable in (false,true)
            pref=variable ? 1 .+.15x[:,1] : ones(n)
            c=graph_core(graph,pref,[1.];c2=4.);wind=WindMap(c,lat,lon)
            for (ia,axis) in enumerate(axes)
                omega=.1axis;m=RotationMap(c,lat,lon,omega);t=x*axis
                rot=reduce(vcat,[transpose(cross(axis,x[i,:])) for i in 1:n])
                grad=((15t.^2 .-3)/2).*(transpose(axis).-t.*x)
                for (kind,U) in (("rotation",rot),("gradient3",grad),("mixed",rot+.7grad))
                    u,v=components(U,east,north);j=import_wind(wind,pref,u,v)
                    uv=reconstruct(m,j);recovered=uv[1:n,:].*east+uv[n+1:2n,:].*north
                    force=-2t*.1 .* reduce(vcat,[transpose(cross(x[i,:],U[i,:])) for i in 1:n])
                    fu,fv=components(force,east,north);exact=import_wind(wind,pref,fu,fv)
                    tendency=coriolis_tendency(m,j);H=c.g.edgeLength.*c.g.centerDistance./c.prefFace
                    scale=sqrt(sum(area.*sum(U.^2;dims=2))/sum(area))
                    err=sqrt.(vec(sum((recovered-U).^2;dims=2)))
                    edgePolar=polar[c.g.from].|polar[c.g.to]
                    forceScale=sqrt(sum(H.*exact.^2)/sum(H))
                    row=(rings=nr,variable=variable,axis=ia,kind=kind,
                      reconstruction=sqrt(sum(area.*err.^2)/sum(area))/scale,polarReconstruction=maximum(err[polar])/scale,
                      force=sqrt(sum(H.*(tendency-exact).^2)/sum(H))/forceScale,
                      polarForce=maximum(abs,(tendency-exact)[edgePolar,:])/forceScale)
                    push!(rows,row)
                    @test abs(sum(H.*j.*tendency))/max(sum(H.*j.^2),eps())<1e-13
                    if !variable&&kind=="rotation"
                        # Linear solid-body geostrophic balance on unit sphere.
                        ratio=1 .-.1t.^2/c.c2
                        balance=c.c2*c.prefFace.*(c.gradient*ratio)+tendency
                        push!(balances,(rings=nr,axis=ia,relativeForce=sqrt(sum(H.*balance.^2)/sum(H.*exact.^2)),maxDivergence=maximum(abs,(c.divergence*j)./area)))
                    end
                end
            end
        end
        println(JSON3.write((rings=nr,maximumReconstruction=maximum(r.reconstruction for r in rows if r.rings==nr),maximumForce=maximum(r.force for r in rows if r.rings==nr))));flush(stdout)
    end
    write_result((passed=false,rows=rows,balances=balances))
    for i in 1:12
        a,b,c=rows[i],rows[i+12],rows[i+24]
        for key in (:reconstruction,:polarReconstruction,:force,:polarForce)
            @test getproperty(a,key)>getproperty(b,key)>getproperty(c,key)
            @test getproperty(c,key)<(key in (:force,:reconstruction) ? .03 : .10)
        end
    end
    for i in 1:2
        @test balances[i].relativeForce>balances[i+2].relativeForce>balances[i+4].relativeForce
        @test balances[i+4].relativeForce<.03
        @test maximum(b.maxDivergence for b in balances)<1e-6
    end
    write_result((passed=true,rows=rows,balances=balances))
end
@testset "C5 continuum reconstruction, Coriolis and balance" begin;main();end
