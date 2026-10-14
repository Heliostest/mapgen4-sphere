include("common.jl")
include("coupled-core.jl")
using .CoupledCompatible
bitsequal(a,b)=reinterpret(UInt64,vec(a))==reinterpret(UInt64,vec(b))
same(a,b)=bitsequal(a.p,b.p)&&bitsequal(a.W,b.W)&&bitsequal(a.j,b.j)&&reinterpret(UInt64,a.time)==reinterpret(UInt64,b.time)
function main()
    dt=parse(Float64,get(ENV,"CMP_DT","1800"));T=parse(Float64,get(ENV,"CMP_DURATION","21600"))
    isfinite(dt)&&dt>0&&isfinite(T)&&T>0||throw(ArgumentError("invalid time interval"))
    steps=round(Int,T/dt);steps>=6&&steps*dt==T||throw(ArgumentError("explicit integral steps required"))
    kinds=split(get(ENV,"CMP_CASES","real,constant,sharp"),',')
    !isempty(kinds)&&length(unique(kinds))==length(kinds)&&all(k->k in ("real","constant","sharp"),kinds)||throw(ArgumentError("invalid cases"))
    restartWanted=get(ENV,"CMP_RESTART","true")=="true"
    graph,initial,geo=native_inputs();c=graph_core(graph,initial.pref,initial.ds;radius=Float64(geo.radiusM),c2=82671.64740772452)
    lat=Float64.(graph.lat);lon=Float64.(graph.lon);omega=[0.,0.,7.292115e-5]
    rot=RotationMap(c,lat,lon,omega);modal=ModalCore(c);m=CoupledCore(modal,CompatibleTransport(rot,lat,lon))
    linear=RotatingCore(FCTCore(modal),rot);wind=WindMap(c,lat,lon);j=import_wind(wind,initial.pressure,initial.u,initial.v)
    println(JSON3.write((preparedSeconds=modal.preparationSeconds,cells=length(c.pref),edges=length(c.prefFace),dt=dt,strength=m.strength)));flush(stdout)
    rebuilt=nothing
    if restartWanted
        other=graph_core(graph,initial.pref,initial.ds;radius=c.g.radius,c2=c.c2)
        rebuilt=CoupledCore(ModalCore(other),CompatibleTransport(RotationMap(other,lat,lon,omega),lat,lon))
        @test identity_hash(m)==identity_hash(rebuilt)
    end
    results=[];paths=[];name=ENV["CMP_RUN_NAME"];gravity=Float64(geo.gravityMps2);baselineEffect=nothing
    for kind in kinds
        q=kind=="real" ? copy(initial.water) : kind=="constant" ? fill(.012,size(initial.water)) : hcat([.02Float64.(mod.(lon.+k*.43,2pi).<pi) for k in eachindex(c.ds)]...)
        s=State(initial.pressure,mass(c,initial.pressure).*q,j,0.);first=deepcopy(s);e0=energy(m,s);oldEnergy=e0
        baseline=restartWanted&&kind=="real" ? deepcopy(s) : nothing
        localMax=0.;energyMax=0.;equationMax=0.;totalLoss=0.;balanceMax=0.;maxIncrease=0.;maxIterations=0;certificateChecks=0;certifiedMin=Inf
        qmin=minimum(q);qmax=maximum(q);constantError=0.;minP=minimum(s.p);restart=nothing;restartEqual=true;resumedSteps=0;pressurePath=String[];started=time()
        for k in 1:steps
            led=step!(m,s,dt);current=energy(m,s);totalLoss+=led.loss
            localMax=max(localMax,led.localAirRelativeResidual,led.localWaterRelativeResidual,led.localDryRelativeResidual)
            energyMax=max(energyMax,led.energyRelative);equationMax=max(equationMax,led.equationRelative)
            balanceMax=max(balanceMax,abs(current-e0+totalLoss)/e0);maxIncrease=max(maxIncrease,(current-oldEnergy)/e0);oldEnergy=current
            maxIterations=max(maxIterations,led.iterations);certificateChecks+=led.positivityChecks;certifiedMin=min(certifiedMin,led.minimumCertifiedRatio)
            qmin=min(qmin,led.qmin);qmax=max(qmax,led.qmax);minP=min(minP,minimum(s.p))
            kind=="constant"&&(constantError=max(constantError,maximum(abs,s.W./mass(c,s.p).-0.012)))
            io=IOBuffer();serialize(io,(s.p,s.j));push!(pressurePath,bytes2hex(sha256(take!(io))))
            baseline!==nothing&&step!(linear,baseline,dt)
            if restart!==nothing;step!(rebuilt,restart,dt);resumedSteps+=1;restartEqual &= same(s,restart);end
            if restartWanted&&k==steps-4
                checkpoint=joinpath(OUT,name*"-"*kind*"-checkpoint.bin");save_checkpoint(checkpoint,m,s);restart=load_checkpoint(checkpoint,rebuilt)
            end
            if k==1||k%24==0||k==steps
                println(JSON3.write((case=kind,step=k,steps=steps,seconds=time()-started,localMax=localMax,energyBalance=balanceMax)));flush(stdout)
            end
        end
        air=(sum(mass(c,s.p))-sum(mass(c,first.p)))/(4pi*gravity);water=(sum(s.W)-sum(first.W))/(4pi*gravity)
        row=(case=kind,dt=dt,steps=steps,rejections=0,elapsedSeconds=time()-started,maxLocalRelative=localMax,maxTransportEquation=equationMax,maxTransportEnergy=energyMax,
            accumulatedEnergyBalance=balanceMax,maxEnergyIncrease=maxIncrease,energyLossFraction=totalLoss/e0,maxIterations=maxIterations,
            positivityChecks=certificateChecks,minimumCertifiedRatio=certifiedMin,airDriftKgM2=air,waterDriftMm=water,dryDriftKgM2=air-water,
            qmin=qmin,qmax=qmax,initialQmin=minimum(q),initialQmax=maximum(q),constantError=constantError,pmin=minP,restartBitwiseEqual=restartWanted ? restartEqual : nothing,resumedSteps=resumedSteps)
        push!(results,row);push!(paths,pressurePath)
        serialize(joinpath(OUT,name*"-"*kind*"-final.bin"),(identity=identity_hash(m),state=s));write(joinpath(OUT,name*"-partial.json"),JSON3.write(results))
        @test localMax<5e-12&&equationMax<5e-12&&energyMax<5e-12
        @test balanceMax<1e-9&&maxIncrease<1e-11&&totalLoss>0
        @test certifiedMin>0&&certificateChecks>=steps
        @test abs(air)<1e-8&&abs(water)<1e-9&&abs(air-water)<1e-8
        @test qmin>=minimum(q)-1e-11&&qmax<=maximum(q)+1e-11
        @test constantError<1e-12
        @test !restartWanted||(restartEqual&&resumedSteps==4)
        bad=deepcopy(first);bad.j.*=1e6;before=deepcopy(bad)
        @test_throws StepRejected step!(m,bad,dt)
        @test same(bad,before)
        if baseline!==nothing
            H=(c.g.edgeLength.*c.g.centerDistance./c.prefFace)*transpose(c.ds)
            baselineEffect=(pressureRMSPa=sqrt(sum(c.g.area.*(s.p-baseline.p).^2)/sum(c.g.area)),relativeEdgeMomentum=sqrt(sum(H.*(s.j-baseline.j).^2)/sum(H.*baseline.j.^2)))
            @test baselineEffect.pressureRMSPa>1e-6&&baselineEffect.relativeEdgeMomentum>1e-8
            serialize(joinpath(OUT,name*"-c5-baseline.bin"),baseline)
        end
    end
    @test all(p->p==paths[1],paths)
    write_result((passed=true,scope="C7 fixed-reference nonlinear split-form acoustic/Coriolis/shared-water",duration=T,dt=dt,strength=m.strength,c2=c.c2,omega=omega,results=results,
        sameDynamicsAcrossTracers=all(p->p==paths[1],paths),baselineEffect=baselineEffect,fullPhysicalMomentum=false,fullThermodynamics=false,climateAcceptance=false))
end
@testset "C7 native compatible coupled six hours" begin;main();end
