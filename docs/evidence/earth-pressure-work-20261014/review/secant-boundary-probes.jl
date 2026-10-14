include("../../docs/evidence/earth-pressure-work-20261014/common.jl")
include("../../docs/evidence/earth-pressure-work-20261014/pressure-core.jl")
using .PressureWork
setprecision(BigFloat,256)
rows=[]
for scale in (1e-300,1e-100,1e-4,1.,1e5,1e100,1e300),ratio in (.9899,.99,.9901,1.0099,1.01,1.0101,.1,10.),r in (1.,scale)
    a=scale;b=scale*ratio;aa=BigFloat(a);bb=BigFloat(b);rr=BigFloat(r)
    ell=(bb*log(bb/rr)-bb-aa*log(aa/rr)+aa)/(bb-aa)
    dell=(log(bb/rr)-ell)/(bb-aa)
    got=secant(a,b,r)
    er=abs((got.derivative-Float64(dell))/Float64(dell));ev=abs(got.value-Float64(ell))
    push!(rows,(a=a,b=b,reference=r,valueError=ev,derivativeRelative=er))
end
sort!(rows;by=r->r.derivativeRelative,rev=true)
println(JSON3.write((worst=rows[1:12],above2e12=count(r->r.derivativeRelative>2e-12,rows))))
write("build/c8-independent-review/secant-boundary-results.json",JSON3.write(rows))
