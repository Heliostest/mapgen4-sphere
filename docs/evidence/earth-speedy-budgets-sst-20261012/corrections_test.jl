using Test, Dates
include("corrections.jl")
using .BudgetCorrections
@testset "closed inventories and calendar forcing" begin
@testset "dry air mass, not arithmetic mean log pressure" begin
    w=[.4,.6];q=[.02,.01];p=log.([80000.0,100000.0]);g=10.0
    target=sum(w.*exp.(p).*(1 .-q))/g
    disturbed=p.+[.1,-.1*.4/.6]
    @test sum(w.*disturbed)≈sum(w.*p)
    a=mass_mode_shift(disturbed,q,w,target,g)
    @test abs(a.rawDryKgM2-target)>1
    @test sum(w.*exp.(disturbed.+a.deltaLogPressure).*(1 .-q))/g≈target atol=1e-9
    @test (disturbed[2]+a.deltaLogPressure)-(disturbed[1]+a.deltaLogPressure)≈disturbed[2]-disturbed[1]
end
@testset "soil drainage and clipping account for every removed or added kg" begin
    soil=reshape([1.5,-.2,1.2,-.1],2,2,1);before=copy(soil)
    runoff=zeros(2);deep=zeros(2);source=zeros(2);f1=.06;f2=.6
    audited_filter!(soil,runoff,deep,source,[1.0,.5],f1,f2,.25)
    for i in 1:2
        old=before[i,1,1]*f1+before[i,2,1]*f2
        new=soil[i,1,1]*f1+soil[i,2,1]*f2
        @test new+runoff[i]+deep[i]-source[i]≈old atol=1e-15
    end
    @test runoff[1]≈.0225
    @test deep[1]≈.1275
    @test source[2]≈.072
end
@testset "monthly mean SST anchored at calendar centres, including leap February" begin
    a=monthly_bracket(DateTime(2001,1,16,12))
    @test a.leftMonth==1&&a.rightMonth==2&&a.weight==0
    b=monthly_bracket(DateTime(2001,1,1))
    @test b.leftMonth==12&&b.rightMonth==1
    @test b.weight≈.5
    c=monthly_bracket(DateTime(2004,2,15,12))
    @test c.leftMonth==2&&c.rightMonth==3&&c.weight==0
end
end
