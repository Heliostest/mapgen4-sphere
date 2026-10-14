include("common.jl")
include("../earth-rotating-sigma-20261014/vector-core.jl")
using .VectorInvariant
bits(a,b)=reinterpret(UInt64,vec(a))==reinterpret(UInt64,vec(b))
same(a,b)=bits(a.p,b.p)&&bits(a.W,b.W)&&bits(a.v,b.v)&&reinterpret(UInt64,a.time)==reinterpret(UInt64,b.time)
function main()
    dt=parse(Float64,get(ENV,"VC_DT","1800"));T=21600.;steps=round(Int,T/dt)
    isfinite(dt)&&dt>0&&steps>=6&&steps*dt==T||throw(ArgumentError("explicit integral timesteps required"))
    kinds=split(get(ENV,"VC_CASES","real,constant,sharp"),',');restartWanted=get(ENV,"VC_RESTART","true")=="true"
    !isempty(kinds)&&length(unique(kinds))==length(kinds)&&all(k->k in ("real","constant","sharp"),kinds)||throw(ArgumentError("invalid cases"))
    graph,initial,geo=native_inputs();c=graph_core(graph,initial.pref,initial.ds;radius=Float64(geo.radiusM),c2=82671.64740772452)
    lat=Float64.(graph.lat);lon=Float64.(graph.lon);pw=PressureWorkCore(c);omega=[0.,0.,7.292115e-5]
    m=VectorCore(pw,lat,lon,omega);wind=WindMap(c,lat,lon)
    j=import_wind(wind,initial.pressure,initial.u,initial.v);v=j./(pw.S*initial.pressure/2)
    roundtrip=norm((pw.S*initial.pressure/2).*v-j)/norm(j);@test roundtrip<3e-16
    original=neutral_tendency(m,initial.pressure,v)
    componentRMS=Dict(string(key)=>sqrt(sum((pw.h.*(pw.S*initial.pressure/2)).*getproperty(original,key).^2 .*transpose(c.ds))/sum(pw.h.*(pw.S*initial.pressure/2))) for key in (:rotation,:vorticity,:layerGradient,:vertical))
    rebuilt=restartWanted ? VectorCore(PressureWorkCore(graph_core(graph,initial.pref,initial.ds;radius=c.g.radius,c2=c.c2)),lat,lon,omega) : nothing
    oldGraph=jsonfile(joinpath(C3,"c3-spatial-near-audit-v1-native-graph.json"));oldModel=VectorCore(PressureWorkCore(graph_core(oldGraph,initial.pref,initial.ds;radius=c.g.radius,c2=c.c2)),lat,lon,omega)
    @test identity_hash(oldModel)!=identity_hash(m)
    results=[];paths=[];name=ENV["VC_RUN_NAME"];gravity=Float64(geo.gravityMps2)
    for kind in kinds
        q=kind=="real" ? copy(initial.water) : kind=="constant" ? fill(.012,size(initial.water)) : hcat([.02Float64.(mod.(lon.+k*.43,2pi).<pi) for k in eachindex(c.ds)]...)
        s=BarotropicState(copy(initial.pressure),mass(m,initial.pressure).*q,copy(v),0.);first=deepcopy(s);e0=energy(m,s)
        localMax=0.;equationMax=0.;nonlinearMax=0.;balanceMax=0.;maxNeutralEnergy=0.;minP=minimum(s.p)
        qmin=minimum(q);qmax=maximum(q);constantError=0.;restart=nothing;restartEqual=true;resumedSteps=0;path=String[];trace=[];started=time()
        for k in 1:steps
            led=step!(m,s,dt)
            push!(trace,merge((step=k,time=s.time),led))
            localMax=max(localMax,led.localAirRelativeResidual,led.localWaterRelativeResidual,led.localDryRelativeResidual)
            equationMax=max(equationMax,led.firstEquation,led.lastEquation,led.pressureEquation)
            nonlinearMax=max(nonlinearMax,led.pressureResidual);maxNeutralEnergy=max(maxNeutralEnergy,led.firstEnergy,led.lastEnergy)
            balanceMax=max(balanceMax,abs(energy(m,s)-e0)/e0);minP=min(minP,minimum(s.p));qmin=min(qmin,led.qmin);qmax=max(qmax,led.qmax)
            kind=="constant"&&(constantError=max(constantError,maximum(abs,s.W./mass(m,s.p).- .012)))
            io=IOBuffer();serialize(io,(s.p,s.v));push!(path,bytes2hex(sha256(take!(io))))
            if restart!==nothing;step!(rebuilt,restart,dt);resumedSteps+=1;restartEqual &= same(s,restart);end
            if restartWanted&&k==steps-4
                checkpoint=joinpath(OUT,name*"-"*kind*"-checkpoint.bin");save_checkpoint(checkpoint,m,s);restart=load_checkpoint(checkpoint,rebuilt)
                @test_throws ArgumentError load_checkpoint(checkpoint,oldModel)
            end
            if k==1||k%24==0||k==steps
                println(JSON3.write((case=kind,step=k,steps=steps,seconds=time()-started,localMax=localMax,energyDrift=balanceMax,iterations=[led.firstIterations,led.pressureIterations,led.lastIterations])));flush(stdout)
            end
        end
        air=(sum(mass(m,s.p))-sum(mass(m,first.p)))/(4pi*gravity);water=(sum(s.W)-sum(first.W))/(4pi*gravity)
        row=(case=kind,dt=dt,steps=steps,rejections=0,elapsedSeconds=time()-started,maxLocalRelative=localMax,maxEquationRelative=equationMax,maxPressureResidual=nonlinearMax,
            maxNeutralEnergyRelative=maxNeutralEnergy,accumulatedEnergyDrift=balanceMax,pmin=minP,airDriftKgM2=air,waterDriftMm=water,dryDriftKgM2=air-water,
            qmin=qmin,qmax=qmax,initialQmin=minimum(q),initialQmax=maximum(q),constantError=constantError,
            finalPressureRMSChangePa=sqrt(sum(c.g.area.*(s.p-first.p).^2)/sum(c.g.area)),finalVelocityChangeRelative=norm(s.v-first.v)/norm(first.v),
            layerShearChangeRelative=norm((s.v[:,1]-s.v[:,end])-(first.v[:,1]-first.v[:,end]))/norm(first.v),
            restartBitwiseEqual=restartWanted ? restartEqual : nothing,resumedSteps=resumedSteps,
            maxNeutralIterations=maximum(max(r.firstIterations,r.lastIterations) for r in trace),totalNeutralIterations=sum(r.firstIterations+r.lastIterations for r in trace),
            maxPressureIterations=maximum(r.pressureIterations for r in trace),totalPressureIterations=sum(r.pressureIterations for r in trace),pressureBacktracks=sum(r.pressureBacktracks for r in trace))
        push!(results,row);push!(paths,path)
        serialize(joinpath(OUT,name*"-"*kind*"-final.bin"),(identity=identity_hash(m),state=s))
        write(joinpath(OUT,name*"-"*kind*"-trace.json"),JSON3.write(trace));write(joinpath(OUT,name*"-partial.json"),JSON3.write(results))
        @test localMax<5e-12&&equationMax<5e-12&&nonlinearMax<=2e-14
        @test balanceMax<1e-9&&maxNeutralEnergy<1e-10
        @test abs(air)<1e-8&&abs(water)<1e-9&&abs(air-water)<1e-8
        @test qmin>=minimum(q)-1e-11&&qmax<=maximum(q)+1e-11&&constantError<1e-12
        @test minP>0&&row.finalPressureRMSChangePa>1e-6&&row.layerShearChangeRelative>1e-6
        @test !restartWanted||(restartEqual&&resumedSteps==4)
        @test length(trace)==steps&&all(r->r.step*dt==r.time&&r.firstIterations<=400&&r.lastIterations<=400&&r.pressureIterations<=30,trace)
        bad=deepcopy(first);before=deepcopy(bad);@test_throws StepRejected step!(m,bad,dt;maxiter=1);@test same(bad,before)
    end
    @test all(p->p==paths[1],paths)
    write_result((passed=true,scope="C10 rotating barotropic sigma horizontal momentum",duration=T,dt=dt,c2=c.c2,omega=omega,importRoundtrip=roundtrip,
        initialComponentRMS=componentRMS,results=results,sameDynamicsAcrossTracers=all(p->p==paths[1],paths),coriolis=true,vorticalMomentumTransport=true,
        verticalHorizontalMomentumAdvection=true,prognosticVerticalVelocity=false,fullThermodynamics=false,climateAcceptance=false))
end
@testset "C10 native rotating sigma six hours" begin;main();end
