include("common.jl")
include("pressure-core.jl")
using .PressureWork
function main()
    rows=[]
    for (a,b,r) in ((1.,1e-20,1.),(1e-300,1e300,1.),(1e300,1e-300,1.),(1.,1.,1e-320),(1e-100,2e-100,1e100))
        aa,bb,rr=BigFloat(a),BigFloat(b),BigFloat(r)
        exact=aa==bb ? log(aa/rr) : (bb*log(bb/rr)-bb-aa*log(aa/rr)+aa)/(bb-aa)
        deriv=aa==bb ? inv(2aa) : (log(bb/rr)-exact)/(bb-aa)
        s=secant(a,b,r)
        @test isfinite(s.value)&&isfinite(s.derivative)
        @test isapprox(s.value,Float64(exact);rtol=2e-14,atol=5e-14)
        @test isapprox(s.derivative,Float64(deriv);rtol=2e-12,atol=1e-310)
        @test isapprox(s.value,secant(b,a,r).value;rtol=2e-14,atol=5e-14)
        push!(rows,(a=a,b=b,reference=r,value=s.value,derivative=s.derivative))
    end
    c,_,_=small_core();m=PressureWorkCore(c);p=1e-20*c.pref;v=zeros(15,2)
    expected=Float64(BigFloat(c.c2)*sum(BigFloat.(c.g.area).*(BigFloat.(p).*log.(BigFloat.(p)./BigFloat.(c.pref))-BigFloat.(p)+BigFloat.(c.pref))))
    @test isfinite(energies(m,p,v).total)
    @test isapprox(energies(m,p,v).potential,expected;rtol=2e-14)
    for invalid in (0.,-1.,Inf,NaN);@test_throws ArgumentError secant(invalid,1.,1.);end
    write_result((passed=true,rows=rows,tinyPressureEnergy=energies(m,p,v).total))
end
@testset "C8 positive extreme pressure regression" begin;main();end
