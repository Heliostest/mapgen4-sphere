include("common.jl")
include("wave-core.jl")
include("wave-cases.jl")
function main()
    rows=[]
    settings=[(nr=24,model=m,variable=v,nper=64) for m in ("c9","c10") for v in (false,true)]
    push!(settings,(nr=48,model="c10",variable=false,nper=128))
    for setting in settings
        nr=setting.nr;graph=setting.model=="c9" ? jsonfile(joinpath(C4,"c4-graphs-v1-$(nr)-graph.json")) : candidate_graph(nr)
        x,_,_=xyz_basis(Float64.(graph.lat),Float64.(graph.lon));pref=setting.variable ? 1 .+.15x[:,1] : ones(size(x,1));c=graph_core(graph,pref,[.2,.3,.5]);pw=PressureWorkCore(c);m=VectorCore(pw,graph.lat,graph.lon,zeros(3))
        w=wave_fields(c,x,3,AXES[1],"traveling");dt=w.period/setting.nper;solver=WaveStepper(c,dt);rr=copy(w.f);vv=copy(w.v)
        for _ in 1:setting.nper;rr,vv=wave_step(solver,rr,vv);end
        errors=[]
        for amplitude in (1e-3,1e-4)
            p=pref.*(1 .+amplitude*w.f);v=repeat(amplitude*w.v,1,3);s=BarotropicState(p,.012mass(c,p),v,0.);trace=[];e0=energy(m,s)
            for k in 1:setting.nper
                ledger=step!(m,s,dt);push!(trace,merge((step=k,time=s.time),ledger))
            end
            r=(s.p./pref.-1)/amplitude;v=s.v[:,1]/amplitude;err=wave_errors(c,r,v,rr,vv,w.f,w.v);push!(errors,err)
            item=merge(setting,(amplitude=amplitude,dt=dt,steps=setting.nper,rejections=0,error=err,minimumPressure=minimum(s.p),
                energyDrift=abs(energy(m,s)/e0-1),constantHumidityError=maximum(abs,s.W./mass(c,s.p).- .012),layerSpread=maximum(abs,s.v.-s.v[:,1]),trace=trace))
            push!(rows,item)
            @test item.minimumPressure>0&&item.constantHumidityError<1e-11&&item.layerSpread<1e-12
            @test all(t->max(t.localAirRelativeResidual,t.localWaterRelativeResidual,t.localDryRelativeResidual,t.pressureEquation,t.firstEquation,t.lastEquation)<5e-12&&t.pressureResidual<=2e-14&&t.completeEnergyAbsolute<=t.completeEnergyAllowance,trace)
            serialize(joinpath(OUT,ENV["VC_RUN_NAME"]*"-$(nr)-$(setting.model)-$(setting.variable)-$(amplitude)-final.bin"),(r=r,v=v,state=s))
            println(JSON3.write(merge(setting,(amplitude=amplitude,error=err,energyDrift=item.energyDrift))));flush(stdout)
        end
        @test errors[2].pressure<errors[1].pressure/5&&errors[2].velocity<errors[1].velocity/5
    end
    @test length(rows)==10
    write_result((passed=true,rows=rows,frozenC9Dynamics=true,linearizedLimit=true,internalGravityWaves=false))
end
@testset "C11 actual nonlinear small amplitude" begin;main();end
