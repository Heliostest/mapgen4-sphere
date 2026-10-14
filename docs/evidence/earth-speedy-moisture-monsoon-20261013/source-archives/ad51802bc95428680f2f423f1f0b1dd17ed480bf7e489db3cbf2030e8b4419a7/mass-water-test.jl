using Test
include("corrections.jl")
using .BudgetCorrections
fixed=get(ENV,"MASS_IMPLEMENTATION","native")=="fixed"
fixed&&include("water-preserving-mass.jl")
@testset "dry-air correction preserves column water" begin
for (ps,q,target) in (([80000.,100000.,102000.],[.005,.012,.025],9600.),([80000.,100000.,102000.],[.005,.012,.025],10500.),([80000.,100000.,102000.],zeros(3),9900.))
    w=[.2,.5,.3];g=9.81;lp=log.(ps)
    a=fixed ? dry_mass_water_shift(lp,q,w,target,g) : mass_mode_shift(lp,q,w,target,g)
    scale=fixed ? a.humidityScale : 1.
    nextp=exp.(lp.+a.deltaLogPressure);nextq=q.*scale
    @test isapprox(sum(w.*nextp.*(1 .-nextq))/g,target;rtol=2e-15)
    @test all(isapprox.(nextp.*nextq,ps.*q;rtol=3e-15,atol=1e-12))
    @test all(isapprox.(diff(log.(nextp)),diff(lp);atol=2e-15))
    @test all(0 .<=nextq.<1)
end
end
