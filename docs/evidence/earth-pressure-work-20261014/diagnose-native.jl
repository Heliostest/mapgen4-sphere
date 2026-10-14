include("common.jl")
include("pressure-core.jl")
using .PressureWork
function main()
    graph,initial,geo=native_inputs();c=graph_core(graph,initial.pref,initial.ds;radius=Float64(geo.radiusM),c2=82671.64740772452)
    m=PressureWorkCore(c);wind=WindMap(c,Float64.(graph.lat),Float64.(graph.lon));p=copy(initial.pressure)
    v=import_wind(wind,p,initial.u,initial.v)./(m.S*p/2);failed=0;reason="";dt=1800.
    for k in 1:12
        try;s=pressure_step(m,p,v,dt);p,v=s.p,s.v
        catch e;failed=k;reason=sprint(showerror,e);break;end
    end
    n=length(p);y=vcat(zeros(n),discrete_gradient(m,p,p,v,v).mu/c.c2);rows=[]
    for iteration in 0:30
        r,J=PressureWork.residual_jacobian(m,p,v,dt,y);scale=maximum(abs,r);i=argmax(abs.(r[n+1:end]));b=p+c.pref.*y[1:n]
        aa,bb,rr=BigFloat(p[i]),BigFloat(b[i]),BigFloat(c.pref[i]);exact=aa==bb ? log(aa/rr) : (bb*log(bb/rr)-bb-aa*log(aa/rr)+aa)/(bb-aa)
        err=secant(p[i],b[i],c.pref[i]).value-Float64(exact)
        push!(rows,(iteration=iteration,residual=scale,secantError=err,p0=p[i],p1=b[i],pref=c.pref[i]));println(JSON3.write(last(rows)))
        iteration==30&&break;delta=-(J\r);accepted=false
        for k in 0:25
            trial=y+2.0^(-k)*delta;pp=p+c.pref.*trial[1:n]
            if all(pp.>0)
                rt,_=PressureWork.residual_jacobian(m,p,v,dt,trial;jacobian=false)
                if maximum(abs,rt)<=(1-1e-4*2.0^(-k))*scale;y=trial;accepted=true;break;end
            end
        end
        accepted||break
    end
    write_result((passed=true,diagnosticOnly=true,failedStep=failed,reason=reason,trace=rows))
end
main()
