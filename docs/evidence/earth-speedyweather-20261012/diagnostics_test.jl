using Test
include("diagnostics.jl")
using .ExperimentDiagnostics
@testset "native pressure/sigma water inventory" begin
    q=[.01 .02;.02 .04];p=[100000.0,50000.0]
    @test column_water(q,p,[.25,.75],10.0)≈[175.0,175.0]
    @test weighted_mean([2.0,10.0],[.75,.25])≈4.0
end
@testset "slab heat includes its actual freezing adjustment without inventing ice mass" begin
    before=[280.0,275.0];flux=[10.0,-5.0];dt=3600.0;C=1e6
    after=before.+flux.*dt./C
    a=ocean_heat_ledger(before,after,flux,dt,C,271.35,[.5,.5],[0.0,.5])
    @test a!==nothing
    if a!==nothing
        @test abs(a.residualJm2)<1e-7
        @test a.freezingAdjustmentJm2==0
    end
    b=ocean_heat_ledger([271.36],[271.35],[-10.0],10000.0,C,271.35,[1.0],[0.0])
    @test b!==nothing
    if b!==nothing
        @test b.freezingAdjustmentJm2≈90000.0 atol=1e-6
        @test abs(b.residualJm2)<1e-6
    end
end
