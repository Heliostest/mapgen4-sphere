include("common.jl")
include("pressure-core.jl")
using .PressureWork
function independent_energy(c,p,v)
    p=BigFloat.(p);v=BigFloat.(v);pref=BigFloat.(c.pref);a=BigFloat.(c.g.area);ds=BigFloat.(c.ds)
    h=BigFloat.(c.g.edgeLength).*BigFloat.(c.g.centerDistance)
    k=sum(h[e]*(p[c.g.from[e]]+p[c.g.to[e]])*ds[l]*v[e,l]^2/4 for e in eachindex(h),l in eachindex(ds))
    u=BigFloat(c.c2)*sum(a.*(p.*log.(p./pref)-p+pref))
    k,u
end
function main()
    c,_,_=small_core(ds=[.013,.187,.8]);m=PressureWorkCore(c);rng=MersenneTwister(7308)
    rows=[]
    for ratio in (1.,1.03,pi),delta in (0.,1e-14,-1e-10,1e-6,-.4,.8)
        a=ratio*1.17;b=a*(1+delta);r=1.17
        aa,bb,rr=BigFloat(a),BigFloat(b),BigFloat(r)
        exact=aa==bb ? log(aa/rr) : (bb*log(bb/rr)-bb-aa*log(aa/rr)+aa)/(bb-aa)
        deriv=aa==bb ? inv(2aa) : (log(bb/rr)-exact)/(bb-aa)
        s=secant(a,b,r)
        @test abs(s.value-Float64(exact))<2e-14
        @test abs(s.derivative-Float64(deriv))<2e-13
        @test abs(s.value-secant(b,a,r).value)<2e-14
        push!(rows,(ratio=ratio,delta=delta,valueError=abs(s.value-Float64(exact)),derivativeError=abs(s.derivative-Float64(deriv))))
    end
    chain=[]
    for amplitude in (1.,1e-3,1e-9)
        p0=c.pref.*(1 .+.2rand(rng,6));p1=p0.*(1 .+amplitude*.1randn(rng,6))
        v0=.3randn(rng,15,3);v1=v0+amplitude*.1randn(rng,15,3)
        e0=energies(m,p0,v0);e1=energies(m,p1,v1);k0,u0=independent_energy(c,p0,v0);k1,u1=independent_energy(c,p1,v1)
        @test abs(e0.kinetic-Float64(k0))<2e-14
        @test abs(e0.potential-Float64(u0))<2e-14
        @test abs(e1.total-Float64(k1+u1))<2e-14
        d=discrete_gradient(m,p0,p1,v0,v1)
        change=sum(c.g.area.*d.mu.*(p1-p0))+sum(m.h.*(d.flux.*(v1-v0))*c.ds)
        residual=abs(change-Float64(k1+u1-k0-u0))/Float64(k0+u0)
        @test residual<5e-14
        reverse=discrete_gradient(m,p1,p0,v1,v0)
        @test norm(reverse.mu-d.mu)<5e-14
        @test norm(reverse.flux-d.flux)<5e-14
        @test maximum(d.kappa)>1e-3
        push!(chain,residual)
    end
    v=fill(.3,15,3);p=1.4c.pref
    @test isapprox(energies(m,p,v).kinetic,1.4energies(m,c.pref,v).kinetic;rtol=1e-14)
    write_result((passed=true,scalar=rows,chainResiduals=chain))
end
@testset "C8 pressure-dependent energy and discrete chain rule" begin;main();end
