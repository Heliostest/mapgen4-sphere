using LinearAlgebra,SparseArrays,JSON3,Test,SHA
include("../earth-conservative-transport-20261013/conservative-core.jl")
include("../earth-conservative-transport-20261013/conservative-grid.jl")
include("../earth-conservative-transport-20261013/mimetic-gradient.jl")
include("../earth-conservative-accuracy-20261013/modal-core.jl")
include("../earth-conservative-accuracy-20261013/fct-transport.jl")
include("../earth-conservative-accuracy-20261013/fct-core.jl")
using .ConservativeCore,.ConservativeGrid,.MimeticGradient,.ModalAcoustics,.FluxCorrectedTransport,.CoupledFCT
BLAS.set_num_threads(1)

function main()
    graph=JSON3.read(read(ARGS[1],String));gate=JSON3.read(read(ARGS[2],String))
    @test gate.spatialCandidateAccepted
    gate.spatialCandidateAccepted || error("spatial gate has not passed")
    bytes2hex(sha256(read(ARGS[1])))==gate.nativeGraphSha256 || error("graph does not match spatial gate")
    area=Float64.(graph.area);lat=Float64.(graph.lat);lon=Float64.(graph.lon)
    n=length(area);ds=[.2,.3,.5]
    # L=w*d is an EFFECTIVE graph metric, not an original geographic face.
    g=Geometry(area,graph.from,graph.to,graph.conductance.*graph.distance,graph.distance,1.)
    c=TransportCore(g,ones(n),ds;c2=1.,method=:fitted_graph)
    modal=ModalCore(c);fct=FCTCore(modal)
    native=JSON3.read(read("build/earth-speedy-transport/split-reference-seasonal-geometry.json",String))
    mesh=build_gaussian_mesh(native.latDegrees,native.lonDegrees,native.weights)
    @test area==mesh.area && lat==mesh.lat && lon==mesh.lon
    D=reconstruction_gradient(mesh);H=mesh.edgeLength.*mesh.centerDistance
    old=TransportCore(Geometry(mesh.area,mesh.from,mesh.to,mesh.edgeLength,mesh.centerDistance,1.),ones(n),ds;c2=1.,gradient=D,transport_pairs=pair_decomposition(D,H,1.),method=:variational)
    oldmodal=ModalCore(old)
    x=cos.(lat).*cos.(lon);y=cos.(lat).*sin.(lon);z=sin.(lat)
    t=(.37x+.53y+.76z)/norm([.37,.53,.76]);waves=[]
    for (name,field,lambda) in (("tilted-l1",(x+y+z)/sqrt(3.),2.),("l2",2x.*y,6.),("tilted-l3",(5t.^3-3t)/2,12.))
        for (method,base,m) in (("c2",old,oldmodal),("c3-graph",c,modal))
            p=1 .+.001field;s=State(p,.012mass(base,p),zeros(length(base.prefFace),3),0.)
            maxWave=0.;maxPolar=0.
            for phase in 1:8
                time=phase/8*2pi/sqrt(lambda);a=acoustic_step(m,s,time)
                err=(a.p.-1)/.001-field*cos(sqrt(lambda)*time)
                maxWave=max(maxWave,sqrt(sum(area.*err.^2)/sum(area.*field.^2)))
                maxPolar=max(maxPolar,maximum(abs,err[abs.(lat).>deg2rad(75.)]))
            end
            push!(waves,(;method,field=name,maxWave,maxPolar))
        end
    end
    println(JSON3.write((;waves)));flush(stdout)
    waveNonRegression=all(waves[i+1].maxWave<=waves[i].maxWave && waves[i+1].maxPolar<=waves[i].maxPolar for i in 1:2:length(waves))
    @test waveNonRegression
    field=2x.*y;p=1 .+.001field;steps=64;dt=2pi/sqrt(6.)/steps
    paths=Vector{Vector{Float64}}();cases=[]
    verticalMax=0.
    for (name,q) in (("constant",fill(.012,n,3)),("sharp",.02hcat(Float64.(x.>0),Float64.(y.>0),Float64.(z.>0))))
        j0=.0001*(c.gradient*x)*transpose([1.,-.5,2.])
        s=State(copy(p),mass(c,p).*q,j0,0.);initial=deepcopy(s)
        e0=energy(c,s);water0=sum(s.W);air0=sum(mass(c,s.p));localMax=0.;qerror=0.;pathError=0.;discreteError=0.;qmin=Inf;qmax=-Inf;iterations=0;limited=0
        restart=nothing
        for k in 1:steps
            if k==1
                a=acoustic_step(modal,s,dt);tr=shared_transfers(c,s.p,a.p,a.integratedJ)
                verticalMax=max(verticalMax,maximum(abs,tr.transfer[3length(c.transferFrom)+1:end]))
            end
            led=step!(fct,s,dt)
            localMax=max(localMax,led.localAirRelativeResidual,led.localWaterRelativeResidual,led.localDryRelativeResidual)
            qmin=min(qmin,led.qmin);qmax=max(qmax,led.qmax);iterations=max(iterations,led.centeredIterations);limited+=led.limitedEdges
            @test minimum(s.W)>=0 && maximum(s.W./mass(c,s.p))<=.02+1e-13
            if name=="constant"
                push!(paths,copy(s.p));qerror=max(qerror,maximum(abs,s.W./mass(c,s.p).-0.012))
            else
                pathError=max(pathError,maximum(abs,s.p-paths[k]))
            end
            if k%8==0
                exact=acoustic_step(modal,initial,k*dt)
                discreteError=max(discreteError,maximum(abs,s.p-exact.p))
            end
            if k==32
                file="build/earth-polar-pressure/"*ENV["POLAR_RUN_NAME"]*"-"*name*"-restart.bin"
                isfile(file) && error("checkpoint exists")
                save_checkpoint(file,fct,s)
                rebuilt=FCTCore(ModalCore(c));restart=load_checkpoint(file,rebuilt)
                step!(rebuilt,restart,dt)
            elseif k==33
                @test s.p==restart.p && s.W==restart.W && s.j==restart.j && s.time==restart.time
            end
        end
        row=(;name,steps,localMax,qmin,qmax,qerror,pathError,discreteError,iterations,limited,relativeEnergyError=(energy(c,s)-e0)/e0,waterDrift=sum(s.W)-water0,airDrift=sum(mass(c,s.p))-air0)
        @test localMax<5e-12
        @test qerror<1e-12
        @test pathError==0
        @test discreteError<1e-12
        @test abs(row.relativeEnergyError)<1e-9
        @test abs(row.waterDrift)<1e-12 && abs(row.airDrift)<1e-12
        push!(cases,row);println(JSON3.write(row));flush(stdout)
    end
    @test verticalMax>1e-12
    pref=1 .+.2z;variable=TransportCore(g,pref,ds;c2=1.,method=:fitted_graph)
    vm=FCTCore(ModalCore(variable));s=State(pref,.012mass(variable,pref),zeros(length(variable.prefFace),3),0.);initial=deepcopy(s)
    for _ in 1:8;step!(vm,s,.25);end
    equilibriumError=max(maximum(abs,s.p-initial.p),maximum(abs,s.j-initial.j),maximum(abs,s.W-initial.W))
    @test equilibriumError<1e-13
    output="build/earth-polar-pressure/"*ENV["POLAR_RUN_NAME"]*".json"
    isfile(output) && error("output exists")
    write(output,JSON3.write((;scope="Manufactured waves and shared mass/water stepping with unequal layer momenta and nonzero vertical transfers. No native wind import or primitive-equation integration.",cells=n,edges=length(g.from),waves,cases,equilibriumError,verticalMax,waveNonRegression,spatialGate=true)))
end
@testset "C3 graph acoustic and shared FCT coupling" begin;main();end
