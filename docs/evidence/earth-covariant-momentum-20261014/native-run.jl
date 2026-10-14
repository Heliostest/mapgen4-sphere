include("common.jl")
include("advection-core.jl")
using .NonlinearAdvection
function main()
    dt=parse(Float64,get(ENV,"MOM_DT","1800"));T=parse(Float64,get(ENV,"MOM_DURATION","21600"))
    isfinite(dt)&&dt>0&&isfinite(T)&&T>0 || throw(ArgumentError("invalid time interval"))
    steps=round(Int,T/dt);steps>=6&&steps*dt==T || throw(ArgumentError("explicit integral steps required"))
    kinds=split(get(ENV,"MOM_CASES","real,constant,sharp"),',')
    !isempty(kinds)&&length(unique(kinds))==length(kinds)&&all(k->k in ("real","constant","sharp"),kinds) || throw(ArgumentError("invalid cases"))
    restartWanted=get(ENV,"MOM_RESTART","true")=="true"
    graph,initial,geo=native_inputs();n=length(initial.pressure)
    c=graph_core(graph,initial.pref,initial.ds;radius=Float64(geo.radiusM))
    lat=Float64.(graph.lat);lon=Float64.(graph.lon);m=AdvectionCore(c,lat,lon)
    velocity=hcat(vec(initial.u),vec(initial.v));rebuilt=nothing
    if restartWanted
        rebuilt=AdvectionCore(graph_core(graph,initial.pref,initial.ds;radius=c.g.radius),lat,lon)
        @test identity_hash(m)==identity_hash(rebuilt)
    end
    results=[];paths=[];name=ENV["MOM_RUN_NAME"];gravity=Float64(geo.gravityMps2)
    for kind in kinds
        q=kind=="real" ? copy(initial.water) : kind=="constant" ? fill(.012,size(initial.water)) : hcat([.02Float64.(mod.(lon.+k*.43,2pi).<pi) for k in eachindex(c.ds)]...)
        s=AdvectiveState(initial.pressure,mass(c,initial.pressure).*q,velocity,0.);first=deepcopy(s);e0=energy(m,s);previousEnergy=e0
        localMax=0.;energyMax=0.;momentumMax=0.;maxIterations=0;totalLoss=0.;maxIncrease=0.
        qmin=minimum(q);qmax=maximum(q);constantError=0.;minP=minimum(s.p)
        restart=nothing;restartEqual=true;resumedSteps=0;pressurePath=String[];started=time()
        for k in 1:steps
            led=step!(m,s,dt)
            localMax=max(localMax,led.localAirRelativeResidual,led.localWaterRelativeResidual,led.localDryRelativeResidual)
            energyMax=max(energyMax,led.energyRelative);momentumMax=max(momentumMax,led.momentumRelative);maxIterations=max(maxIterations,led.momentumIterations)
            currentEnergy=energy(m,s);maxIncrease=max(maxIncrease,(currentEnergy-previousEnergy)/e0);previousEnergy=currentEnergy
            totalLoss+=led.temporalLoss+led.spatialLoss
            qmin=min(qmin,led.qmin);qmax=max(qmax,led.qmax);minP=min(minP,minimum(s.p))
            kind=="constant"&&(constantError=max(constantError,maximum(abs,s.W./mass(c,s.p).-0.012)))
            io=IOBuffer();serialize(io,(s.p,s.velocity));push!(pressurePath,bytes2hex(sha256(take!(io))))
            if restart!==nothing
                step!(rebuilt,restart,dt);resumedSteps+=1
                restartEqual &= s.p==restart.p&&s.W==restart.W&&s.velocity==restart.velocity&&s.time==restart.time
            end
            if restartWanted&&k==steps-4
                checkpoint=joinpath(OUT,name*"-"*kind*"-checkpoint.bin")
                save_checkpoint(checkpoint,m,s);restart=load_checkpoint(checkpoint,rebuilt)
            end
            if k==1||k%24==0||k==steps
                println(JSON3.write((case=kind,step=k,steps=steps,seconds=time()-started,localMax=localMax,energyMax=energyMax)));flush(stdout)
            end
        end
        air=(sum(mass(c,s.p))-sum(mass(c,first.p)))/(4pi*gravity);water=(sum(s.W)-sum(first.W))/(4pi*gravity)
        row=(case=kind,dt=dt,steps=steps,rejections=0,elapsedSeconds=time()-started,maxLocalRelative=localMax,maxMomentumRelative=momentumMax,maxEnergyRelative=energyMax,
            maxEnergyIncrease=maxIncrease,energyLossFraction=(e0-energy(m,s))/e0,accumulatedEnergyIdentity=abs(energy(m,s)-e0+totalLoss)/e0,maxMomentumIterations=maxIterations,
            airDriftKgM2=air,waterDriftMm=water,dryDriftKgM2=air-water,qmin=qmin,qmax=qmax,initialQmin=minimum(q),initialQmax=maximum(q),constantError=constantError,pmin=minP,
            restartBitwiseEqual=restartWanted ? restartEqual : nothing,resumedSteps=resumedSteps)
        push!(results,row);push!(paths,pressurePath)
        serialize(joinpath(OUT,name*"-"*kind*"-final.bin"),(identity=identity_hash(m),state=s))
        write(joinpath(OUT,name*"-partial.json"),JSON3.write(results))
        @test localMax<5e-12&&momentumMax<5e-12&&energyMax<5e-12
        @test maxIncrease<1e-11&&row.accumulatedEnergyIdentity<5e-12
        @test abs(air)<1e-8&&abs(water)<1e-9&&abs(air-water)<1e-8
        @test qmin>=minimum(q)-1e-11&&qmax<=maximum(q)+1e-11
        @test constantError<1e-12
        @test !restartWanted||(restartEqual&&resumedSteps==4)
        bad=deepcopy(first);bad.velocity.*=1e6;before=deepcopy(bad)
        @test_throws StepRejected step!(m,bad,dt)
        @test bad.p==before.p&&bad.W==before.W&&bad.velocity==before.velocity&&bad.time==before.time
    end
    @test all(p->p==paths[1],paths)
    write_result((passed=true,scope="C6 isolated nonlinear pressureless self-advection",duration=T,dt=dt,results=results,
        sameDynamicsAcrossTracers=all(p->p==paths[1],paths),c5Feedback=false,fullPhysicalCoupling=false,climateAcceptance=false))
end
@testset "C6 native nonlinear six-hour budgets and restart" begin;main();end
