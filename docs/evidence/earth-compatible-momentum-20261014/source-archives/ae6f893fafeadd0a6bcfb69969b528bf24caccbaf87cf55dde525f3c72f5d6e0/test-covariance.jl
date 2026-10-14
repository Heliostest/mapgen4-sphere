include("common.jl")
function main()
    c,lat,lon=small_core();m=CompatibleTransport(RotationMap(c,lat,lon,[.2,-.1,.3]),lat,lon)
    rng=MersenneTwister(74);j=randn(rng,length(c.prefFace),length(c.ds));F=.03randn(rng,length(m.connection.from))
    x,_,_=xyz_basis(lat,lon);axis=normalize([.3,-.6,.7]);K=[0. -axis[3] axis[2];axis[3] 0. -axis[1];-axis[2] axis[1] 0.];Q=exp(.87K)
    rotated=x*Q';lat2=asin.(rotated[:,3]);lon2=atan.(rotated[:,2],rotated[:,1])
    m2=CompatibleTransport(RotationMap(c,lat2,lon2,Q*m.rotation.omega),lat2,lon2)
    a=transport_step(m,j,F);b=transport_step(m2,j,F)
    @test norm(a.j-b.j)/norm(a.j)<5e-12
    @test a.loss≈b.loss rtol=5e-12
    g=c.g;cg=Geometry(g.area,g.to,g.from,g.edgeLength,g.centerDistance,g.radius)
    reversed=TransportCore(cg,c.pref,c.ds;c2=c.c2)
    mr=CompatibleTransport(RotationMap(reversed,lat,lon,m.rotation.omega),lat,lon)
    Fr=copy(F);Fr[1:length(c.prefFace)*length(c.ds)].*=-1
    r=transport_step(mr,-j,Fr)
    @test norm(r.j+a.j)/norm(a.j)<5e-12
    @test r.loss≈a.loss rtol=5e-12
    @test_throws ArgumentError CompatibleTransport(m.rotation,lat,lon.+.1)
    write_result((passed=true,covarianceRelative=norm(a.j-b.j)/norm(a.j),orientationRelative=norm(r.j+a.j)/norm(a.j)))
end
@testset "C7 frame and edge orientation" begin;main();end
