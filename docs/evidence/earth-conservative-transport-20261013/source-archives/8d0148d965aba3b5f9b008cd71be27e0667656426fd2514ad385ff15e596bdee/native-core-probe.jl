# Import only. No native timestep, SST/mass correction context, or writes to old evidence.
include("../earth-speedy-transport-20261013/transport-v3-model.jl")
include("../earth-speedy-transport-20261013/scalar-initial-projection.jl")
include("../earth-speedy-transport-20261013/wet-carrier-prototype.jl")
include("conservative-grid.jl")
include("conservative-core.jl")
using .ScalarInitialProjection,.ConservativeGrid,.ConservativeCore,.NativeWetCarrier
using Dates,JSON3,LinearAlgebra,Test,Serialization
BLAS.set_num_threads(1)
const CORE_OUT=joinpath(@__DIR__,"../../../build/earth-conservative-transport")

function inventories(c,s,g)
    ma=mass(c,s.p);q=s.W./ma
    (airKgM2=sum(ma)/(4pi*g),waterMm=sum(s.W)/(4pi*g),dryKgM2=sum(ma-s.W)/(4pi*g),qmin=minimum(q),qmax=maximum(q),pmin=minimum(s.p),pmax=maximum(s.p))
end

function main()
    name=get(ENV,"CORE_RUN_NAME","native");days=parse(Float64,get(ENV,"CORE_DAYS","3"));dt=parse(Float64,get(ENV,"CORE_DT","1800"))
    sg=SpectralGrid(NF=Float64,truncation=32,nlayers=8);m=transport_model(sg,"seasonal")
    sim=apply_frozen_initial!(initialize!(m;time=DateTime(2001,1,1)))
    projection=project_scalar_initial!(sim.variables,m;source_sha=bytes2hex(sha256(read(INITIAL_PATH))),
        stationary_history_fields=(:temperature,:pressure,:vorticity,:divergence),
        stationary_history_evidence="frozen readonly-scalar-auxiliary.json stationary auxiliary provenance",matching_history_fields=(:humidity,))
    SW.initialize!(sim;period=Day(3),output=false);m.dynamics_only=true
    v=sim.variables;weights=native_weights(m);ds=Float64.(m.geometry.σ_levels_thick);gravity=Float64(m.planet.gravity)
    @test !haskey(MASS_CONTEXTS,m)&&!haskey(SST_CONTEXTS,m)
    @test assert_scalar_auxiliary_zero(v,m)
    nativeBefore=stock_hash(v)
    p=exp.(vec(SW.get_step(v.grid.pressure,2).data));q=copy(SW.get_step(v.grid.humidity,2).data)
    mesh=build_gaussian_mesh(m.geometry.latds,m.geometry.londs,weights)
    geometry=Geometry(mesh.area,mesh.from,mesh.to,mesh.edgeLength,mesh.centerDistance,m.planet.radius)
    c2=Float64(m.atmosphere.R_dry)*288
    pref=1e5exp.(-gravity.*vec(m.orography.orography.data)./c2)
    c=TransportCore(geometry,pref,ds;c2)
    u=SW.get_step(v.grid.u,2).data;windv=SW.get_step(v.grid.v,2).data
    j=zeros(length(mesh.from),length(ds))
    for k in eachindex(ds)
        j[:,k]=(p[mesh.from]+p[mesh.to])/2 .* sample_native_velocity(mesh,u[:,k],windv[:,k])
    end
    initial=(pressure=copy(p),water=copy(q),u=copy(u),v=copy(windv),pref=copy(pref),ds=copy(ds))
    serialize(joinpath(CORE_OUT,name*"-import.bin"),initial)
    rows=[];cases=[];duration=days*86400
    caseNames=split(get(ENV,"CORE_CASES","real,constant,sharp"),',')
    for kind in caseNames
        inputq=kind=="real" ? copy(q) : kind=="constant" ? fill(.012,size(q)) : repeat(Float64.(m.geometry.londs.<180)*.02,1,length(ds))
        s=State(copy(p),mass(c,p).*inputq,copy(j),0.);start=inventories(c,s,gravity)
        maxes=Dict(k=>0. for k in (:airResidual,:waterResidual,:dryResidual,:localAirResidual,:localWaterResidual,:bottomResidual,:pressureResidual,:tracerLinearResidual))
        accepted=0;rejected=0;mind=dt;allqmin=minimum(inputq);allqmax=maximum(inputq);constantError=0.;restarted=nothing;restartEqual=true
        steps=round(Int,duration/dt);@assert isapprox(steps*dt,duration;atol=1e-9)
        for k in 1:steps
            led=advance!(c,s,dt);accepted+=length(led.steps);rejected+=led.rejections
            for item in led.steps
                mind=min(mind,item.dt);allqmin=min(allqmin,item.qmin);allqmax=max(allqmax,item.qmax)
                for key in keys(maxes);maxes[key]=max(maxes[key],getproperty(item,key));end
            end
            kind=="constant" && (constantError=max(constantError,maximum(abs,s.W./mass(c,s.p).-0.012)))
            if restarted!==nothing
                advance!(c,restarted,dt)
                restartEqual &= s.p==restarted.p && s.W==restarted.W && s.j==restarted.j && s.time==restarted.time
            end
            if k==max(1,steps-2)
                file=joinpath(CORE_OUT,name*"-"*kind*"-checkpoint.bin")
                save_checkpoint(file,c,s);restarted=load_checkpoint(file,c)
            end
            if k==1 || k%24==0 || k==steps
                stock=inventories(c,s,gravity)
                push!(rows,(case=kind,macroStep=k,time=s.time,stock=stock,waterDriftMm=stock.waterMm-start.waterMm,airDriftKgM2=stock.airKgM2-start.airKgM2,accepted=accepted,rejected=rejected))
                println(JSON3.write(last(rows)));flush(stdout)
            end
        end
        final=inventories(c,s,gravity)
        shadow=CarrierState(s.p,s.W./(mesh.area*transpose(ds)))
        copyProjection=projection_diagnostics(shadow,v,m,weights;truncate=true)
        result=(case=kind,initial=start,final=final,airDriftKgM2=final.airKgM2-start.airKgM2,waterDriftMm=final.waterMm-start.waterMm,dryDriftKgM2=final.dryKgM2-start.dryKgM2,accepted=accepted,rejections=rejected,minimumAcceptedDt=mind,qminEveryStep=allqmin,qmaxEveryStep=allqmax,constantTracerMaxError=constantError,maxResiduals=maxes,restartBitwiseEqual=restartEqual,diagnosticSpectralProjection=copyProjection)
        push!(cases,result)
        serialize(joinpath(CORE_OUT,name*"-"*kind*"-final.bin"),(identity=identity_hash(c),state=s))
        write(joinpath(CORE_OUT,name*"-partial.json"),JSON3.write((rows=rows,cases=cases)))
        @test abs(result.airDriftKgM2)<1e-8
        @test abs(result.waterDriftMm)<1e-9
        @test abs(result.dryDriftKgM2)<1e-8
        @test result.qminEveryStep>=0
        @test result.qmaxEveryStep<=maximum(inputq)+1e-11
        @test constantError<1e-12
        @test restartEqual
    end
    @test stock_hash(v)==nativeBefore
    result=(scope="SOURCE-FREE GRAPH SUBSYSTEM ONLY: fixed isothermal topography potential, persistent linear acoustic edge flux, sigma redistribution; no native primitive-equation stepping or climate acceptance",operator="original reduced-ring TPFA; known nonzonal spherical consistency failure",days=days,nominalStepSeconds=dt,ncells=length(p),nlayers=length(ds),ds=ds,c2=c2,nativeImportSHA=nativeBefore,nativeImportUnchanged=stock_hash(v)==nativeBefore,initialProjection=projection,physicsSources=false,climateAcceptance=false,physicalSphereAcceptance=false,rows=rows,cases=cases)
    write(joinpath(CORE_OUT,name*".json"),JSON3.write(result))
    println(JSON3.write((completed=true,cases=length(cases),waterDrifts=[r.waterDriftMm for r in cases])))
end
main()
