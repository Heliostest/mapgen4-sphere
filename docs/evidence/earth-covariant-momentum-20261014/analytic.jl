include("common.jl")
function main()
    rows=[];axes=[normalize([.37,.53,.76]),normalize([.81,-.47,.19])]
    for nr in (24,48,96)
        graph=jsonfile(joinpath(C4,"c4-graphs-v1-$(nr)-graph.json"))
        lat=Float64.(graph.lat);lon=Float64.(graph.lon);n=length(lat)
        x,east,north=xyz_basis(lat,lon);area=Float64.(graph.area);polar=abs.(lat).>deg2rad(75.)
        g=ConnectionGeometry(lat,lon,graph.from,graph.to)
        for variable in (false,true)
            p=variable ? 1 .+.15x[:,1] : ones(n)
            c=graph_core(graph,p,[1.]);wind=WindMap(c,lat,lon)
            for (ia,axis) in enumerate(axes)
                t=x*axis;V=transpose(axis).-t.*x;f=(15t.^2 .-3)/2;fp=15t
                rot=reduce(vcat,[transpose(cross(axis,x[i,:])) for i in 1:n])
                for (kind,A,B) in (("rotation",1.,0.),("gradient3",0.,1.),("mixed",1.,.7))
                    U=A*rot+B*f.*V;uv=components(U,east,north)
                    vn=wind.east*uv[:,1]+wind.north*uv[:,2]
                    F=c.g.edgeLength.*vn.*ifelse.(vn.>=0,p[c.g.from],p[c.g.to])/c.g.radius
                    tendency=velocity_tendency(g,area.*p,F,uv)
                    du=tendency[:,1].*east+tendency[:,2].*north
                    au=U*axis
                    derivative=A*reduce(vcat,[transpose(cross(axis,U[i,:])) for i in 1:n])+B*(fp.*au.*V+f.*(-au.*x-t.*U))
                    exact=-(derivative-sum(derivative.*x;dims=2).*x)/c.g.radius
                    scale=sqrt(sum(area.*sum(exact.^2;dims=2))/sum(area))
                    err2=vec(sum((du-exact).^2;dims=2))
                    dm=zeros(n)
                    for (a,b,f) in zip(g.from,g.to,F);dm[a]-=f;dm[b]+=f;end
                    dmu=area.*p.*du+dm.*U
                    torque=vec(sum(reduce(vcat,[transpose(cross(x[i,:],dmu[i,:])) for i in 1:n]);dims=1))
                    row=(rings=nr,variable=variable,axis=ia,kind=kind,
                        relativeRMS=sqrt(sum(area.*err2)/sum(area))/scale,
                        polarRMS=sqrt(sum(area[polar].*err2[polar])/sum(area[polar]))/scale,
                        relativeTorque=norm(torque)/sum(area.*p.*sum(U.^2;dims=2)))
                    push!(rows,row)
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
    write_result((passed=true,rows=rows,exactAngularMomentumConservation=false))
end
@testset "C6 analytic covariant self-advection" begin;main();end
