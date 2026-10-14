using JSON3, Test
include("startup-ledger.jl")
using .StartupFluxBudgets
const STARTUP_DOC="docs/evidence/earth-speedy-transport-20261013"
const STARTUP_BUILD="build/earth-speedy-transport"

function startup_analyze()
    frozen=JSON3.read(read("build/earth-speedy-moisture-monsoon/audit-coupled-mass-fixed.json",String))
    cases=Any[]
    @testset "full three-day traces reproduce frozen physics and close the attribution" begin
    for mode in ("slab","seasonal")
        input=JSON3.read(read("$STARTUP_BUILD/startup-trace-split-$mode.json",String))
        original=only(filter(c->c.mode==mode,frozen))
        @test length(input.rows)==length(original.steps)==145
        ledger=LeapfrogFluxLedger();E=0.0;P=0.0;rows=Any[]
        maxWaterDifference=0.0;maxRectangularDifference=0.0
        maxAttributionError=0.0;maxPhysicsResidualRate=0.0
        for (i,r) in enumerate(input.rows)
            advance_flux!(ledger,r.net;nominal_dt=1800.0,step_counter=i-1,robert_filter=0.1,williams_filter=0.53)
            residuals=budget_residuals(ledger,r.physicalAfter-input.initial.waterKgM2)
            E+=r.elapsed*r.evap;P+=r.elapsed*r.precip
            limit=max(0.05,0.001*(abs(E)+P))  # original gate; do not enlarge for the new time convention
            parts=Dict(string(k)=>Float64(v) for (k,v) in pairs(r.stateLedger) if string(k) ∉ ("external","diffusion_implicit"))
            parts["grid_humidity_clipping"]=r.clipping
            closure=residuals.discreteFluxResidual-sum(values(parts))
            @test r.physicalAfter ≈ original.steps[i].waterMm atol=1e-10 rtol=0
            @test residuals.rectangularResidual ≈ original.steps[i].residualWithActualDtMm atol=1e-10 rtol=0
            @test ledger.current ≈ r.stateLedger.external atol=1e-12 rtol=0
            @test ledger.rectangular ≈ r.rectangularNet atol=1e-12 rtol=0
            @test abs(closure)<1e-10
            @test abs(r.physicsBudgetResidual)<1e-14
            @test parts["implicit_humidity"] == 0.0
            @test residuals.rectangularResidual ≈ residuals.timeStaggerContribution+residuals.discreteFluxResidual atol=1e-12 rtol=0
            maxWaterDifference=max(maxWaterDifference,abs(r.physicalAfter-original.steps[i].waterMm))
            maxRectangularDifference=max(maxRectangularDifference,abs(residuals.rectangularResidual-original.steps[i].residualWithActualDtMm))
            maxAttributionError=max(maxAttributionError,abs(closure))
            maxPhysicsResidualRate=max(maxPhysicsResidualRate,abs(r.physicsBudgetResidual))
            push!(rows,(;step=i,time=String(r.afterTime),elapsedSeconds=r.elapsed,
                waterMm=r.physicalAfter,evaporationRectangularMm=E,precipitationRectangularMm=P,
                externalFluxLeapfrogMm=ledger.current,residuals...,limitMm=limit,
                rectangularPassed=abs(residuals.rectangularResidual)<=limit,
                discreteFluxPassed=abs(residuals.discreteFluxResidual)<=limit,
                numericalContributionsMm=parts,attributionClosureMm=closure))
        end
        worstRect=rows[argmax(abs(r.rectangularResidual) for r in rows)]
        worstDiscrete=rows[argmax(abs(r.discreteFluxResidual) for r in rows)]
        failures=[(;r.step,r.time,residualMm=r.discreteFluxResidual,r.limitMm) for r in rows if !r.discreteFluxPassed]
        summary=(;mode,nSteps=length(rows),maxWaterDifference,maxRectangularDifference,maxAttributionError,maxPhysicsResidualRate,
            maxAbsRectangularResidualMm=abs(worstRect.rectangularResidual),worstRectangularTime=worstRect.time,
            maxAbsDiscreteFluxResidualMm=abs(worstDiscrete.discreteFluxResidual),worstDiscreteTime=worstDiscrete.time,
            rectangularFailCount=count(r->!r.rectangularPassed,rows),discreteFailCount=length(failures),discreteFailures=failures,
            absoluteResidualReducedSteps=count(r->abs(r.discreteFluxResidual)<abs(r.rectangularResidual),rows),
            physicalTrajectoryChanged=false,final=rows[end],atFourAndHalfHours=rows[10],worstDiscrete)
        push!(cases,(;summary,rows))
        println(JSON3.write(summary))
    end
    end
    open(io->JSON3.write(io,(;gate="max(0.05 mm, 0.001*(abs(rectangular E)+rectangular P))",cases)),"$STARTUP_BUILD/startup-budget-analysis.json","w")
end
startup_analyze()
