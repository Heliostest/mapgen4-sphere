include("common.jl")
include("pressure-core.jl")
using .PressureWork
function main()
    rows=[]
    for a in (1e-300,1e-100,1e5,1e300),delta in (.0101,.02,-.0101,-.2)
        b=a*(1+delta);aa,bb=BigFloat(a),BigFloat(b)
        exact=(bb*log(bb/aa)-bb+aa)/(bb-aa);deriv=(log(bb/aa)-exact)/(bb-aa)
        s=secant(a,b,a);valueError=abs(s.value-Float64(exact));derivativeRelative=abs((s.derivative-Float64(deriv))/Float64(deriv))
        @test valueError<2e-14
        @test derivativeRelative<2e-12
        @test abs(s.value-secant(b,a,a).value)<2e-14
        push!(rows,(scale=a,delta=delta,valueError=valueError,derivativeRelative=derivativeRelative))
    end
    write_result((passed=true,rows=rows))
end
@testset "C8 divided-difference branch boundary at all scales" begin;main();end
