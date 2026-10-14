include("common.jl")
include("pressure-core.jl")
using .PressureWork
bits(a,b)=reinterpret(UInt64,vec(a))==reinterpret(UInt64,vec(b))
same(a,b)=bits(a.p,b.p)&&bits(a.W,b.W)&&bits(a.v,b.v)&&reinterpret(UInt64,a.time)==reinterpret(UInt64,b.time)
function main()
    dt=parse(Float64,get(ENV,"PW_DT","1800"));T=parse(Float64,get(ENV,"PW_DURATION","21600"))
    isfinite(dt)&&dt>0&&isfinite(T)&&T>0||throw(ArgumentError("invalid time interval"))
    steps=round(Int,T/dt);steps>=6&&steps*dt==T||throw(ArgumentError("explicit integral steps required"))
    kinds=split(get(ENV,"PW_CASES","real,constant,sharp"),',');restartWanted=get(ENV,"PW_RESTART","true")=="true"
    !isempty(kinds)&&length(unique(kinds))==length(kinds)&&all(k->k in ("real","constant","sharp"),kinds)||throw(ArgumentError("invalid cases"))
    graph,initial,geo=native_inputs();c=graph_core(graph,initial.pref,initial.ds;radius=Float64(geo.radiusM),c2=82671.64740772452)
    lat=Float64.(graph.lat);lon=Float64.(graph.lon);m=PressureWorkCore(c);wind=WindMap(c,lat,lon)
    j=import_wind(wind,initial.pressure,initial.u,initial.v);v=j./(m.S*initial.pressure/2)
    importRoundtrip=norm((m.S*initial.pressure/2).*v-j)/norm(j);@test importRoundtrip<3e-16
    println(JSON3.write((cells=length(c.pref),edges=length(c.prefFace),dt=dt,importRoundtrip=importRoundtrip)));flush(stdout)
    rebuilt=restartWanted ? PressureWorkCore(graph_core(graph,initial.pref,initial.ds;radius=c.g.radius,c2=c.c2)) : nothing
    results=[];paths=[];name=ENV["PW_RUN_NAME"];gravity=Float64(geo.gravityMps2)
    for kind in kinds
        q=kind=="real" ? copy(initial.water) : kind=="constant" ? fill(.012,size(initial.water)) : hcat([.02Float64.(mod.(lon.+k*.43,2pi).<pi) for k in eachindex(c.ds)]...)
        s=BarotropicState(copy(initial.pressure),mass(m,initial.pressure).*q,copy(v),0.);first=deepcopy(s);e0=energies(m,s.p,s.v)
        localMax=0.;balanceMax=0.;equationMax=0.;nonlinearMax=0.;maxIterations=0;totalIterations=0;backtracks=0;maxExchange=0.
        qmin=minimum(q);qmax=maximum(q);constantError=0.;minP=minimum(s.p);restart=nothing;restartEqual=true;resumedSteps=0;pressurePath=String[];started=time()
        for k in 1:steps
            led=step!(m,s,dt);current=energies(m,s.p,s.v)
            localMax=max(localMax,led.localAirRelativeResidual,led.localWaterRelativeResidual,led.localDryRelativeResidual)
            balanceMax=max(balanceMax,abs(current.total-e0.total)/e0.total);equationMax=max(equationMax,led.equationP,led.equationV);nonlinearMax=max(nonlinearMax,led.residual)
            maxExchange=max(maxExchange,abs(current.kinetic-e0.kinetic)/e0.total);maxIterations=max(maxIterations,led.iterations);totalIterations+=led.iterations;backtracks+=led.backtracks
            qmin=min(qmin,led.qmin);qmax=max(qmax,led.qmax);minP=min(minP,minimum(s.p))
            kind=="constant"&&(constantError=max(constantError,maximum(abs,s.W./mass(m,s.p).- .012)))
            io=IOBuffer();serialize(io,(s.p,s.v));push!(pressurePath,bytes2hex(sha256(take!(io))))
            if restart!==nothing;step!(rebuilt,restart,dt);resumedSteps+=1;restartEqual &= same(s,restart);end
            if restartWanted&&k==steps-4
                checkpoint=joinpath(OUT,name*"-"*kind*"-checkpoint.bin");save_checkpoint(checkpoint,m,s);restart=load_checkpoint(checkpoint,rebuilt)
            end
            if k==1||k%24==0||k==steps
                println(JSON3.write((case=kind,step=k,steps=steps,seconds=time()-started,localMax=localMax,energyBalance=balanceMax,iterations=led.iterations)));flush(stdout)
            end
        end
        air=(sum(mass(m,s.p))-sum(mass(m,first.p)))/(4pi*gravity);water=(sum(s.W)-sum(first.W))/(4pi*gravity)
        row=(case=kind,dt=dt,steps=steps,rejections=0,elapsedSeconds=time()-started,maxLocalRelative=localMax,maxEquationRelative=equationMax,maxNonlinearResidual=nonlinearMax,
            accumulatedEnergyDrift=balanceMax,maxEnergyExchangeFraction=maxExchange,maxIterations=maxIterations,totalIterations=totalIterations,backtracks=backtracks,
            airDriftKgM2=air,waterDriftMm=water,dryDriftKgM2=air-water,qmin=qmin,qmax=qmax,initialQmin=minimum(q),initialQmax=maximum(q),constantError=constantError,pmin=minP,
            finalPressureRMSChangePa=sqrt(sum(c.g.area.*(s.p-first.p).^2)/sum(c.g.area)),restartBitwiseEqual=restartWanted ? restartEqual : nothing,resumedSteps=resumedSteps)
        push!(results,row);push!(paths,pressurePath);serialize(joinpath(OUT,name*"-"*kind*"-final.bin"),(identity=identity_hash(m),state=s));write(joinpath(OUT,name*"-partial.json"),JSON3.write(results))
        @test localMax<5e-12&&equationMax<5e-12&&nonlinearMax<=2e-14
        @test balanceMax<1e-9&&maxExchange>1e-6
        @test abs(air)<1e-8&&abs(water)<1e-9&&abs(air-water)<1e-8
        @test qmin>=minimum(q)-1e-11&&qmax<=maximum(q)+1e-11
        @test constantError<1e-12&&minP>0
        @test !restartWanted||(restartEqual&&resumedSteps==4)
        bad=deepcopy(first);before=deepcopy(bad)
        @test_throws StepRejected step!(m,bad,dt;maxiter=1)
        @test same(bad,before)
    end
    @test all(p->p==paths[1],paths)
    write_result((passed=true,scope="C8 barotropic Bernoulli pressure-work subsystem with actual-pressure kinetic metric",duration=T,dt=dt,c2=c.c2,importRoundtrip=importRoundtrip,
        results=results,sameDynamicsAcrossTracers=all(p->p==paths[1],paths),coriolis=false,vorticalMomentumTransport=false,fullThermodynamics=false,climateAcceptance=false))
end
@testset "C8 native pressure work six hours" begin;main();end
