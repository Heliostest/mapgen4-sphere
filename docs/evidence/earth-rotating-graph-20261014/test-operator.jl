include("common.jl")
function main()
    c,lat,lon=small_core();omega=[.03,-.05,.12];m=RotationMap(c,lat,lon,omega)
    n=length(lat);ne=length(c.g.from);x,east,north=xyz_basis(lat,lon)
    # Independent dense assembly from Cartesian edge geometry (not WindMap).
    P=zeros(ne,2n)
    for e in 1:ne,i in (c.g.from[e],c.g.to[e])
        delta=x[c.g.to[e],:]-x[c.g.from[e],:]
        P[e,i]=c.pref[i]*dot(delta,east[i,:])/(2c.g.centerDistance[e])
        P[e,n+i]=c.pref[i]*dot(delta,north[i,:])/(2c.g.centerDistance[e])
    end
    hmetric=c.g.edgeLength.*c.g.centerDistance./c.prefFace
    M=Diagonal(repeat(c.g.area.*c.pref,2));H=Diagonal(hmetric)
    R=M\(P'*H);f=2x*omega;J=[zeros(n,n) Diagonal(f);-Diagonal(f) zeros(n,n)];C=P*J*R
    rng=MersenneTwister(20261014);j=randn(rng,ne,2);before=copy(j);h=.73
    @test norm(coriolis_tendency(m,j))>1e-5
    @test reconstruct(m,j)≈R*j rtol=2e-13
    @test coriolis_tendency(m,j)≈C*j rtol=2e-13
    @test norm(H*C+C'*H)<2e-14*norm(H*C)
    actual=coriolis_step(m,j,h);expected=(I-h*C/2)\((I+h*C/2)*j)
    @test actual≈expected rtol=2e-13
    hn(z)=sum(hmetric.*z.^2 .*transpose(c.ds))
    @test abs(hn(actual)-hn(j))/hn(j)<2e-13
    @test abs(sum(hmetric.*j.*coriolis_tendency(m,j).*transpose(c.ds)))/hn(j)<2e-14
    @test coriolis_step(m,actual,-h)≈j rtol=3e-13
    @test coriolis_step(RotationMap(c,lat,lon,-omega),j,h)≈coriolis_step(m,j,-h) rtol=3e-13
    @test coriolis_step(RotationMap(c,lat,lon,zeros(3)),j,h)==j
    @test coriolis_step(m,j,0.)==j
    @test j==before
    # Invisible edge modes are retained, never projected away.
    N=nullspace(R);@test size(N,2)>0
    hidden=hcat(N[:,1],N[:,end]);@test coriolis_step(m,hidden,h)≈hidden atol=2e-14
    @test_throws ArgumentError RotationMap(c,lat,lon,[0.,NaN,1.])
    @test_throws ArgumentError RotationMap(c,lat,lon,[0.,1.])
    @test_throws ArgumentError reconstruct(m,zeros(ne-1,2))
    @test_throws ArgumentError coriolis_step(m,j,Inf)
    bad=copy(j);bad[1]=NaN;@test_throws ArgumentError coriolis_step(m,bad,h)
    write_result((passed=true,relativeMidpointError=norm(actual-expected)/norm(expected),energyError=abs(hn(actual)-hn(j))/hn(j),hiddenModes=size(N,2)))
end
@testset "C5 independent Coriolis operator" begin;main();end
