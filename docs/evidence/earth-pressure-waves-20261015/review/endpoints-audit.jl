include("../../docs/evidence/earth-pressure-waves-20261015/common.jl")
include("../../docs/evidence/earth-pressure-waves-20261015/wave-core.jl")
include("../../docs/evidence/earth-pressure-waves-20261015/wave-cases.jl")
waves=jsonfile("build/earth-pressure-waves/c11-waves-v1.json").rows
nonlinear=jsonfile("build/earth-pressure-waves/c11-nonlinear-v1.json").rows
initialization=[];endpointErrors=[];nonlinearErrors=[]
@testset "Independent endpoints and common initialization" begin
 for nr in (24,48,96)
    old=jsonfile(joinpath(C4,"c4-graphs-v1-$(nr)-graph.json"));new=candidate_graph(nr)
    for field in (:area,:from,:to,:distance,:lat,:lon);@test old[field]==new[field];end
    for (model,graph) in (("c9",old),("c10",new))
        x,_,_=xyz_basis(Float64.(graph.lat),Float64.(graph.lon));c=graph_core(graph,ones(length(graph.area)),[1.]);a=c.g.area
        @test minimum(graph.conductance)>0
        # Initial derivative discrepancy: identical velocity samples, changed divergence weights.
        for degree in (1,3,5),(axisno,axis) in enumerate(AXES)
            w=wave_fields(c,x,degree,axis,"traveling");rdot=-(c.divergence*(c.prefFace.*w.v))./a;target=w.omega*w.g
            err=sqrt(sum(a.*(rdot-target).^2)/sum(a.*target.^2))
            push!(initialization,(rings=nr,model=model,degree=degree,axis=axisno,relativeDerivativeError=err))
        end
        endpoints=deserialize("build/earth-pressure-waves/c11-waves-v1-$(nr)-$(model)-endpoints.bin")
        @test length(endpoints)==36
        for e in endpoints
            row=only(filter(q->q.rings==nr&&q.model==model&&q.degree==e.degree&&q.nper==e.nper&&q.axis==e.axis&&q.kind==e.kind,waves))
            w=wave_fields(c,x,e.degree,AXES[e.axis],e.kind);r=e.r;v=e.v;last=row.trace[end];angle=4pi
            # Independent endpoint pressure, modal coefficients, derivative and energy.
            pressure=sqrt(sum(a.*(r-w.f*cos(angle)-w.g*sin(angle)).^2)/sum(a.*w.f.^2))
            if e.kind=="standing"
                coeff=[sum(a.*w.f.*r),sum(a.*w.f.*(c.divergence*(c.prefFace.*v))./a)/w.omega]/sum(a.*w.f.^2)
                projected=coeff[1]*w.f
            else
                F=hcat(w.f,w.g);coeff=(F'*Diagonal(a)*F)\(F'*Diagonal(a)*r);projected=F*coeff
            end
            phase=atan(coeff[2],coeff[1]);phaseDelta=mod(last.phase-phase+pi,2pi)-pi
            leakage=sqrt(sum(a.*(r-projected).^2)/sum(a.*w.f.^2))
            H=c.g.edgeLength.*c.g.centerDistance.*c.prefFace
            energy=(c.c2*sum(a.*r.^2)+sum(H.*v.^2))/(c.c2*sum(a.*w.f.^2)+sum(H.*w.v.^2))-1
            @test all(isfinite,r)&&all(isfinite,v)&&length(r)==length(a)&&length(v)==length(H)
            @test abs(pressure-last.pressureError)<2e-13
            @test abs(norm(coeff)-last.amplitude)<2e-13
            @test abs(phaseDelta)<2e-13
            @test abs(leakage-last.leakage)<2e-13
            @test abs(abs(energy)-last.energyDrift)<2e-13
            @test abs(sum(a.*(r-w.f))/sum(a))<1e-10
            push!(endpointErrors,(rings=nr,model=model,degree=e.degree,nper=e.nper,axis=e.axis,kind=e.kind,pressureResidual=pressure-last.pressureError,phaseResidual=phaseDelta,amplitudeResidual=norm(coeff)-last.amplitude,leakageResidual=leakage-last.leakage))
        end
    end
 end
 for nr in (24,48),model in ("c9","c10"),variable in (false,true)
    rows=filter(q->q.nr==nr&&q.model==model&&q.variable==variable,nonlinear);isempty(rows)&&continue
    graph=model=="c9" ? jsonfile(joinpath(C4,"c4-graphs-v1-$(nr)-graph.json")) : candidate_graph(nr)
    x,_,_=xyz_basis(Float64.(graph.lat),Float64.(graph.lon));pref=variable ? 1 .+.15x[:,1] : ones(size(x,1));c=graph_core(graph,pref,[.2,.3,.5])
    w=wave_fields(c,x,3,AXES[1],"traveling");rr,vv=copy(w.f),copy(w.v);solver=WaveStepper(c,rows[1].dt)
    for _ in 1:rows[1].nper;rr,vv=wave_step(solver,rr,vv);end
    for row in rows
        amp=row.amplitude;f=deserialize("build/earth-pressure-waves/c11-nonlinear-v1-$(nr)-$(model)-$(variable)-$(amp)-final.bin");s=f.state
        @test norm(f.r-(s.p./pref.-1)/amp)==0&&norm(f.v-s.v[:,1]/amp)==0
        @test abs(s.time-row.nper*row.dt)<1e-12
        @test minimum(s.p)==row.minimumPressure&&maximum(abs,s.W./mass(c,s.p).- .012)==row.constantHumidityError
        pr=sqrt(sum(c.g.area.*pref.*(f.r-rr).^2)/sum(c.g.area.*pref.*w.f.^2))
        H=c.g.edgeLength.*c.g.centerDistance.*c.prefFace
        ve=sqrt(sum(H.*(f.v-vv).^2)/(c.c2*sum(c.g.area.*pref.*w.f.^2)+sum(H.*w.v.^2)))
        @test abs(pr-row.error.pressure)<1e-14&&abs(ve-row.error.velocity)<1e-14
        push!(nonlinearErrors,(rings=nr,model=model,variable=variable,amplitude=amp,pressure=pr,velocity=ve))
    end
 end
end
worst=[(rings=nr,model=model,relativeDerivativeError=maximum(r.relativeDerivativeError for r in initialization if r.rings==nr&&r.model==model)) for nr in (24,48,96) for model in ("c9","c10")]
write(joinpath("build/c11-independent-review",ENV["AUDIT_NAME"]*".json"),JSON3.write((passed=true,initialization=initialization,initializationWorst=worst,endpoints=endpointErrors,nonlinear=nonlinearErrors)))
println(JSON3.write((initializationWorst=worst,endpoints=length(endpointErrors),nonlinear=length(nonlinearErrors))))
