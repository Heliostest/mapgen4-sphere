include("common.jl")
include("vector-core.jl")
using .VectorInvariant
function main()
    rows=[];axes=[normalize([.37,.53,.76]),normalize([.81,-.47,.19])];ds=[.2,.3,.5]
    for nr in (24,48,96)
        graph=jsonfile(joinpath(C4,"c4-graphs-v1-$(nr)-graph.json"));lat=Float64.(graph.lat);lon=Float64.(graph.lon)
        x,east,north=xyz_basis(lat,lon);n=length(lat);polar=abs.(lat).>deg2rad(75.)
        for variable in (false,true)
            pref=variable ? 1 .+.15x[:,1] : ones(n);c=graph_core(graph,pref,ds);pw=PressureWorkCore(c)
            ep=polar[c.g.from].|polar[c.g.to]
            for (ia,axis) in enumerate(axes)
                m=VectorCore(pw,lat,lon,.1axis);t=x*axis;V=transpose(axis).-t.*x
                rot=reduce(vcat,[transpose(cross(axis,x[i,:])) for i in 1:n]);p=pref.*exp.(.2t)
                for (kind,aa,bb) in (("rotation",ones(3),zeros(3)),("mixed",fill(.6,3),fill(.7,3)),("sheared",[.2,.8,1.3],[.4,-.3,.9]))
                    U=[aa[k]*rot+bb[k]*V for k in 1:3]
                    ve=hcat([begin u,v=components(z,east,north);m.east*u+m.north*v end for z in U]...)
                    got=neutral_tendency(m,p,ve);dg=discrete_gradient(pw,p,p,ve,ve)
                    force=c.gradient*dg.mu.+got.total
                    div=hcat([p.*(-2bb[k]*t+.2bb[k]*(1 .-t.^2)+(variable ? .15U[k][:,1]./pref : zeros(n))) for k in 1:3]...)
                    pt=-(div*ds);F=zeros(n,4)
                    for k in 1:3;F[:,k+1]=F[:,k]-ds[k]*(div[:,k]+pt);end
                    vert=[zeros(n,3) for _ in 1:3]
                    for k in 1:2
                        change=F[:,k+1].*(U[k]-U[k+1])/2
                        vert[k]+=change./(p*ds[k]);vert[k+1]+=change./(p*ds[k+1])
                    end
                    exact=zeros(size(ve));exactVertical=similar(exact)
                    for k in 1:3
                        z=(-.2 .+(aa[k]^2+bb[k]^2)*t-(2aa[k]+.2)*aa[k]*t).*V+(2aa[k]+.2)*bb[k]*t.*rot+vert[k]
                        u,v=components(z,east,north);exact[:,k]=vec(m.east*u+m.north*v)
                        u,v=components(vert[k],east,north);exactVertical[:,k]=vec(m.east*u+m.north*v)
                    end
                    H=pw.h.*(pw.S*p/2);normH(z)=sqrt(sum(H.*z.^2 .*transpose(ds))/sum(H))
                    normA(z)=sqrt(sum(c.g.area.*z.^2 .*transpose(ds))/sum(c.g.area))
                    expectedCurl=hcat([2aa[k]*t for k in 1:3]...)
                    forceError=normH(force-exact)/normH(exact)
                    polarForce=sqrt(sum(H[ep].*(force-exact)[ep,:].^2 .*transpose(ds))/sum(H[ep]))/normH(exact)
                    push!(rows,(rings=nr,variable=variable,axis=ia,kind=kind,forceRelative=forceError,polarForce=polarForce,
                        curlRelative=normA(got.curl-expectedCurl)/normA(expectedCurl),verticalRelative=normH(got.vertical-exactVertical)/max(normH(exactVertical),.1normH(ve)^2)))
                end
            end
        end
        println(JSON3.write((rings=nr,worstForce=maximum(r.forceRelative for r in rows if r.rings==nr),worstPolar=maximum(r.polarForce for r in rows if r.rings==nr))));flush(stdout)
    end
    write_result((passed=false,rows=rows))
    for i in 1:12
        @test rows[i].forceRelative>rows[i+12].forceRelative>rows[i+24].forceRelative
        @test rows[i+24].forceRelative<.35
    end
    @test all(r->all(isfinite,(r.forceRelative,r.polarForce,r.curlRelative,r.verticalRelative)),rows)
    # Fixed horizontal graph, analytic linear sigma profile. The limiting
    # vertical tendency uses its exact quadratic interface-rate integral.
    graph=jsonfile(joinpath(C4,"c4-graphs-v1-24-graph.json"));lat=Float64.(graph.lat);lon=Float64.(graph.lon)
    x,east,north=xyz_basis(lat,lon);axis=axes[1];t=x*axis;V=transpose(axis).-t.*x;vr=[]
    for nl in (4,8,16,32)
        c=graph_core(graph,ones(length(lat)),fill(1/nl,nl));pw=PressureWorkCore(c);m=VectorCore(pw,lat,lon,zeros(3));p=ones(length(lat))
        u,v=components(V,east,north);base=vec(m.east*u+m.north*v);sigma=((1:nl).- .5)/nl
        ve=base*transpose(1 .+.6sigma);d=(c.divergence*base)./c.g.area
        exact=-.18*((pw.S*d/2).*base)*transpose(sigma.*(1 .-sigma))
        got=neutral_tendency(m,p,ve).vertical
        err=sqrt(sum(pw.h.*(got-exact).^2)/sum(pw.h.*exact.^2));push!(vr,(layers=nl,relative=err))
    end
    for i in 1:3;@test vr[i].relative/vr[i+1].relative>3.5;end
    @test vr[end].relative<.01
    c,lat,lon=small_core(;ds=ds);pw=PressureWorkCore(c);omega=[.03,-.02,.07];m=VectorCore(pw,lat,lon,omega)
    p=c.pref.*exp.(.1sin.(1:6));ve=reshape(.1sin.(1:45),15,3);base=neutral_tendency(m,p,ve);cov=[]
    x,_,_=xyz_basis(lat,lon)
    for angle in (.43,1.17)
        axis=axes[2];C=[0. -axis[3] axis[2];axis[3] 0. -axis[1];-axis[2] axis[1] 0.]
        Q=I+sin(angle)*C+(1-cos(angle))*C*C;xx=x*Q';la=asin.(xx[:,3]);lo=atan.(xx[:,2],xx[:,1]);rotated=VectorCore(pw,la,lo,Q*omega)
        result=neutral_tendency(rotated,p,ve);err=norm(result.total-base.total)/norm(base.total);push!(cov,err);@test err<2e-12
    end
    write_result((passed=true,rows=rows,verticalRefinement=vr,covariance=cov))
end
@testset "C9 manufactured momentum and sigma refinement" begin;main();end
