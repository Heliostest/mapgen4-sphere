include("common.jl")
function polynomial(t,l)
    p0=ones(length(t));p1=t;d0=zeros(length(t));d1=ones(length(t))
    for k in 2:l;p=((2k-1)*t.*p1-(k-1)*p0)/k;d=((2k-1)*(p1+t.*d1)-(k-1)*d0)/k;p0,p1=p1,p;d0,d1=d1,d;end
    p1,d1
end
function main()
    rows=[];axes=[normalize([.37,.53,.76]),normalize([.81,-.47,.19]),normalize([-.22,.79,.57])]
    for nr in (24,48,96)
        original=jsonfile(joinpath(C4,"c4-graphs-v1-$(nr)-graph.json"));new=candidate_graph(nr);lat=Float64.(original.lat);lon=Float64.(original.lon)
        x,_,_=xyz_basis(lat,lon);a=Float64.(original.area);polar=abs.(lat).>deg2rad(75.)
        for variable in (false,true)
            pref=variable ? 1 .+.15x[:,1] : ones(length(a));old=graph_core(original,pref,[1.]);c=graph_core(new,pref,[1.])
            for (ia,axis) in enumerate(axes),degree in 1:5
                t=x*axis;f,df=polynomial(t,degree);exact=pref.*(degree*(degree+1)*f)-(variable ? .15df.*(axis[1].-t.*x[:,1]) : zeros(length(a)));metrics=[]
                for core in (old,c)
                    approx=(core.stiffness*f)./a;error=approx-exact
                    push!(metrics,(relative=sqrt(sum(a.*error.^2)/sum(a.*exact.^2)),polarMax=maximum(abs,error[polar]),rayleigh=abs(sum(f.*(core.stiffness*f))/sum(a.*f.*exact)-1)))
                end
                push!(rows,(rings=nr,variable=variable,axis=ia,degree=degree,c9=metrics[1],c10=metrics[2]))
            end
        end
    end
    write_result((passed=false,rows=rows))
    for nr in (24,48,96)
        rr=filter(r->r.rings==nr&&r.degree>=2,rows)
        @test maximum(r.c10.relative for r in rr)<=1.10maximum(r.c9.relative for r in rr)
        trained=filter(r->r.rings==nr&&r.degree==1&&!r.variable,rows);@test maximum(r.c10.relative for r in trained)<1e-6
    end
    @test length(rows)==90&&all(r->all(isfinite,(r.c10.relative,r.c10.polarMax,r.c10.rayleigh)),rows)
    write_result((passed=true,rows=rows,scope="Scalar Laplacian and Rayleigh proxies, not integrated wave dispersion"))
end
@testset "C10 pressure-operator regression audit" begin;main();end
