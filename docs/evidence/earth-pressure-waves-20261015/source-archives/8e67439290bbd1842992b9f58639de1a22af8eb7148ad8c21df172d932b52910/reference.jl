include("common.jl")
include("wave-core.jl")
include("wave-cases.jl")
function main()
    rows=[]
    for model in ("c9","c10"),variable in (false,true)
        graph=model=="c9" ? jsonfile(joinpath(C4,"c4-graphs-v1-24-graph.json")) : candidate_graph(24)
        x,_,_=xyz_basis(Float64.(graph.lat),Float64.(graph.lon));pref=variable ? 1 .+.15x[:,1] : ones(size(x,1));c=graph_core(graph,pref,[1.])
        w=wave_fields(c,x,3,AXES[1],"traveling");sm=sqrt.(c.g.area.*c.pref);Q=c.c2*(Diagonal(1 ./sm)*c.stiffness*Diagonal(1 ./sm));ev=eigen(Symmetric(Matrix(Q)))
        cutoff=1e-11*maximum(ev.values);null=findall(abs.(ev.values).<cutoff)
        @test length(null)==1&&minimum(ev.values)>-cutoff&&abs(dot(ev.vectors[:,only(null)],sm)/norm(sm))>1-1e-10
        omega=sqrt.(max.(ev.values,0.));omega[null].=0.;a=ev.vectors'*(sm.*w.f);b=ev.vectors'*(-(c.divergence*(c.prefFace.*w.v))./sm);T=2w.period
        osc=[abs(o)<1e-14 ? (co=1.,si=T,ci=T^2/2) : (co=cos(o*T),si=sin(o*T)/o,ci=2sin(o*T/2)^2/o^2) for o in omega]
        exactr=(ev.vectors*[a[i]*osc[i].co+b[i]*osc[i].si for i in eachindex(a)])./sm
        integral=(ev.vectors*[a[i]*osc[i].si+b[i]*osc[i].ci for i in eachindex(a)])./sm
        exactv=w.v+c.c2*(c.gradient*integral);errors=[]
        for nper in (64,128,256)
            solver=WaveStepper(c,w.period/nper);r=copy(w.f);v=copy(w.v)
            for _ in 1:2nper;r,v=wave_step(solver,r,v);end
            err=wave_errors(c,r,v,exactr,exactv,w.f,w.v);push!(errors,err)
            push!(rows,(model=model,variable=variable,nper=nper,error=err))
        end
        for key in (:pressure,:velocity)
            vals=[getproperty(e,key) for e in errors]
            @test vals[1]>vals[2]>vals[3]>0
            @test 3.7<vals[2]/vals[3]<4.3
        end
        println(JSON3.write((model=model,variable=variable,errors=errors)));flush(stdout)
    end
    write_result((passed=true,rows=rows,reference="dense symmetric modal evolution of same discrete graph"))
end
@testset "C11 independent temporal reference" begin;main();end
