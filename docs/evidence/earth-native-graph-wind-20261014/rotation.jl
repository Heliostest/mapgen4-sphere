include("common.jl")
function main()
    rows=[];nrings=parse.(Int,Base.split(get(ENV,"WIND_RINGS","24,48,96"),','))
    for nr in nrings,kind in ("axial","polar-crossing")
        graph=jsonfile(joinpath(OUT,"c4-graphs-v1-$(nr)-graph.json"))
        lat=Float64.(graph.lat);lon=Float64.(graph.lon);n=length(lat)
        x,east,north=xyz_basis(lat,lon);axis=kind=="axial" ? [0.,0.,1.] : [1.,0.,0.]
        tracerAxis=kind=="axial" ? [1.,0.,0.] : [0.,0.,1.]
        U=reduce(vcat,[transpose(cross(axis,x[i,:])) for i in 1:n]);u,v=components(U,east,north)
        c=graph_core(graph,ones(n),[1.]);m=WindMap(c,lat,lon);j=vec(import_wind(m,ones(n),u,v))
        rate=c.g.edgeLength.*j # R=1, one layer, pressure=1
        div=c.divergence*j
        # Retain the imported flow's tiny C3 fit residual, without a solenoidal
        # projection. Evolve air with the same transfers used for water.
        # This prescribed-flux tracer experiment is not acoustic/physical forcing.
        area=c.g.area;air=copy(area);pmin=1.;steps=8nr;dt=2pi/steps
        tracer(t)=.01 .+.004t+.003(5t.^3-3t)/2
        q0=tracer(x*tracerAxis);water=air.*q0;W0=sum(water)
        qmin=minimum(q0);qmax=maximum(q0);localMax=0.;globalMax=0.;polarMax=0.;finalError=0.;phaseErrors=[]
        polar=abs.(lat).>deg2rad(75.);started=time()
        for step in 1:steps
            newair=air-dt*div
            tr=transport_fct(air,newair,c.g.from,c.g.to,dt*rate,water)
            water=vec(tr.water);air=newair;q=water./air
            localMax=max(localMax,tr.localAirRelativeResidual,tr.localWaterRelativeResidual,tr.localDryRelativeResidual)
            qmin=min(qmin,minimum(q));qmax=max(qmax,maximum(q));pmin=min(pmin,minimum(air./area))
            if step%(steps÷8)==0
                time=step*dt
                b=cos(time)*tracerAxis+sin(time)*cross(axis,tracerAxis)+(1-cos(time))*dot(axis,tracerAxis)*axis
                exact=tracer(x*b);err=q-exact
                l2=sqrt(sum(area.*err.^2)/sum(area.*(q0.-.01).^2));pe=maximum(abs,err[polar])/.007
                globalMax=max(globalMax,l2);polarMax=max(polarMax,pe);finalError=l2
                push!(phaseErrors,(phase=step/(steps/8),relativeL2=l2,polarRelativeMax=pe))
            end
        end
        row=(rings=nr,case=kind,steps=steps,dt=dt,maximumPhaseL2=globalMax,maximumPhasePolar=polarMax,finalL2=finalError,phaseErrors=phaseErrors,waterDrift=sum(water)-W0,airDrift=sum(air)-sum(area),airDeviation=maximum(abs,air./area.-1),qmin=qmin,qmax=qmax,initialQmin=minimum(q0),initialQmax=maximum(q0),localMax=localMax,elapsedSeconds=time()-started)
        push!(rows,row);println(JSON3.write(row));flush(stdout)
        write(joinpath(OUT,ENV["WIND_RUN_NAME"]*"-partial.json"),JSON3.write(rows))
        @test localMax<5e-12
        @test abs(row.waterDrift)<1e-11 && abs(row.airDrift)<1e-11
        @test row.airDeviation<1e-5
        @test qmin>=minimum(q0)-1e-12 && qmax<=maximum(q0)+1e-12
        @test globalMax<.3 && polarMax<.3
    end
    for kind in ("axial","polar-crossing")
        r=filter(x->x.case==kind,rows)
        @test all(r[i].maximumPhaseL2>r[i+1].maximumPhaseL2 for i in 1:length(r)-1)
        @test all(r[i].maximumPhasePolar>r[i+1].maximumPhasePolar for i in 1:length(r)-1)
        length(r)==3&&(@test r[end].maximumPhaseL2<.1)
    end
    write_result((passed=true,rows=rows,scope="Prescribed imported graph flux; shared evolving air and FCT water; no divergence projection or cell correction"))
end
@testset "C4 imported-wind tracer rotation" begin;main();end
