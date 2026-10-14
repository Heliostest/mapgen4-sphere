include("common.jl")
include("coupled-core.jl")
using .RotatingAcoustics
function main()
    dt=parse(Float64,get(ENV,"ROT_DT","1800"));T=parse(Float64,get(ENV,"ROT_DURATION","86400"))
    isfinite(dt)&&dt>0&&isfinite(T)&&T>0 || throw(ArgumentError("invalid time interval"))
    steps=round(Int,T/dt);steps>=6&&steps*dt==T || throw(ArgumentError("integral explicit steps required"))
    kinds=split(get(ENV,"ROT_CASES","real,constant,sharp"),',')
    !isempty(kinds)&&length(unique(kinds))==length(kinds)&&all(k->k in ("real","constant","sharp"),kinds) || throw(ArgumentError("invalid cases"))
    restartWanted=get(ENV,"ROT_RESTART","true")=="true"
    graph,initial,geo=native_inputs();n=length(initial.pressure)
    c=graph_core(graph,initial.pref,initial.ds;radius=Float64(geo.radiusM),c2=82671.64740772452)
    lat=Float64.(graph.lat);lon=Float64.(graph.lon)
    omega=[0.,0.,7.292115e-5] # explicitly fixed terrestrial rotation for this experiment
    rot=RotationMap(c,lat,lon,omega);m=RotatingCore(FCTCore(ModalCore(c)),rot)
    wind=WindMap(c,lat,lon);j=import_wind(wind,initial.pressure,initial.u,initial.v)
    velocity=reconstruct(rot,j);nlayer=length(c.ds)
    importVelocity=vcat(initial.pressure.*initial.u./initial.pref,initial.pressure.*initial.v./initial.pref)
    reconstructionError=norm(velocity-importVelocity)/norm(importVelocity)
    println(JSON3.write((preparedSeconds=m.fct.modal.preparationSeconds,cells=n,edges=length(c.prefFace),dt=dt,reconstructionError=reconstructionError)));flush(stdout)
    rebuilt=nothing
    if restartWanted
        other=graph_core(graph,initial.pref,initial.ds;radius=c.g.radius,c2=c.c2)
        rebuilt=RotatingCore(FCTCore(ModalCore(other)),RotationMap(other,lat,lon,omega))
        @test identity_hash(m)==identity_hash(rebuilt)
    end
    results=[];paths=[];name=ENV["ROT_RUN_NAME"];gravity=Float64(geo.gravityMps2)
    for kind in kinds
        q=kind=="real" ? copy(initial.water) : kind=="constant" ? fill(.012,size(initial.water)) : hcat([.02Float64.(mod.(lon.+k*.43,2pi).<pi) for k in eachindex(c.ds)]...)
        s=State(initial.pressure,mass(c,initial.pressure).*q,j,0.);first=deepcopy(s);e0=energy(m,s)
        localMax=0.;energyMax=0.;qmin=minimum(q);qmax=maximum(q);constantError=0.;minP=minimum(s.p)
        restart=nothing;restartEqual=true;resumedSteps=0;pressurePath=String[];started=time()
        for k in 1:steps
            led=step!(m,s,dt)
            localMax=max(localMax,led.localAirRelativeResidual,led.localWaterRelativeResidual,led.localDryRelativeResidual)
            energyMax=max(energyMax,abs(energy(m,s)-e0)/e0)
            qmin=min(qmin,led.qmin);qmax=max(qmax,led.qmax);minP=min(minP,minimum(s.p))
            kind=="constant"&&(constantError=max(constantError,maximum(abs,s.W./mass(c,s.p).-0.012)))
            io=IOBuffer();serialize(io,(s.p,s.j));push!(pressurePath,bytes2hex(sha256(take!(io))))
            if restart!==nothing
                step!(rebuilt,restart,dt);resumedSteps+=1
                restartEqual &= s.p==restart.p&&s.W==restart.W&&s.j==restart.j&&s.time==restart.time
            end
            if restartWanted&&k==steps-4
                checkpoint=joinpath(OUT,name*"-"*kind*"-checkpoint.bin")
                save_checkpoint(checkpoint,m,s);restart=load_checkpoint(checkpoint,rebuilt)
            end
            if k==1||k%24==0||k==steps
                println(JSON3.write((case=kind,step=k,steps=steps,seconds=time()-started,localMax=localMax,energyMax=energyMax)));flush(stdout)
            end
        end
        air=(sum(mass(c,s.p))-sum(mass(c,first.p)))/(4pi*gravity)
        water=(sum(s.W)-sum(first.W))/(4pi*gravity)
        row=(case=kind,dt=dt,steps=steps,rejections=0,elapsedSeconds=time()-started,maxLocalRelative=localMax,maxEnergyRelative=energyMax,airDriftKgM2=air,waterDriftMm=water,dryDriftKgM2=air-water,qmin=qmin,qmax=qmax,initialQmin=minimum(q),initialQmax=maximum(q),constantError=constantError,pmin=minP,restartBitwiseEqual=restartWanted ? restartEqual : nothing,resumedSteps=resumedSteps)
        push!(results,row);push!(paths,pressurePath)
        serialize(joinpath(OUT,name*"-"*kind*"-final.bin"),(identity=identity_hash(m),state=s))
        write(joinpath(OUT,name*"-partial.json"),JSON3.write(results))
        @test localMax<5e-12
        @test energyMax<1e-9
        @test abs(air)<1e-8&&abs(water)<1e-9&&abs(air-water)<1e-8
        @test qmin>=minimum(q)-1e-11&&qmax<=maximum(q)+1e-11
        @test constantError<1e-12
        @test !restartWanted||(restartEqual&&resumedSteps==4)
        bad=deepcopy(first);bad.j .*=1e6;before=deepcopy(bad)
        @test_throws StepRejected step!(m,bad,dt)
        @test bad.p==before.p&&bad.W==before.W&&bad.j==before.j&&bad.time==before.time
    end
    @test all(p->p==paths[1],paths)
    write_result((passed=true,scope="C5 fixed-reference rotating acoustic/shared-water subsystem",duration=T,dt=dt,c2=c.c2,omega=omega,results=results,reconstructionError=reconstructionError,samePressureAcrossTracers=all(p->p==paths[1],paths),fullMomentumAdvection=false,fullPhysicalCoupling=false,climateAcceptance=false))
end
@testset "C5 native rotating one-day budgets and restart" begin;main();end
