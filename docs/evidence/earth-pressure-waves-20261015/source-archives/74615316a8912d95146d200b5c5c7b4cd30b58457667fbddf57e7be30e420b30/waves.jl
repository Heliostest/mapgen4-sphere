include("common.jl")
include("wave-core.jl")
include("wave-cases.jl")
function main()
    rows=[]
    for nr in (24,48,96),model in ("c9","c10")
        graph=model=="c9" ? jsonfile(joinpath(C4,"c4-graphs-v1-$(nr)-graph.json")) : candidate_graph(nr)
        x,_,_=xyz_basis(Float64.(graph.lat),Float64.(graph.lon));c=graph_core(graph,ones(length(graph.area)),[1.]);endpoints=[]
        for degree in (1,3,5),nper in (64,128,256)
            period=2pi/sqrt(degree*(degree+1));dt=period/nper;solver=WaveStepper(c,dt)
            for (ia,axis) in enumerate(AXES),kind in ("standing","traveling")
                w=wave_fields(c,x,degree,axis,kind);r=copy(w.f);v=copy(w.v);e0=wave_energy(c,r,v);mean0=sum(c.g.area.*r)/sum(c.g.area);trace=[];phase=0.
                for k in 0:2nper
                    k>0&&((r,v)=wave_step(solver,r,v))
                    angle=w.omega*k*dt;exact=w.f*cos(angle)+w.g*sin(angle);z=wave_measure(c,r,v,w.f,w.g,w.omega,kind);phase=unwrap_phase(phase,z.phase)
                    err=sqrt(sum(c.g.area.*(r-exact).^2)/sum(c.g.area.*w.f.^2))
                    push!(trace,(step=k,time=k*dt,phase=phase,phaseError=phase-angle,amplitude=z.amplitude,leakage=z.leakage,pressureError=err,energyDrift=abs(wave_energy(c,r,v)/e0-1),meanDrift=abs(sum(c.g.area.*r)/sum(c.g.area)-mean0)))
                end
                item=(rings=nr,model=model,degree=degree,nper=nper,axis=ia,kind=kind,dt=dt,period=period,
                    finalPhaseError=trace[end].phaseError,relativeFrequencyBias=trace[end].phaseError/(4pi),maxAmplitudeError=maximum(abs(t.amplitude-1) for t in trace),
                    maxPressureError=maximum(t.pressureError for t in trace),endpointPressureError=trace[end].pressureError,maxLeakage=maximum(t.leakage for t in trace),
                    maxEnergyDrift=maximum(t.energyDrift for t in trace),maxMeanDrift=maximum(t.meanDrift for t in trace),trace=trace)
                push!(rows,item);push!(endpoints,(degree=degree,nper=nper,axis=ia,kind=kind,r=r,v=v))
                @test item.maxEnergyDrift<1e-9&&item.maxMeanDrift<1e-10
            end
        end
        serialize(joinpath(OUT,ENV["VC_RUN_NAME"]*"-$(nr)-$(model)-endpoints.bin"),endpoints)
        println(JSON3.write((rings=nr,model=model,rows=length(rows))));flush(stdout)
    end
    write_result((passed=false,rows=rows))
    @test length(rows)==216
    for nr in (24,48,96)
        rr=filter(r->r.rings==nr&&r.nper==256,rows)
        old=maximum(r.maxPressureError for r in rr if r.model=="c9");new=maximum(r.maxPressureError for r in rr if r.model=="c10")
        @test new<=1.10old+1e-7
    end
    write_result((passed=true,rows=rows,periods=2,commonAreaNorm=true,diagnosticLinearization=true,changesDynamics=false))
end
@testset "C11 integrated pressure waves" begin;main();end
