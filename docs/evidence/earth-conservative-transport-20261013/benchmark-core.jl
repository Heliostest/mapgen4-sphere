using Test,LinearAlgebra,JSON3
include("conservative-core.jl")
include("conservative-grid.jl")
using .ConservativeCore,.ConservativeGrid
BLAS.set_num_threads(1)
output=joinpath(@__DIR__,"../../../build/earth-conservative-transport")
name=get(ENV,"CORE_RUN_NAME","benchmark")

function waves()
    n=64;dx=2pi/n;x=collect(0:n-1)*dx;xf=x.+dx/2
    g=Geometry(fill(dx,n),collect(1:n),circshift(collect(1:n),-1),ones(n),fill(dx,n),1.)
    omega=2sin(dx/2)/dx;period=2pi/omega;eps=.01;results=[]
    for steps in (32,64,128,256)
        dt=period/steps;c=TransportCore(g,ones(n),[1.];c2=1.)
        p=1 .+ eps*cos.(x);s=State(p,.012mass(c,p),reshape(eps*cos.(xf),n,1),0.)
        trajectory=[];eold=energy(c,s);emax=0.;constantError=0.
        for k in 1:steps
            beforep=copy(s.p);beforej=copy(s.j);beforee=energy(c,s)
            step!(c,s,dt)
            loss=.5sum(g.area.*(s.p-beforep).^2)+.5sum(g.edgeLength.*g.centerDistance.*vec((s.j-beforej).^2))
            emax=max(emax,abs(energy(c,s)-beforee+loss))
            coefficient=2sum((s.p.-1).*exp.(-im*x))/n/eps
            exact=(1+im*omega*dt)^(-k)
            @test abs(coefficient-exact)<2e-12
            @test minimum(s.p)>0
            constantError=max(constantError,maximum(abs,s.W./mass(c,s.p).-0.012))
            k%(steps÷4)==0 && push!(trajectory,(time=s.time,phase=angle(coefficient),amplitude=abs(coefficient),exactBEPhase=angle(exact),exactBEAmplitude=abs(exact)))
        end
        coefficient=2sum((s.p.-1).*exp.(-im*x))/n/eps
        push!(results,(steps=steps,dt=dt,discreteFrequency=omega,continuumFrequency=1.,amplitude=abs(coefficient),phase=angle(coefficient),errorToUndampedDiscreteWave=abs(coefficient-1),continuumPressureL2=sqrt(sum((s.p.-(1 .+ eps*cos.(x.-period))).^2)/sum((eps*cos.(x)).^2)),energyFraction=energy(c,s)/eold,energyIdentityMaxResidual=emax,constantTracerMaxError=constantError,trajectory=trajectory))
        @test emax<1e-13
        @test constantError<1e-13
    end
    @test all(results[i+1].errorToUndampedDiscreteWave<results[i].errorToUndampedDiscreteWave for i in 1:3)
    @test -1.6<results[end].trajectory[1].phase< -1.5
    results
end

function rotation()
    results=[]
    for nr in (8,16,32,64)
        eig=eigen(SymTridiagonal(zeros(nr),[i/sqrt(4i^2-1) for i in 1:nr-1]))
        mu=eig.values;gw=2eig.vectors[1,:].^2;nc=2nr
        lat=repeat(rad2deg.(asin.(mu)),inner=nc);lon=repeat(collect(0:nc-1)*360/nc,nr)
        w=repeat(gw./(2nc),inner=nc);mesh=build_gaussian_mesh(lat,lon,w)
        m=mesh.area;q0=.01 .+ .008*cos.(mesh.lat).*cos.(mesh.lon);water=m.*q0
        nsteps=4nc;dt=2pi/nsteps;flux=zeros(length(mesh.from))
        for e in eachindex(flux)
            mesh.edgeKind[e]==:zonal && (flux[e]=dt*mesh.area[mesh.from[e]]/(2pi/nc))
        end
        # Exact integrated solid-body zonal mass flux, not interpolated acoustic j.
        # Gaussian ring mass / angular cell width keeps every row divergence-free.
        minq=minimum(q0);maxq=maximum(q0);residual=0.
        for k in 1:nsteps
            tr=transport_tracer(m,m,mesh.from,mesh.to,flux,water)
            water=tr.water;residual=max(residual,tr.localWaterResidual)
        end
        q=water./m
        relativeL2=sqrt(sum(m.*(q-q0).^2)/sum(m.*(q0.-.01).^2))
        push!(results,(rings=nr,longitudes=nc,cells=length(m),steps=nsteps,relativeL2=relativeL2,waterDrift=sum(water)-sum(m.*q0),qmin=minimum(q),qmax=maximum(q),initialQmin=minq,initialQmax=maxq,localWaterMaxResidual=residual))
        @test minimum(q)>=minq-1e-14
        @test maximum(q)<=maxq+1e-14
        @test abs(sum(water)-sum(m.*q0))<1e-12
    end
    @test all(results[i+1].relativeL2<results[i].relativeL2 for i in 1:3)
    results
end

@testset "propagating acoustics and measured BE diffusion" begin
    global wave=waves()
end
@testset "rigid zonal rotation under refinement" begin
    global rotating=rotation()
end
write(joinpath(output,name*".json"),JSON3.write((scope="generic acoustic graph and exact zonal rotation; not full native atmospheric coupling",waves=wave,rotation=rotating)))
println(JSON3.write((waveErrors=[v.errorToUndampedDiscreteWave for v in wave],rotationErrors=[v.relativeL2 for v in rotating])))
