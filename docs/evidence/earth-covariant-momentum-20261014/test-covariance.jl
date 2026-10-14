include("common.jl")
function main()
    lat=[-.7,-.2,.3,.8,.1,-.4];lon=[.1,1.,2.1,3.4,4.2,5.1];n=length(lat)
    a=[1,2,3,4,5,6,1,2,3];b=[2,3,4,5,6,1,4,5,6];F=[.03,-.02,.05,-.04,.01,.02,-.03,.01,.02]
    mo=[1.,1.4,1.2,1.8,1.6,1.1];mn=copy(mo)
    for (i,j,f) in zip(a,b,F);mn[i]-=f;mn[j]+=f;end
    g=ConnectionGeometry(lat,lon,a,b);x,e,z=xyz_basis(lat,lon);u=randn(MersenneTwister(19),n,2);U=u[:,1].*e+u[:,2].*z
    axis=normalize([.3,-.6,.7]);K=[0. -axis[3] axis[2];axis[3] 0. -axis[1];-axis[2] axis[1] 0.];Q=exp(.87K)
    rotated=x*Q';lat2=asin.(rotated[:,3]);lon2=atan.(rotated[:,2],rotated[:,1]);_,e2,z2=xyz_basis(lat2,lon2)
    g2=ConnectionGeometry(lat2,lon2,a,b);u2=components(U*Q',e2,z2)
    r=transport_momentum(g,mo,mn,F,u);r2=transport_momentum(g2,mo,mn,F,u2)
    cart=r.velocity[:,1].*e+r.velocity[:,2].*z;cart2=r2.velocity[:,1].*e2+r2.velocity[:,2].*z2
    error=norm(cart2-cart*Q')/norm(cart)
    @test error<5e-13
    @test r.temporalLoss≈r2.temporalLoss rtol=5e-13
    @test r.spatialLoss≈r2.spatialLoss rtol=5e-13
    # Explicitly quantify why the C5 adjoint cannot be used as an inverse.
    graph,initial,geo=native_inputs();c=graph_core(graph,initial.pref,initial.ds;radius=Float64(geo.radiusM))
    rot=RotationMap(c,Float64.(graph.lat),Float64.(graph.lon),[0.,0.,7.292115e-5]);wind=WindMap(c,Float64.(graph.lat),Float64.(graph.lon))
    native=import_wind(wind,initial.pressure,initial.u,initial.v);random=randn(MersenneTwister(78),size(native))
    H=c.g.edgeLength.*c.g.centerDistance./c.prefFace;rows=[]
    for (kind,j) in (("native",native),("arbitrary",random))
        mapped=rot.P*reconstruct(rot,j)
        er=sqrt(sum(H.*(mapped-j).^2 .*transpose(c.ds))/sum(H.*j.^2 .*transpose(c.ds)))
        @test er>1e-4
        push!(rows,(kind=kind,relativeEdgeFeedbackError=er))
    end
    write_result((passed=true,frameCovarianceRelative=error,feedback=rows,c5FeedbackImplemented=false))
end
@testset "C6 frame covariance and C5 interface audit" begin;main();end
