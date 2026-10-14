include("common.jl")
include("dense-reference.jl")
function main()
    c,lat,lon=small_core();m=CompatibleTransport(RotationMap(c,lat,lon,[.2,-.1,.3]),lat,lon)
    rng=MersenneTwister(73);F=.02randn(rng,length(m.connection.from));j=randn(rng,length(c.prefFace),length(c.ds))
    d=dense_reference(m,F);v=vec(j);expected=(I-d.L/2)\((I+d.L/2)*v)
    before=(copy(j),copy(F));r=transport_step(m,j,F);mid=(v+vec(r.j))/2;u=d.R*mid
    loss=-dot(u,d.N*u);ko=dot(v,d.H.*v)/2;kn=dot(vec(r.j),d.H.*vec(r.j))/2
    @test norm(vec(r.j)-expected)/norm(expected)<5e-12
    @test norm(vec(split_tendency(m,j,F))-d.L*v)/norm(d.L*v)<5e-12
    @test abs(kn-ko+loss)/ko<5e-12
    @test r.loss≈loss rtol=5e-12
    @test kn<ko
    @test r.equationRelative<5e-12&&r.energyRelative<5e-12
    @test (j,F)==before
    @test transport_step(m,j,zero(F)).j==j
    # H-orthogonal kernel component remains, even though R is not an inverse.
    projection=d.P*((d.P'*Diagonal(d.H)*d.P)\(d.P'*Diagonal(d.H)))
    z=(I-projection)*v
    @test norm(d.R*z)/norm(z)<5e-12
    @test norm((I-projection)*(vec(r.j)-v))/norm(v)<5e-12
    @test norm(vec(transport_step(m,reshape(z,size(j)),F).j)-z)/norm(z)<5e-12
    @test_throws ArgumentError transport_step(m,j,fill(NaN,length(F)))
    @test_throws ArgumentError transport_step(m,j,F;maxiter=0)
    @test_throws StepRejected transport_step(m,j,F;maxiter=1)
    @test_throws StepRejected transport_step(m,j,1e8F)
    write_result((passed=true,denseRelative=norm(vec(r.j)-expected)/norm(expected),kernelRelative=norm((I-projection)*(vec(r.j)-v))/norm(v),energyRelative=abs(kn-ko+loss)/ko,loss=loss,iterations=r.iterations))
end
@testset "C7 compatible edge transport" begin;main();end
