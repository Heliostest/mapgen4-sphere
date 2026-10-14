include("common.jl")
function main()
    g=selected_native_graph();lat=Float64.(g.lat);lon=Float64.(g.lon);n=length(lat)
    x,east,north=xyz_basis(lat,lon);axis=normalize([.21,-.69,.55]);angle=.91
    # Change the global Cartesian frame while retaining all cell ids/weights.
    K=[0. -axis[3] axis[2];axis[3] 0. -axis[1];-axis[2] axis[1] 0.]
    O=cos(angle)*Matrix{Float64}(I,3,3)+(1-cos(angle))*(axis*axis')+sin(angle)*K
    xr=x*O';latr=asin.(xr[:,3]);lonr=atan.(xr[:,2],xr[:,1]);_,er,nr=xyz_basis(latr,lonr)
    p=1 .+.2x[:,3];pref=1 .+.1x[:,1];c=graph_core(g,pref,[.2,.8];radius=3.7)
    F=hcat(sin.(3lon),cos.(2lat),sin.(lat.+lon));F.-=sum(F.*x;dims=2).*x
    u,v=components(F,east,north);ur,vr=components(F*O',er,nr)
    u=hcat(u,-.3u);v=hcat(v,-.3v);ur=hcat(ur,-.3ur);vr=hcat(vr,-.3vr)
    before=(copy(p),copy(u),copy(v),copy(pref),copy(c.ds))
    m=WindMap(c,lat,lon);j=import_wind(m,p,u,v)
    @test (p,u,v,pref,c.ds)==before
    jr=import_wind(WindMap(c,latr,lonr),p,ur,vr)
    relative=norm(jr-j)/norm(j)
    @test relative<1e-13
    @test maximum(abs,c.divergence*(jr-j))<1e-12
    @test import_wind(m,2p,u,v)≈2j rtol=2e-14
    @test import_wind(m,p,zero.(u),zero.(v))==zero.(j)
    s=hodge_split(m,j)
    @test_throws ArgumentError hodge_split(m,j[:,1:1])
    bad=copy(j);bad[1]=Inf
    @test_throws ArgumentError hodge_split(m,bad)
    # Potential-only import must visibly lose the supplied circulation.
    @test norm(s.solenoidal)>.1norm(j)
    write_result((passed=true,rotationalCovarianceRelativeError=relative))
end
@testset "C4 covariance and immutable native inputs" begin;main();end
