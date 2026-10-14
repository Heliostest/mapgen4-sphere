include("common.jl")
function main()
    rows=[];axes=[normalize([.37,.53,.76]),normalize([.81,-.47,.19])]
    for nr in (24,48,96)
        graph=jsonfile(joinpath(OUT,"c4-graphs-v1-$(nr)-graph.json"))
        n=length(graph.area);lat=Float64.(graph.lat);lon=Float64.(graph.lon)
        x,east,north=xyz_basis(lat,lon);area=Float64.(graph.area);polar=abs.(lat).>deg2rad(75.)
        # A varying reference metric also exercises the Hodge projection.
        pref=1 .+.1x[:,1];c=graph_core(graph,pref,[1.]);m=WindMap(c,lat,lon)
        H=c.g.edgeLength.*c.g.centerDistance./c.prefFace
        # Gradient-leakage claims use constant reference pressure.
        unit=graph_core(graph,ones(n),[1.]);unitmap=WindMap(unit,lat,lon)
        for (index,axis) in enumerate(axes),variable in (false,true),kind in ("rotation","gradient1","gradient2","gradient3","mixed")
            t=x*axis;rot=reduce(vcat,[transpose(cross(axis,x[i,:])) for i in 1:n])
            degree=kind=="gradient1" ? 1 : kind=="gradient3" ? 3 : 2
            f=degree==1 ? t : degree==2 ? (3t.^2 .-1)/2 : (5t.^3-3t)/2
            deriv=degree==1 ? ones(n) : degree==2 ? 3t : (15t.^2 .-3)/2
            grad=deriv.*(transpose(axis).-t.*x)
            U=kind=="rotation" ? rot : kind=="mixed" ? rot+.7grad : grad
            divU=kind=="rotation" ? zeros(n) : -degree*(degree+1)*f*(kind=="mixed" ? .7 : 1.)
            p=variable ? 1 .+.2x[:,3] : ones(n)
            u,v=components(U,east,north);j=import_wind(m,p,u,v)
            exact=p.*divU+(variable ? .2U[:,3] : zeros(n))
            d=vec(c.divergence*j)./area;err=d-exact
            scale=sqrt(sum(area.*exact.^2)/sum(area))
            rms=sqrt(sum(area.*err.^2)/sum(area));polarMax=maximum(abs,err[polar])
            split=hodge_split(m,j);hnorm(z)=sqrt(sum(H.*z.^2))
            orth=abs(sum(H.*split.divergent.*split.solenoidal))/sum(H.*j.^2)
            @test split.relativeResidual<1e-10
            @test orth<1e-10
            @test hnorm(split.divergent+split.solenoidal-j)/hnorm(j)<3e-16
            leakage=nothing
            if startswith(kind,"gradient")&&!variable
                gsplit=hodge_split(unitmap,j);leakage=sqrt(sum(unit.g.edgeLength.*unit.g.centerDistance.*gsplit.solenoidal.^2)/sum(unit.g.edgeLength.*unit.g.centerDistance.*j.^2))
            end
            if kind=="rotation"&&!variable;@test maximum(abs,err)<1e-6;end
            row=(rings=nr,axis=index,variable=variable,kind=kind,rms=rms,relativeL2=scale>1e-12 ? rms/scale : nothing,polarMax=polarMax,hodgeResidual=split.relativeResidual,orthogonality=orth,gradientCycleLeakage=leakage)
            push!(rows,row)
        end
        println(JSON3.write((rings=nr,rows=rows[end-19:end])));flush(stdout)
    end
    # Emit metrics even when an acceptance gate fails.
    write_result((rows=rows,passed=false))
    for i in 1:20
        a,b,d=rows[i],rows[20+i],rows[40+i]
        if a.kind=="rotation"&&!a.variable;continue;end
        @test a.rms>b.rms>d.rms
        @test a.polarMax>b.polarMax>d.polarMax
        if a.gradientCycleLeakage!==nothing
            @test a.gradientCycleLeakage>b.gradientCycleLeakage>d.gradientCycleLeakage
            @test d.gradientCycleLeakage<.01
        end
    end
    write_result((rows=rows,passed=true,contract="Gaussian weak divergence and complete mapped graph cycle retained; not native spectral divergence"))
end
@testset "C4 independent analytic vector fields" begin;main();end
