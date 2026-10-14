using Test, SpeedyWeather, JSON3
const SW=SpeedyWeather
implementation=get(ENV,"STARTUP_LEDGER_IMPLEMENTATION","rectangular")
if implementation=="fixed"
    include("startup-ledger.jl")
    using .StartupFluxBudgets
end

if implementation=="fixed"
@testset "two startup half clocks and constant flux" begin
    b=LeapfrogFluxLedger()
    expected=[900.0,1800.0,3600.0,5400.0,7200.0]
    for i in eachindex(expected)
        advance_flux!(b,2e-6;nominal_dt=1800.0,step_counter=i-1,robert_filter=0.1,williams_filter=0.53)
        @test b.elapsed_seconds == expected[i]
        @test b.current ≈ expected[i]*2e-6 atol=1e-15
        @test budget_residuals(b,b.current).discreteFluxResidual == 0.0
        @test abs(budget_residuals(b,b.current).timeStaggerContribution) < 1e-15
    end
end
@testset "checkpoints retain both RAW memory and startup phase" begin
    rates=[sin(i/3)*1e-5 for i in 1:40]
    full=LeapfrogFluxLedger()
    for (i,r) in enumerate(rates)
        advance_flux!(full,r;nominal_dt=1800.0,step_counter=i-1,robert_filter=0.1,williams_filter=0.53)
    end
    for cut in (1,2,3,10,39)
        b=LeapfrogFluxLedger()
        for i in 1:cut
            advance_flux!(b,rates[i];nominal_dt=1800.0,step_counter=i-1,robert_filter=0.1,williams_filter=0.53)
        end
        b=restore_ledger(JSON3.read(JSON3.write(ledger_snapshot(b))))
        for i in (cut+1):length(rates)
            advance_flux!(b,rates[i];nominal_dt=1800.0,step_counter=i-1,robert_filter=0.1,williams_filter=0.53)
        end
        @test ledger_snapshot(b) == ledger_snapshot(full)
    end
    @test_throws ArgumentError advance_flux!(full,0.;nominal_dt=1800.,step_counter=39,robert_filter=.1,williams_filter=.53)
end
end

@testset "external flux budget matches native Leapfrog/RAW update" begin
    old=[45.0];current=[45.0];rectangular=0.0
    ledger=implementation=="fixed" ? LeapfrogFluxLedger() : nothing
    rates=[2e-6,3e-6,-8e-6,-2e-6,9e-6,1e-6]
    for (i,rate) in enumerate(rates)
        counter=i-1;dt=counter==0 ? 900.0 : counter==1 ? 1800.0 : 3600.0
        elapsed=counter<=1 ? 900.0 : 1800.0
        w1=counter<=1 ? 0.0 : 0.1*0.53/2
        w2=counter<=1 ? 0.0 : 0.1*(1-0.53)/2
        reference=counter<=1 ? old : current
        SW.launch!(SW.CPU(),SW.SpectralWorkOrder,(1,),SW.leapfrog_kernel!,old,current,reference,[rate],dt,w1,w2)
        rectangular+=elapsed*rate
        flux=if implementation=="fixed"
            advance_flux!(ledger,rate;nominal_dt=1800.0,step_counter=counter,robert_filter=0.1,williams_filter=0.53)
        else
            rectangular
        end
        println(JSON3.write((;counter,atmosphericChange=current[1]-45.0,flux,residual=current[1]-45.0-flux)))
        @test current[1]-45.0 ≈ flux atol=1e-12
    end
end
