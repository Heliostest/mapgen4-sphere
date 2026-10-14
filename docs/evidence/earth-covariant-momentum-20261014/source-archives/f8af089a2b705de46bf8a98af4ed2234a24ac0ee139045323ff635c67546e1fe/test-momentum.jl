include("common.jl")
function main()
    # Same column, donor loses 0.5 mass with velocity10, receiver starts at rest.
    vertical=ConnectionGeometry([.4,.4],[1.,1.],[1],[2])
    mo=[2.,1.];mn=[1.5,1.5];u=[10. -2.;0. 0.];F=[.5]
    r=transport_momentum(vertical,mo,mn,F,u)
    @test r.velocity≈[10. -2.;10/3 -2/3] rtol=2e-13
    @test sum(mn.*r.velocity;dims=1)≈sum(mo.*u;dims=1) rtol=2e-13
    @test r.temporalLoss+r.spatialLoss≈52/3 rtol=2e-12
    # Dense reference uses independent Rodrigues rotations in Cartesian space.
    lat=[-.7,-.2,.3,.8,.1,-.4];lon=[.1,1.,2.1,3.4,4.2,5.1];n=length(lat)
    from=[1,2,3,4,5,6,1,2,3];to=[2,3,4,5,6,1,4,5,6]
    F=[.03,-.02,.05,-.04,.01,.02,-.03,.01,.02]
    mo=[1.,1.4,1.2,1.8,1.6,1.1];mn=copy(mo)
    for (a,b,f) in zip(from,to,F);mn[a]-=f;mn[b]+=f;end
    rng=MersenneTwister(62);u=randn(rng,n,2);before=(copy(mo),copy(mn),copy(F),copy(u))
    g=ConnectionGeometry(lat,lon,from,to);x,e,north=xyz_basis(lat,lon)
    A=Matrix(Diagonal(repeat(mn,2)));transports=[]
    for (aa,bb,f) in zip(from,to,F)
        a,b=f>=0 ? (aa,bb) : (bb,aa);v=cross(x[a,:],x[b,:]);c=dot(x[a,:],x[b,:])
        K=[0. -v[3] v[2];v[3] 0. -v[1];-v[2] v[1] 0.]
        Q=I+K+K*K/(1+c);T=hcat(e[b,:],north[b,:])'*Q*hcat(e[a,:],north[a,:]);push!(transports,(a,b,abs(f),T))
        for k in 1:2
            A[a+(k-1)n,a+(k-1)n]+=abs(f)
            for l in 1:2;A[b+(k-1)n,a+(l-1)n]-=abs(f)*T[k,l];end
        end
    end
    expected=reshape(A\vec(mo.*u),n,2);r=transport_momentum(g,mo,mn,F,u)
    @test r.velocity≈expected rtol=2e-12
    ko=sum(mo.*u.^2)/2;kn=sum(mn.*r.velocity.^2)/2
    temporal=sum(mo.*(r.velocity-u).^2)/2
    spatial=sum(f*sum(abs2,r.velocity[b,:]-T*r.velocity[a,:])/2 for (a,b,f,T) in transports)
    @test abs(kn-ko+temporal+spatial)/ko<5e-12
    @test kn<ko
    @test maximum(sum(r.velocity.^2;dims=2))<=maximum(sum(u.^2;dims=2))*(1+1e-12)
    @test r.localRelative<5e-12&&r.energyRelative<5e-12
    @test (mo,mn,F,u)==before
    @test transport_momentum(g,mo,mo,zero(F),u).velocity==u
    reversed=ConnectionGeometry(lat,lon,to,from)
    @test transport_momentum(reversed,mo,mn,-F,u).velocity≈r.velocity rtol=2e-13
    @test_throws ArgumentError transport_momentum(g,mo,mn,F,fill(NaN,n,2))
    @test_throws ArgumentError transport_momentum(g,mo,-mn,F,u)
    @test_throws StepRejected transport_momentum(g,mo,mn.+.01,F,u)
    @test_throws StepRejected transport_momentum(g,mo,mn,F,u;maxiter=1)
    @test_throws ArgumentError ConnectionGeometry([0.,0.],[0.,pi],[1],[2])
    write_result((passed=true,denseRelative=norm(r.velocity-expected)/norm(expected),kineticLoss=ko-kn,energyIdentity=abs(kn-ko+temporal+spatial)/ko,iterations=r.iterations))
end
@testset "C6 signed covariant momentum and energy" begin;main();end
