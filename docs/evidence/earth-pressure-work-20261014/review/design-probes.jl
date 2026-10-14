include("../../docs/evidence/earth-pressure-work-20261014/common.jl")
include("../../docs/evidence/earth-pressure-work-20261014/pressure-core.jl")
using .PressureWork
for (a,b,r) in ((1.,1e-20,1.),(1e-20,1.,1.),(1e-300,1e300,1.),(1.,1.,1e-320))
    aa,bb,rr=BigFloat(a),BigFloat(b),BigFloat(r)
    exact=aa==bb ? log(aa/rr) : (bb*log(bb/rr)-bb-aa*log(aa/rr)+aa)/(bb-aa)
    deriv=aa==bb ? inv(2aa) : (log(bb/rr)-exact)/(bb-aa)
    println((a=a,b=b,r=r,actual=secant(a,b,r),exact=Float64(exact),derivative=Float64(deriv)))
end
c,_,_=small_core();m=PressureWorkCore(c)
println((low_pressure_energy=energies(m,1e-20*c.pref,zeros(15,2)),expected=Float64(BigFloat(c.c2)*sum(BigFloat.(c.g.area).*BigFloat.(c.pref)))))
