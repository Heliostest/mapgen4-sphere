include("common.jl")

# Independent assembly of the fixed acoustic operator from incidence and w,
# followed by direct evaluation of its eigen-solution at the final time.
function reference_flow(graph,c,initial,j,T)
    n=length(c.pref);ne=length(graph.from)
    B=sparse(vcat(Int.(graph.from),Int.(graph.to)),vcat(1:ne,1:ne),vcat(ones(ne),-ones(ne)),n,ne)
    w=Float64.(graph.conductance);d=Float64.(graph.distance);pf=(initial.pref[graph.from]+initial.pref[graph.to])/2
    sm=sqrt.(c.g.area.*initial.pref);K=B*Diagonal(w.*pf)*B'/c.g.radius^2
    e=eigen(Symmetric(Matrix(c.c2*Diagonal(1 ./sm)*K*Diagonal(1 ./sm))))
    null=abs.(e.values).<=1e-12*maximum(abs,e.values);@test count(null)==1
    mean=sum(c.g.area.*initial.pressure)/sum(sm.^2)
    a=e.vectors'*(sm.*(initial.pressure./initial.pref.-mean))
    b=e.vectors'*(-B*((w.*d).*(j*initial.ds))/c.g.radius./sm)
    z=similar(a);integral=similar(a)
    for i in eachindex(a)
        if null[i];z[i]=a[i]+T*b[i];integral[i]=T*a[i]+T^2/2*b[i]
        else
            omega=sqrt(e.values[i]);z[i]=cos(omega*T)*a[i]+sin(omega*T)/omega*b[i]
            integral[i]=sin(omega*T)/omega*a[i]+2sin(omega*T/2)^2/omega^2*b[i]
        end
    end
    p=initial.pref.*(mean.+(e.vectors*z)./sm)
    jf=j.+c.c2*pf.*((B'*((e.vectors*integral)./sm))./(c.g.radius*d))
    p,jf
end

function main()
    dt=parse(Float64,get(ENV,"WIND_DT","1800"));T=parse(Float64,get(ENV,"WIND_DURATION","86400"))
    isfinite(dt)&&dt>0&&isfinite(T)&&T>0 || throw(ArgumentError("invalid duration or timestep"))
    steps=round(Int,T/dt);steps>=6&&steps*dt==T || throw(ArgumentError("need integral explicit steps"))
    kinds=split(get(ENV,"WIND_CASES","real,constant,sharp"),',')
    all(k->k in ("real","constant","sharp"),kinds)&&length(unique(kinds))==length(kinds)&&!isempty(kinds) || throw(ArgumentError("invalid cases"))
    inputPath="build/earth-conservative-transport/candidate-c1-native-1800-import.bin"
    inputHash=bytes2hex(sha256(read(inputPath)));initial=deserialize(inputPath)
    @test keys(initial)==(:pressure,:water,:u,:v,:pref,:ds)
    graph=selected_native_graph();data=jsonfile("build/earth-speedy-transport/split-reference-seasonal-geometry.json")
    mesh=build_gaussian_mesh(data.latDegrees,data.lonDegrees,data.weights)
    @test mesh.area==Float64.(graph.area)&&mesh.lat==Float64.(graph.lat)&&mesh.lon==Float64.(graph.lon)
    record=jsonfile("build/earth-conservative-transport/candidate-c1-native-1800.json")
    @test Float64(record.c2)==82671.64740772452
    c=graph_core(graph,initial.pref,initial.ds;radius=Float64(data.radiusM),c2=Float64(record.c2))
    m=FCTCore(ModalCore(c));windmap=WindMap(c,mesh.lat,mesh.lon)
    j=import_wind(windmap,initial.pressure,initial.u,initial.v);split=hodge_split(windmap,j)
    H=c.g.edgeLength.*c.g.centerDistance./c.prefFace
    hn(z)=sqrt(sum(H.*z.^2 .*transpose(c.ds)))
    importInfo=(inputSHA256=inputHash,graphSHA256=bytes2hex(sha256(read(joinpath(C3,"c3-spatial-near-audit-v1-native-graph.json"))))),cells=length(c.pref),layers=length(c.ds),edges=length(c.prefFace),hodgeResidual=split.relativeResidual,solenoidalNormFraction=hn(split.solenoidal)/hn(j),divergentNormFraction=hn(split.divergent)/hn(j),orthogonality=abs(sum(H.*split.divergent.*split.solenoidal.*transpose(c.ds)))/hn(j)^2)
    println(JSON3.write((preparedSeconds=m.modal.preparationSeconds,importInfo=importInfo)));flush(stdout)
    @test importInfo.hodgeResidual<1e-10
    @test importInfo.solenoidalNormFraction>.1
    referenceP,referenceJ=reference_flow(graph,c,initial,j,T)
    results=[];paths=[];name=ENV["WIND_RUN_NAME"];restartWanted=get(ENV,"WIND_RESTART","true")=="true"
    # Rebuild once from immutable geometry/reference inputs, including eigensolve.
    rebuilt=restartWanted ? FCTCore(ModalCore(graph_core(graph,initial.pref,initial.ds;radius=c.g.radius,c2=c.c2))) : nothing
    restartWanted&&(@test identity_hash(rebuilt)==identity_hash(m))
    for kind in kinds
        q=kind=="real" ? copy(initial.water) : kind=="constant" ? fill(.012,size(initial.water)) : hcat([.02Float64.(mod.(mesh.lon.+k*.43,2pi).<pi) for k in eachindex(c.ds)]...)
        s=State(initial.pressure,mass(c,initial.pressure).*q,j,0.);first=deepcopy(s);e0=energy(c,s)
        maxLocal=0.;qmin=minimum(q);qmax=maximum(q);constantError=0.;certmin=Inf;minP=minimum(s.p)
        verticalMax=0.;maxCentered=0.;limited=0;restart=nothing;restartEqual=true;resumedSteps=0;pressurePath=String[]
        started=time()
        for k in 1:steps
            if k==1
                a=acoustic_step(m.modal,s,dt);tr=shared_transfers(c,s.p,a.p,a.integratedJ)
                verticalMax=maximum(abs,tr.transfer[length(c.transferFrom)*length(c.ds)+1:end])
            end
            led=step!(m,s,dt) # one declared dt, no adaptive advance!/substeps
            maxLocal=max(maxLocal,led.localAirRelativeResidual,led.localWaterRelativeResidual,led.localDryRelativeResidual)
            qmin=min(qmin,led.qmin);qmax=max(qmax,led.qmax);certmin=min(certmin,led.minimumCertifiedRatio);minP=min(minP,minimum(s.p))
            maxCentered=max(maxCentered,led.centeredRelativeResidual);limited+=led.limitedEdges
            kind=="constant"&&(constantError=max(constantError,maximum(abs,s.W./mass(c,s.p).-0.012)))
            io=IOBuffer();serialize(io,(s.p,s.j));push!(pressurePath,bytes2hex(sha256(take!(io))))
            if restart!==nothing
                step!(rebuilt,restart,dt);resumedSteps+=1
                restartEqual &= s.p==restart.p&&s.W==restart.W&&s.j==restart.j&&s.time==restart.time
            end
            if restartWanted&&k==steps-4
                checkpoint=joinpath(OUT,name*"-"*kind*"-checkpoint.bin")
                save_checkpoint(checkpoint,m,s);restart=load_checkpoint(checkpoint,rebuilt)
            end
            if k==1||k%48==0||k==steps
                println(JSON3.write((case=kind,step=k,steps=steps,elapsedSeconds=time()-started,maxLocal=maxLocal)));flush(stdout)
            end
        end
        rms=sqrt(sum(c.g.area.*(s.p-referenceP).^2)/sum(c.g.area))
        jrms=sqrt(sum(c.g.edgeLength.*c.g.centerDistance.*vec(sum(((s.j-referenceJ)./c.prefFace).^2 .*transpose(c.ds);dims=2)))/sum(c.g.edgeLength.*c.g.centerDistance))
        gravity=Float64(data.gravityMps2);air=(sum(mass(c,s.p))-sum(mass(c,first.p)))/(4pi*gravity)
        water=(sum(s.W)-sum(first.W))/(4pi*gravity)
        row=(case=kind,steps=steps,accepted=steps,rejections=0,dt=dt,elapsedSeconds=time()-started,pressureTimeErrorPa=rms,momentumTimeErrorMps=jrms,relativeEnergyError=(energy(c,s)-e0)/e0,airDriftKgM2=air,waterDriftMm=water,dryDriftKgM2=air-water,maxLocalRelative=maxLocal,qmin=qmin,qmax=qmax,initialQmin=minimum(q),initialQmax=maximum(q),constantError=constantError,pmin=minP,minimumCertifiedRatio=certmin,verticalMax=verticalMax,restartBitwiseEqual=restartWanted ? restartEqual : nothing,resumedSteps=resumedSteps,centeredResidual=maxCentered,limitedEdgeSteps=limited)
        push!(results,row);push!(paths,pressurePath)
        serialize(joinpath(OUT,name*"-"*kind*"-final.bin"),(identity=identity_hash(m),state=s))
        write(joinpath(OUT,name*"-partial.json"),JSON3.write(results))
        @test rms<1e-6 && jrms<1e-7
        @test abs(row.relativeEnergyError)<1e-9
        @test abs(air)<1e-8 && abs(water)<1e-9 && abs(air-water)<1e-8
        @test maxLocal<5e-12
        @test qmin>=minimum(q)-1e-11 && qmax<=maximum(q)+1e-11
        @test constantError<1e-12
        @test verticalMax>0
        @test !restartWanted || (restartEqual&&resumedSteps==4)
        # Rejection must leave the full authoritative State bitwise unchanged.
        rejected=deepcopy(first);rejected.j .*=1e6;before=deepcopy(rejected)
        @test_throws StepRejected step!(m,rejected,dt)
        @test rejected.p==before.p&&rejected.W==before.W&&rejected.j==before.j&&rejected.time==before.time
    end
    @test all(p->p==paths[1],paths)
    @test bytes2hex(sha256(read(inputPath)))==inputHash
    write_result((scope="C4 native graph-wind fixed-reference acoustic/shared-water subsystem",passed=true,dt=dt,duration=T,c2=c.c2,importInfo=importInfo,results=results,samePressureAcrossTracers=all(p->p==paths[1],paths),fullPhysicalCoupling=false,climateAcceptance=false))
end
@testset "C4 native temporal and shared budgets" begin;main();end
