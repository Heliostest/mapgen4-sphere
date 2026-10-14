# Standalone shared-carrier finite-volume experiment; no model override or integration.
using Test,JSON3,LinearAlgebra,SpeedyWeather
const SW=SpeedyWeather
include("implicit-corrected.jl")

function paired_step(m,q,Fh,ds,dt)
    n,nz=size(q)
    H=[Fh[i,k]-Fh[mod1(i-1,n),k] for i=1:n,k=1:nz]
    column_rate=-vec(sum(H,dims=2))
    air_rate=column_rate*ds'
    Fv=zeros(n,nz+1)
    for i=1:n,k=1:nz
        Fv[i,k+1]=Fv[i,k]-H[i,k]-air_rate[i,k]
    end
    @assert maximum(abs,Fv[:,end])<1e-17
    Fv[:,end].=0
    Qh=[Fh[i,k]*(Fh[i,k]>=0 ? q[i,k] : q[mod1(i+1,n),k]) for i=1:n,k=1:nz]
    Qv=zeros(n,nz+1)
    for i=1:n,k=1:nz-1
        Qv[i,k+1]=Fv[i,k+1]*(Fv[i,k+1]>=0 ? q[i,k] : q[i,k+1])
    end
    Qrate=[-(Qh[i,k]-Qh[mod1(i-1,n),k]+Qv[i,k+1]-Qv[i,k]) for i=1:n,k=1:nz]
    mnew=m+dt*air_rate
    Qnew=m.*q+dt*Qrate
    (;mnew,Qnew,qnew=Qnew./mnew,air_rate,Fv)
end

function main()
    n=8;ds=[.1,.3,.6];x=2pi .* ((1:n) .- 0.5) ./ n
    m=(10000 .* (1 .+ 0.15 .* sin.(x)))*ds'
    Fh=[.01*(1+.2k)*ds[k]*sin(2pi*i/n) for i=1:n,k=1:3]
    records=Any[]
    @testset "shared carrier flux transports water without a residual compensation" begin
        for dt in (1800.,3600.),constant in (true,false)
            q=constant ? fill(.012,n,3) : [.006+.003cos(x[i])+.002k for i=1:n,k=1:3]
            r=paired_step(m,q,Fh,ds,dt)
            airError=sum(r.mnew)-sum(m)
            waterError=sum(r.Qnew)-sum(m.*q)
            unpairedError=sum(r.mnew.*q)-sum(m.*q)
            logPressureError=sum(m.*exp.(dt.*r.air_rate./m))-sum(m)
            @test abs(airError)<1e-10
            @test abs(waterError)<1e-10
            @test minimum(r.mnew)>0
            @test minimum(r.qnew)>=minimum(q)-1e-15
            @test maximum(r.qnew)<=maximum(q)+1e-15
            @test maximum(abs,r.Qnew-m.*q)>1e-3 # wet mass is transported, not fixed pointwise
            @test logPressureError>0 # an exact closed flux cannot match this nonzero mean
            if constant
                @test r.qnew≈q atol=1e-16 rtol=0
            else
                @test abs(unpairedError)>0.01
                @test maximum(abs,r.qnew-q)>1e-7
            end
            push!(records,(;dt,constant,airError,waterError,unpairedError,logPressureError,
                maxLocalWetMassChange=maximum(abs,r.Qnew-m.*q)))
        end
        # The corresponding linear vertical operator obeys the carrier identity.
        half=cumsum([0.;ds]);qbar=[.002,.01,.02]
        H=background_advection_matrix(qbar,half,ds)
        @test vec(ds'*H)≈dot(ds,qbar).*ds.-ds.*qbar atol=1e-16 rtol=0
        @test background_advection_matrix(fill(.01,3),half,ds)==zeros(3,3)
        @test H*ones(3)≈zeros(3) atol=1e-16 rtol=0
    end
    println(JSON3.write(records))
    open(io->JSON3.write(io,(;description="Closed periodic 8-column/3-layer finite-volume toy; NOT a SpeedyWeather integration or proposed pointwise p*q correction",records)),
        "build/earth-speedy-transport/implicit-flux-prototype.json","w")
end
main()
