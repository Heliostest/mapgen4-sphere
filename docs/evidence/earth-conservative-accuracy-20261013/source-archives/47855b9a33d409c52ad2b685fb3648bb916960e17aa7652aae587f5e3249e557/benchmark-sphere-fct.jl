using Test,LinearAlgebra,JSON3
include("../earth-conservative-transport-20261013/conservative-core.jl")
include("../earth-conservative-transport-20261013/conservative-grid.jl")
include("fct-transport.jl")
using .ConservativeCore,.ConservativeGrid,.FluxCorrectedTransport
BLAS.set_num_threads(1)
function reduced_mesh(nr)
    e=eigen(SymTridiagonal(zeros(nr),[i/sqrt(4i^2-1) for i in 1:nr-1]))
    lat=Float64[];lon=Float64[];w=Float64[]
    for r in 1:nr
        nc=20+4min(r-1,nr-r)
        append!(lat,fill(rad2deg(asin(e.values[r])),nc));append!(lon,collect(0:nc-1)*(360/nc))
        append!(w,fill(e.vectors[1,r]^2/nc,nc))
    end
    build_gaussian_mesh(lat,lon,w)
end
function main()
    rows=[]
    for axis in ("axial","tilted"),nr in (12,24,48)
        mesh=reduced_mesh(nr);n=length(mesh.area)
        psi(phi,lambda)=axis=="tilted" ? cos(phi)*cos(lambda) : sin(phi)
        rate=zeros(length(mesh.from))
        for e in eachindex(rate)
            if mesh.edgeKind[e]==:zonal
                lo=mesh.edgeLat[e]-mesh.edgeLength[e]/2;hi=mesh.edgeLat[e]+mesh.edgeLength[e]/2
                rate[e]=psi(hi,mesh.edgeLon[e])-psi(lo,mesh.edgeLon[e])
            else
                width=mesh.edgeLength[e]/cos(mesh.edgeLat[e]);lo=mesh.edgeLon[e]-width/2;hi=mesh.edgeLon[e]+width/2
                rate[e]=psi(mesh.edgeLat[e],lo)-psi(mesh.edgeLat[e],hi)
            end
        end
        div=zeros(n)
        for e in eachindex(rate);div[mesh.from[e]]+=rate[e];div[mesh.to[e]]-=rate[e];end
        @test maximum(abs,div)<3e-14
        mass=mesh.area;q0=axis=="tilted" ? .01 .+.008sin.(mesh.lat) : .01 .+.008cos.(mesh.lat).*cos.(mesh.lon)
        water=mass.*q0;steps=8nr;dt=2pi/steps;maxLocal=0.;qmin=minimum(q0);qmax=maximum(q0);limits=0;started=time()
        for k in 1:steps
            tr=transport_fct(mass,mass,mesh.from,mesh.to,dt*rate,water);water=tr.water
            maxLocal=max(maxLocal,tr.localWaterRelativeResidual);qmin=min(qmin,minimum(water./mass));qmax=max(qmax,maximum(water./mass));limits+=tr.limitedEdges
        end
        error=sqrt(sum(mass.*(water./mass-q0).^2)/sum(mass.*(q0.-.01).^2))
        row=(axis=axis,rings=nr,cells=n,steps=steps,relativeL2=error,waterDrift=sum(water)-sum(mass.*q0),qmin=qmin,qmax=qmax,maxLocalWaterRelative=maxLocal,limitedEdgeSteps=limits,elapsedSeconds=time()-started)
        push!(rows,row);println(JSON3.write(row));flush(stdout)
        @test abs(row.waterDrift)<1e-11
        @test qmin>=minimum(q0)-1e-13 && qmax<=maximum(q0)+1e-13
        @test maxLocal<5e-12
    end
    for axis in ("axial","tilted")
        selected=filter(r->r.axis==axis,rows)
        @test all(selected[i+1].relativeL2<selected[i].relativeL2 for i in 1:2)
        @test selected[end].relativeL2<.1
    end
    name=ENV["ACCURACY_RUN_NAME"]
    write(joinpath(@__DIR__,"../../../build/earth-conservative-accuracy",name*".json"),JSON3.write((scope="Analytic geographic-face rigid rotation; not accuracy proof for reconstructed expanded adjacency",rows=rows)))
end
@testset "sphere FCT axial and polar-crossing rotation" begin;main();end
