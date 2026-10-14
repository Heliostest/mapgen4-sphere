include("common.jl")
include("coupled-core.jl")
using .RotatingAcoustics
function main()
    c,lat,lon=small_core();n=length(lat);ne=length(c.prefFace)
    x,east,north=xyz_basis(lat,lon);omega=[.03,-.05,.12];m=RotationMap(c,lat,lon,omega)
    axis=normalize([.5,.1,-.3]);theta=.63;K=[0. -axis[3] axis[2];axis[3] 0. -axis[1];-axis[2] axis[1] 0.]
    Q=I+sin(theta)*K+(1-cos(theta))*K*K
    xx=x*Q';lat2=asin.(xx[:,3]);lon2=atan.(xx[:,2],xx[:,1]);m2=RotationMap(c,lat2,lon2,Q*omega)
    rng=MersenneTwister(702);j=randn(rng,ne,length(c.ds))
    @test coriolis_tendency(m2,j)≈coriolis_tendency(m,j) rtol=2e-13
    @test coriolis_step(m2,j,.7)≈coriolis_step(m,j,.7) rtol=2e-13
    v=reconstruct(m,j);v2=reconstruct(m2,j);_,e2,n2=xyz_basis(lat2,lon2)
    for k in eachindex(c.ds)
        U=v[1:n,k].*east+v[n+1:2n,k].*north
        U2=v2[1:n,k].*e2+v2[n+1:2n,k].*n2
        @test U2≈U*Q' rtol=2e-13
    end
    g=c.g;reverse=Geometry(g.area,g.to,g.from,g.edgeLength,g.centerDistance,g.radius)
    cr=TransportCore(reverse,c.pref,c.ds;c2=c.c2);mr=RotationMap(cr,lat,lon,omega)
    @test reconstruct(mr,-j)≈reconstruct(m,j) rtol=2e-13
    @test coriolis_tendency(mr,-j)≈-coriolis_tendency(m,j) rtol=2e-13
    @test coriolis_step(mr,-j,.7)≈-coriolis_step(m,j,.7) rtol=2e-13
    @test_throws ArgumentError coriolis_step(m,zeros(ne,1),.1)
    @test_throws ArgumentError RotatingCore(FCTCore(ModalCore(cr)),m)
    @test_throws ArgumentError RotationMap(c,lat,reverse!(copy(lon)),omega)
    write_result((passed=true,frameRelativeError=norm(coriolis_tendency(m2,j)-coriolis_tendency(m,j))/norm(coriolis_tendency(m,j))))
end
@testset "C5 frame covariance and edge orientation" begin;main();end
