include("common.jl")
include("../earth-rotating-sigma-20261014/vector-core.jl")
using .VectorInvariant
function legendre(t,l)
    p0=ones(length(t));p1=t;d0=zeros(length(t));d1=ones(length(t));dd0=zeros(length(t));dd1=zeros(length(t))
    for k in 2:l
        p=((2k-1)*t.*p1-(k-1)*p0)/k;d=((2k-1)*(p1+t.*d1)-(k-1)*d0)/k;dd=((2k-1)*(2d1+t.*dd1)-(k-1)*dd0)/k
        p0,p1=p1,p;d0,d1=d1,d;dd0,dd1=dd1,dd
    end
    p1,d1,dd1
end
function main()
    rows=[];primary=[];axes=[normalize([.37,.53,.76]),normalize([.81,-.47,.19]),normalize([-.22,.79,.57])];ds=[.2,.3,.5]
    for nr in (24,48,96)
        original=jsonfile(joinpath(C4,"c4-graphs-v1-$(nr)-graph.json"));new=candidate_graph(nr)
        for key in (:area,:lat,:lon,:from,:to,:distance);@test original[key]==new[key];end
        lat=Float64.(original.lat);lon=Float64.(original.lon);x,east,north=xyz_basis(lat,lon);n=length(lat)
        for variable in (false,true)
            pref=variable ? 1 .+.15x[:,1] : ones(n)
            old=graph_core(original,pref,ds);c=graph_core(new,pref,ds);pw=PressureWorkCore(c);oldpw=PressureWorkCore(old)
            ep=(abs.(lat[c.g.from]).>deg2rad(75.)) .| (abs.(lat[c.g.to]).>deg2rad(75.));h=oldpw.h
            for (ia,axis) in enumerate(axes)
                m=VectorCore(pw,lat,lon,zeros(3));om=VectorCore(oldpw,lat,lon,zeros(3));@test m.east==om.east&&m.north==om.north
                t=x*axis;V=transpose(axis).-t.*x;p=pref.*exp.(.2t)
                normH(z)=sqrt(sum(h.*z.^2)/sum(h))
                for degree in (2,3,4,5)
                    _,f,fp=legendre(t,degree);u,v=components(f.*V,east,north);ve=repeat(m.east*u+m.north*v,1,3)
                    eu,en=components(-(.2 .+f.*fp.*(1 .-t.^2)-f.^2 .*t).*V,east,north);exact=vec(m.east*eu+m.north*en)
                    scalarK=f.^2 .*(1 .-t.^2)/2;ku,kn=components(-(f.*fp.*(1 .-t.^2)-f.^2 .*t).*V,east,north);exactKG=vec(m.east*ku+m.north*kn)
                    pu,pn=components(-.2V,east,north);exactPressure=vec(m.east*pu+m.north*pn)
                    error(z)=(globalError=normH(z)/normH(exact),polar=sqrt(sum(h[ep].*z[ep].^2)/sum(h[ep]))/normH(exact))
                    metrics=[]
                    for model in (om,m)
                        core=model.pressure;cc=core.base;neutral=neutral_tendency(model,p,ve);K=vec(core.S'*(core.h.*ve[:,1].^2)./(4cc.g.area))
                        full=cc.gradient*discrete_gradient(core,p,p,ve,ve).mu .+neutral.total
                        push!(metrics,(force=error(vec(full[:,1])-exact),pressure=error(cc.gradient*(.2t)-exactPressure),kineticSampling=error(cc.gradient*(K-scalarK)),exactKGradient=error(cc.gradient*scalarK-exactKG),curlForce=error(vec(neutral.vorticity[:,1]))))
                    end
                    push!(rows,(rings=nr,variable=variable,axis=ia,degree=degree,c9=metrics[1],c10=metrics[2]))
                end
                ia>2&&continue
                m=VectorCore(pw,lat,lon,.1axis);om=VectorCore(oldpw,lat,lon,.1axis);rot=reduce(vcat,[transpose(cross(axis,x[i,:])) for i in 1:n])
                for (kind,aa,bb) in (("rotation",ones(3),zeros(3)),("mixed",fill(.6,3),fill(.7,3)),("sheared",[.2,.8,1.3],[.4,-.3,.9]))
                    U=[aa[k]*rot+bb[k]*V for k in 1:3];ve=hcat([begin u,v=components(z,east,north);m.east*u+m.north*v end for z in U]...)
                    div=hcat([p.*(-2bb[k]*t+.2bb[k]*(1 .-t.^2)+(variable ? .15U[k][:,1]./pref : zeros(n))) for k in 1:3]...)
                    pt=-(div*ds);F=zeros(n,4)
                    for k in 1:3;F[:,k+1]=F[:,k]-ds[k]*(div[:,k]+pt);end
                    vert=[zeros(n,3) for _ in 1:3]
                    for k in 1:2
                        change=F[:,k+1].*(U[k]-U[k+1])/2;vert[k]+=change./(p*ds[k]);vert[k+1]+=change./(p*ds[k+1])
                    end
                    exact=zeros(size(ve))
                    for k in 1:3
                        z=(-.2 .+(aa[k]^2+bb[k]^2)*t-(2aa[k]+.2)*aa[k]*t).*V+(2aa[k]+.2)*bb[k]*t.*rot+vert[k]
                        u,v=components(z,east,north);exact[:,k]=vec(m.east*u+m.north*v)
                    end
                    H=h.*(oldpw.S*p/2);normCommon(z)=sqrt(sum(H.*z.^2 .*transpose(ds))/sum(H))
                    metrics=[]
                    for model in (om,m)
                        force=model.pressure.base.gradient*discrete_gradient(model.pressure,p,p,ve,ve).mu .+neutral_tendency(model,p,ve).total
                        push!(metrics,(globalError=normCommon(force-exact)/normCommon(exact),polar=sqrt(sum(H[ep].*(force-exact)[ep,:].^2 .*transpose(ds))/sum(H[ep]))/normCommon(exact)))
                    end
                    push!(primary,(rings=nr,variable=variable,axis=ia,kind=kind,c9=metrics[1],c10=metrics[2]))
                end
            end
        end
        println(JSON3.write((rings=nr,worstDegree3Polar=maximum(r.c10.force.polar for r in rows if r.rings==nr&&r.degree==3&&r.axis<=2))));flush(stdout)
    end
    write_result((passed=false,rows=rows,primary=primary))
    for variable in (false,true),axis in 1:2
        rr=filter(r->r.variable==variable&&r.axis==axis&&r.degree==3,rows)
        @test all(r->r.c10.force.globalError<=r.c9.force.globalError,rr)
        @test rr[1].c10.force.globalError>rr[2].c10.force.globalError>rr[3].c10.force.globalError
        @test rr[1].c10.force.polar>rr[2].c10.force.polar>rr[3].c10.force.polar
        @test rr[3].c10.force.polar<=.8rr[3].c9.force.polar&&rr[3].c10.force.polar<=.09
    end
    @test length(rows)==72&&length(primary)==36
    @test all(r->all(isfinite,(r.c10.force.globalError,r.c10.force.polar,r.c10.pressure.globalError,r.c10.pressure.polar)),rows)
    write_result((passed=true,rows=rows,primary=primary,commonOriginalMetric=true,heldOutDegrees=[2,4,5],heldOutAxis=axes[3]))
end
@testset "C10 common-metric spatial comparison" begin;main();end
