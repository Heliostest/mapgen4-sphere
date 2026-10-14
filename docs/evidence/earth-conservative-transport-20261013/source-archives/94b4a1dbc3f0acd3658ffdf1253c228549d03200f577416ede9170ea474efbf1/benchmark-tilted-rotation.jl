using Test,LinearAlgebra,JSON3
include("conservative-core.jl")
include("conservative-grid.jl")
using .ConservativeCore,.ConservativeGrid
BLAS.set_num_threads(1)
function reduced_mesh(nr)
    e=eigen(SymTridiagonal(zeros(nr),[i/sqrt(4i^2-1) for i in 1:nr-1]))
    lat=Float64[];lon=Float64[];w=Float64[]
    for r in 1:nr
        nc=16+4min(r-1,nr-r)
        append!(lat,fill(rad2deg(asin(e.values[r])),nc))
        append!(lon,collect(0:nc-1)*(360/nc))
        append!(w,fill(e.vectors[1,r]^2/nc,nc))
    end
    build_gaussian_mesh(lat,lon,w)
end
function main()
    rows=[]
    for nr in (12,24,48,96)
        mesh=reduced_mesh(nr);n=length(mesh.area)
        # Rotation about equatorial x axis: streamfunction psi=cos(phi)*cos(lambda).
        # Integrating endpoint differences gives shared analytic fluxes with
        # zero divergence on every geographic finite-volume cell, including
        # split meridional faces. This tests transport, not velocity sampling.
        psi(phi,lambda)=cos(phi)*cos(lambda)
        rate=zeros(length(mesh.from))
        for e in eachindex(rate)
            if mesh.edgeKind[e]==:zonal
                lo=mesh.edgeLat[e]-mesh.edgeLength[e]/2
                hi=mesh.edgeLat[e]+mesh.edgeLength[e]/2
                rate[e]=psi(hi,mesh.edgeLon[e])-psi(lo,mesh.edgeLon[e])
            else
                width=mesh.edgeLength[e]/cos(mesh.edgeLat[e])
                lo=mesh.edgeLon[e]-width/2;hi=mesh.edgeLon[e]+width/2
                rate[e]=psi(mesh.edgeLat[e],lo)-psi(mesh.edgeLat[e],hi)
            end
        end
        divergence=zeros(n)
        for e in eachindex(rate)
            divergence[mesh.from[e]]+=rate[e];divergence[mesh.to[e]]-=rate[e]
        end
        @test maximum(abs,divergence)<3e-14
        mass=mesh.area;q0=.01 .+ .008sin.(mesh.lat);water=mass.*q0
        steps=8nr;dt=2pi/steps;maxLocal=0.;qmin=minimum(q0);qmax=maximum(q0)
        for step in 1:steps
            tr=transport_tracer(mass,mass,mesh.from,mesh.to,dt*rate,water)
            water=tr.water;maxLocal=max(maxLocal,tr.localWaterResidual)
            qmin=min(qmin,minimum(water./mass));qmax=max(qmax,maximum(water./mass))
        end
        error=sqrt(sum(mass.*(water./mass-q0).^2)/sum(mass.*(q0.-.01).^2))
        item=(rings=nr,cells=n,steps=steps,relativeL2=error,waterDrift=sum(water)-sum(mass.*q0),qmin=qmin,qmax=qmax,maxLocalWaterResidual=maxLocal,analyticDivergenceResidual=maximum(abs,divergence))
        push!(rows,item);println(JSON3.write(item));flush(stdout)
        @test abs(item.waterDrift)<1e-11
        @test qmin>=minimum(q0)-1e-13
        @test qmax<=maximum(q0)+1e-13
    end
    @test all(rows[i+1].relativeL2<rows[i].relativeL2 for i in 1:3)
    name=get(ENV,"CORE_RUN_NAME","tilted-rotation")
    write(joinpath(@__DIR__,"../../../build/earth-conservative-transport",name*".json"),JSON3.write((scope="implicit upwind transport under exact geographic-face tilted rigid rotation; separate from acoustic reconstructed adjacency",rows=rows)))
end
@testset "tilted sphere rotation and native-shaped reduced rings" begin
    main()
end
