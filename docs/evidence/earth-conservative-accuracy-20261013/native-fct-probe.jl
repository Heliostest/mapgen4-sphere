using Test,LinearAlgebra,SparseArrays,Serialization,JSON3,SHA
include("../earth-conservative-transport-20261013/conservative-core.jl")
include("../earth-conservative-transport-20261013/conservative-grid.jl")
include("../earth-conservative-transport-20261013/mimetic-gradient.jl")
include("modal-core.jl")
include("fct-transport.jl")
include("fct-core.jl")
using .ConservativeCore,.ConservativeGrid,.MimeticGradient,.ModalAcoustics,.FluxCorrectedTransport,.CoupledFCT
BLAS.set_num_threads(1)
const OUT=joinpath(@__DIR__,"../../../build/earth-conservative-accuracy")
function main()
    name=ENV["ACCURACY_RUN_NAME"];dt=parse(Float64,get(ENV,"ACCURACY_DT","1800"));days=parse(Float64,get(ENV,"ACCURACY_DAYS","3"))
    isfinite(dt)&&dt>0&&isfinite(days)&&days>0 || throw(ArgumentError("positive finite duration and dt required"))
    steps=round(Int,days*86400/dt)
    steps>=3&&isapprox(steps*dt,days*86400;atol=1e-8,rtol=0) || throw(ArgumentError("need at least three integral steps"))
    kinds=split(get(ENV,"ACCURACY_CASES","real"),',')
    !isempty(kinds)&&all(k->k in ("real","constant","sharp"),kinds)&&length(unique(kinds))==length(kinds) || throw(ArgumentError("invalid or duplicate cases"))
    initial=deserialize(joinpath(@__DIR__,"../../../build/earth-conservative-transport/candidate-c1-native-1800-import.bin"))
    data=JSON3.read(read(joinpath(@__DIR__,"../../../build/earth-speedy-transport/split-reference-seasonal-geometry.json"),String))
    mesh=build_gaussian_mesh(data.latDegrees,data.lonDegrees,data.weights);R=Float64(data.radiusM)
    D=reconstruction_gradient(mesh);H=mesh.edgeLength.*mesh.centerDistance;pairs=pair_decomposition(D,H,R)
    g=Geometry(mesh.area,mesh.from,mesh.to,mesh.edgeLength,mesh.centerDistance,R)
    c=TransportCore(g,initial.pref,initial.ds;c2=287.04*288,gradient=D/R,transport_pairs=pairs,method=:variational)
    m=FCTCore(ModalCore(c));println(JSON3.write((preparedSeconds=m.modal.preparationSeconds,bytes=Base.summarysize(m),cells=length(c.pref))));flush(stdout)
    j=zeros(length(mesh.from),length(initial.ds))
    for k in eachindex(initial.ds)
        j[:,k]=(initial.pressure[mesh.from]+initial.pressure[mesh.to])/2 .* sample_native_velocity(mesh,initial.u[:,k],initial.v[:,k])
    end
    # Independent assembly/evaluation of the continuous-time final pressure and
    # momentum. No stepping, shared-transfer, or cumulative-flux code is reused.
    sm=sqrt.(mesh.area.*initial.pref);pf=(initial.pref[mesh.from]+initial.pref[mesh.to])/2
    S=c.c2*Diagonal(1 ./sm)*(D'*Diagonal(H.*pf)*D)/R^2*Diagonal(1 ./sm)
    eig=eigen(Symmetric(Matrix(S)));omega=sqrt.(max.(eig.values,0.));null=abs.(eig.values).<=1e-12*maximum(abs,eig.values)
    rbar=sum(mesh.area.*initial.pressure)/sum(sm.^2)
    a=eig.vectors'*(sm.*(initial.pressure./initial.pref.-rbar));b=eig.vectors'*(-D'*(H.*(j*initial.ds))/R./sm)
    T=days*86400;z=similar(a);integral=similar(a)
    for i in eachindex(a)
        if null[i];z[i]=a[i]+T*b[i];integral[i]=T*a[i]+T^2/2*b[i]
        else;w=omega[i];z[i]=cos(w*T)*a[i]+sin(w*T)/w*b[i];integral[i]=sin(w*T)/w*a[i]+(1-cos(w*T))/w^2*b[i];end
    end
    referenceP=initial.pref.*(rbar.+(eig.vectors*z)./sm)
    referenceJ=j.+c.c2*pf.*(D*((eig.vectors*integral)./sm))/R
    results=[];trajectories=[]
    for kind in kinds
        q=kind=="real" ? initial.water : kind=="constant" ? fill(.012,size(initial.water)) : repeat(Float64.(data.lonDegrees.<180)*.02,1,length(initial.ds))
        s=State(copy(initial.pressure),mass(c,initial.pressure).*q,copy(j),0.);first=deepcopy(s);e0=energy(c,s)
        maxAir=0.;maxWater=0.;maxDry=0.;constantError=0.;qmin=minimum(q);qmax=maximum(q);certmin=Inf;certchecks=0;accepted=0;rejections=0;minimumDt=dt
        restart=nothing;restartEqual=true;started=time();pressurePath=String[]
        for k in 1:steps
            result=advance!(m,s,dt);accepted+=length(result.steps);rejections+=result.rejections
            for led in result.steps
                maxAir=max(maxAir,led.localAirRelativeResidual);maxWater=max(maxWater,led.localWaterRelativeResidual);maxDry=max(maxDry,led.localDryRelativeResidual)
                qmin=min(qmin,led.qmin);qmax=max(qmax,led.qmax);certmin=min(certmin,led.minimumCertifiedRatio);certchecks+=led.positivityChecks;minimumDt=min(minimumDt,led.dt)
            end
            kind=="constant"&&(constantError=max(constantError,maximum(abs,s.W./mass(c,s.p).-0.012)))
            io=IOBuffer();serialize(io,(s.p,s.j));push!(pressurePath,bytes2hex(sha256(take!(io))))
            if restart!==nothing
                advance!(m,restart,dt);restartEqual &= s.p==restart.p&&s.j==restart.j&&s.W==restart.W&&s.time==restart.time
            end
            if k==steps-2
                path=joinpath(OUT,name*"-"*kind*"-checkpoint.bin");save_checkpoint(path,m,s);restart=load_checkpoint(path,m)
            end
            if k==1||k%48==0||k==steps
                println(JSON3.write((case=kind,step=k,steps=steps,accepted=accepted,rejections=rejections,elapsedSeconds=time()-started,waterDriftMm=(sum(s.W)-sum(first.W))/(4pi*9.81))));flush(stdout)
            end
        end
        rms=sqrt(sum(mesh.area.*(s.p-referenceP).^2)/sum(mesh.area))
        jrms=sqrt(sum(H.*vec(sum(((s.j-referenceJ)./pf).^2 .* transpose(c.ds),dims=2)))/sum(H))
        row=(case=kind,steps=steps,accepted=accepted,rejections=rejections,minimumDt=minimumDt,elapsedSeconds=time()-started,pressureTimeErrorPa=rms,momentumTimeErrorMps=jrms,relativeEnergyError=(energy(c,s)-e0)/e0,airDriftKgM2=(sum(mass(c,s.p))-sum(mass(c,first.p)))/(4pi*9.81),waterDriftMm=(sum(s.W)-sum(first.W))/(4pi*9.81),maxLocalAirRelative=maxAir,maxLocalWaterRelative=maxWater,maxLocalDryRelative=maxDry,qmin=qmin,qmax=qmax,constantError=constantError,restartBitwiseEqual=restartEqual,minimumCertifiedRatio=certmin,positivityCertificateChecks=certchecks)
        push!(results,row);push!(trajectories,pressurePath)
        serialize(joinpath(OUT,name*"-"*kind*"-final.bin"),(identity=identity_hash(m),state=s))
        write(joinpath(OUT,name*"-partial.json"),JSON3.write(results))
        @test rms<1e-6
        @test jrms<1e-7
        @test abs(row.relativeEnergyError)<1e-9
        @test abs(row.airDriftKgM2)<1e-8
        @test abs(row.waterDriftMm)<1e-9
        @test max(maxAir,maxWater,maxDry)<5e-12
        @test qmin>=0 && qmax<=maximum(q)+1e-11
        @test constantError<1e-12
        @test restartEqual
    end
    samePressure=all(p->p==trajectories[1],trajectories)
    @test samePressure
    write(joinpath(OUT,name*".json"),JSON3.write((scope="Fixed-reference linear acoustic subsystem with shared sigma/flux-corrected water; not full climate dynamics",dt=dt,days=days,cells=length(c.pref),layers=length(c.ds),preparationSeconds=m.modal.preparationSeconds,coreBytes=Base.summarysize(m),sampledEigenResidual=m.modal.eigenResidual,samePressureAcrossTracers=samePressure,results=results,fullPhysicalCoupling=false,polarAccuracy=false,climateAcceptance=false)))
end
@testset "native C2 pressure time accuracy and shared water" begin;main();end
