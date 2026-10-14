include("common.jl")
include("coupled-core.jl")
using .CoupledCompatible
function main()
    c,lat,lon=small_core(ds=[.013,.187,.8]);rot=RotationMap(c,lat,lon,[.17,-.21,.31]);modal=ModalCore(c)
    m=CoupledCore(modal,CompatibleTransport(rot,lat,lon);strength=.37);rng=MersenneTwister(773)
    rows=[]
    for ratio in (1.,1.03,pi), amplitude in (0.,1e-8,1e-10,1e-12,1e-14)
        p=ratio*c.pref;j=amplitude*randn(rng,length(c.prefFace),length(c.ds));s=State(p,mass(c,p)*.012,j,0.);before=deepcopy(s)
        passed=true;message="";ledger=nothing
        try;ledger=step!(m,s,.1);catch e;passed=false;message=sprint(showerror,e);end
        @test passed
        if passed
            @test all(isfinite,s.p)&&all(isfinite,s.j)&&s.time==.1
            @test maximum(abs,s.W./mass(c,s.p).-0.012)<1e-13
            @test hasproperty(ledger,:completeEnergyAllowance)
            if hasproperty(ledger,:completeEnergyAllowance)
                @test abs(energy(m,s)-energy(m,before)+ledger.loss)<=ledger.completeEnergyAllowance
            end
        end
        push!(rows,(ratio=ratio,amplitude=amplitude,passed=passed,error=message))
    end
    write_result((passed=all(r.passed for r in rows),rows=rows))
end
@testset "C7 rest and vanishing perturbation regression" begin;main();end
