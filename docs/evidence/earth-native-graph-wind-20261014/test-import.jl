include("common.jl")
function main()
    graph=selected_native_graph();lat=Float64.(graph.lat);lon=Float64.(graph.lon)
    n=length(lat);x,east,north=xyz_basis(lat,lon);axis=normalize([.37,.53,.76])
    F=reduce(vcat,[transpose(cross(axis,x[i,:])) for i in 1:n])
    u,v=components(F,east,north);c=graph_core(graph,ones(n),[1.]);m=WindMap(c,lat,lon)
    j=import_wind(m,ones(n),u,v)
    # Independent rigid-rotation chord formula: losing the graph cycle gives zero.
    expected=[dot(axis,cross(x[i,:],x[k,:]))/d for (i,k,d) in zip(c.g.from,c.g.to,c.g.centerDistance)]
    @test norm(j[:,1]-expected)/norm(expected)<2e-14
    @test maximum(abs,(c.divergence*j)./c.g.area)<1e-6
    split=hodge_split(m,j)
    H=c.g.edgeLength.*c.g.centerDistance./c.prefFace
    hnorm(z)=sqrt(sum(H.*z.^2))
    @test hnorm(split.solenoidal)/hnorm(j)>1-1e-10
    @test hnorm(split.divergent+split.solenoidal-j)/hnorm(j)<2e-16
    @test maximum(abs,c.divergence*split.solenoidal)<1e-11
    @test abs(sum(H.*split.solenoidal.*split.divergent))/sum(H.*j.^2)<1e-11
    # A variable p, different pref, unequal layers and physical radius catch
    # pref/p substitution, duplicated ds, layer collapse and a missing 1/R.
    p=80000 .* (1 .+.2x[:,3]);pref=90000 .* (1 .+.1x[:,1]);R=6.371e6
    c2=graph_core(graph,pref,[.2,.3,.5];radius=R,c2=82671.64740772452)
    m2=WindMap(c2,lat,lon);uu=hcat(u,2u,-.4u);vv=hcat(v,2v,-.4v)
    j2=import_wind(m2,p,uu,vv);before=(copy(p),copy(uu),copy(vv))
    @test j2[:,2]≈2j2[:,1] rtol=2e-14
    @test j2[:,3]≈-.4j2[:,1] rtol=2e-14
    # Weak derivative assembled independently by nodal neighbour accumulation.
    f=x[:,1].+.37x[:,2].+.3x[:,3].^3;Q=zeros(n,3)
    for e in eachindex(c2.g.from)
        i,k=c2.g.from[e],c2.g.to[e];delta=x[k,:]-x[i,:]
        term=graph.conductance[e]*delta*(f[k]-f[i])/(2R)
        Q[i,:]+=term/c2.g.area[i];Q[k,:]+=term/c2.g.area[k]
    end
    lhs=dot(f,c2.divergence*j2[:,1]);rhs=-sum(c2.g.area.*p.*vec(sum(F.*Q;dims=2)))
    weakScale=sum(abs.(c2.g.area.*p).*vec(sum(abs.(F.*Q);dims=2)))
    @test abs(lhs)>1e-4 # this fixture must exercise nonzero pressure-weighted divergence
    @test abs(lhs-rhs)<2e-13*weakScale
    # Reversal of every edge must reverse j but preserve physical divergence.
    gr=Geometry(graph.area,graph.to,graph.from,graph.conductance.*graph.distance,graph.distance,R)
    cr=TransportCore(gr,pref,c2.ds;c2=c2.c2,method=:fitted_graph)
    jr=import_wind(WindMap(cr,lat,lon),p,uu,vv)
    @test jr≈-j2 rtol=2e-14
    @test cr.divergence*jr≈c2.divergence*j2 rtol=2e-14
    @test (p,uu,vv)==before
    @test_throws ArgumentError import_wind(m2,p,uu[:,1:2],vv)
    @test_throws ArgumentError import_wind(m2,-p,uu,vv)
    bad=copy(uu);bad[1]=NaN
    @test_throws ArgumentError import_wind(m2,p,bad,vv)
    @test_throws ArgumentError WindMap(c2,lat[1:end-1],lon)
    @test_throws ArgumentError WindMap(c2,lat,reverse!(copy(lon)))
    write_result((passed=true,rigidRotationMaxDivergence=maximum(abs,(c.divergence*j)./c.g.area),weakResidual=abs(lhs-rhs)))
end
@testset "C4 import contract" begin;main();end
