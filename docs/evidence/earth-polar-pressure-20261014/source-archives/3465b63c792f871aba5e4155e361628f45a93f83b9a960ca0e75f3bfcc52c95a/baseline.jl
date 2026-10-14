using LinearAlgebra, SparseArrays, JSON3, Test
include("../earth-conservative-transport-20261013/conservative-grid.jl")
include("../earth-conservative-transport-20261013/mimetic-gradient.jl")
using .ConservativeGrid, .MimeticGradient
BLAS.set_num_threads(1)

function mesh_at(nr, full=false)
    if nr==48 && !full
        d=JSON3.read(read("build/earth-speedy-transport/split-reference-seasonal-geometry.json",String))
        return build_gaussian_mesh(d.latDegrees,d.lonDegrees,d.weights)
    end
    e=eigen(SymTridiagonal(zeros(nr),[i/sqrt(4i^2-1) for i in 1:nr-1]))
    lat=Float64[];lon=Float64[];weights=Float64[]
    for r in 1:nr
        n=full ? 2nr : 20+4min(r-1,nr-r)
        append!(lat,fill(rad2deg(asin(e.values[r])),n))
        append!(lon,collect(0:n-1)*360/n)
        append!(weights,fill(e.vectors[1,r]^2/n,n))
    end
    build_gaussian_mesh(lat,lon,weights)
end

function main()
    cases=[]
    for full in (false,true), nr in (12,24,48,96)
        mesh=mesh_at(nr,full); D=reconstruction_gradient(mesh)
        K=D'*Diagonal(mesh.edgeLength.*mesh.centerDistance)*D
        x=cos.(mesh.lat).*cos.(mesh.lon);y=cos.(mesh.lat).*sin.(mesh.lon);z=sin.(mesh.lat)
        polar=abs.(mesh.lat).>deg2rad(75.); metrics=[]
        for (name,f,lambda) in (("x",x,2.),("y",y,2.),("z",z,2.),("xy",x.*y,6.),("xz",x.*z,6.),("3z2-1",3z.^2 .- 1,6.))
            err=(K*f)./mesh.area-lambda*f
            ringMax=[maximum(abs,err[mesh.ringIndex.==r]) for r in 1:nr]
            push!(metrics,(;name,relativeL2=sqrt(sum(mesh.area.*err.^2)/sum(mesh.area.*(lambda*f).^2)),polarMax=maximum(abs,err[polar]),maxError=maximum(abs,err),ringMax))
        end
        @test norm(K-K')<1e-12*norm(K)
        @test maximum(abs,K*ones(length(x)))<1e-11
        row=(;full,rings=nr,cells=length(x),metrics)
        println(JSON3.write(row));flush(stdout)
        push!(cases,(;row...,area=mesh.area,lat=mesh.lat,lon=mesh.lon))
    end
    reduced=filter(c->!c.full,cases)
    @test reduced[4].metrics[1].polarMax>reduced[3].metrics[1].polarMax
    output="build/earth-polar-pressure/"*ENV["POLAR_RUN_NAME"]*".json"
    isfile(output) && error("output exists")
    write(output,JSON3.write((;scope="Frozen C2 spatial operator: full versus reduced Gaussian rings",cases)))
end
@testset "C3 baseline and reproduced defect" begin;main();end
