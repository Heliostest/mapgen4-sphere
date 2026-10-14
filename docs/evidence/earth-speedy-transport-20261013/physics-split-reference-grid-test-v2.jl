# Independent actual-field review. Does not integrate or alter a checkpoint.
using LinearAlgebra, Test, JSON3
include("transport-v2-model.jl")
include("implicit-split-reference-v2.jl")
BLAS.set_num_threads(1)
const REVIEW_ROOT=normpath(joinpath(@__DIR__,"../../.."))
const REVIEW_SOURCE=joinpath(REVIEW_ROOT,"build/earth-speedy-moisture-monsoon/coupled-seasonal-statistics-start.jld2")
saved=JLD2.load(REVIEW_SOURCE);sg=SW.SpectralGrid(NF=Float64,truncation=32,nlayers=8)
Tdyn=collect(saved["components"]["implicit"].temp_profile)
function make_review_model(c)
    m=SW.PrimitiveWetModel(sg;implicit=c,feedback=nothing,
        time_stepping=SW.Leapfrog(sg;Δt_at_T32=Minute(30),adjust_with_output=false))
    SW.initialize!(m.geopotential,m);SW.initialize!(m.adiabatic_conversion,m)
    SW.initialize!(m.coriolis,m);SW.initialize!(m.orography,m)
    m
end
models=(make_review_model(ConsistentImplicitPrimitiveEquation(sg;enabled=false)),
    make_review_model(SplitReferenceImplicit(sg;enabled=false)),make_review_model(SplitReferenceImplicit(sg)))
function full_rhs(m,equal)
    vars=SW.Variables(m)
    for (key,data) in saved["containers"];SW.copy_variables!(getproperty(vars,Symbol(key)),data);end
    if equal
        for key in (:temperature,:vorticity,:divergence,:pressure,:humidity)
            SW.get_step(getproperty(vars.prognostic,key),1).data .= SW.get_step(getproperty(vars.prognostic,key),2).data
            SW.get_step(getproperty(vars.grid,key),1).data .= SW.get_step(getproperty(vars.grid,key),2).data
        end
        for key in (:u,:v);SW.get_step(getproperty(vars.grid,key),1).data .= SW.get_step(getproperty(vars.grid,key),2).data;end
    end
    span=SW.time_step(m.time_stepping,vars.prognostic.clock)/vars.prognostic.scale[]
    SW.initialize!(m.implicit,span,Tdyn,m.geometry,m.geopotential,m.atmosphere,m.adiabatic_conversion)
    SW.reset_tendencies!(vars,m.time_stepping)
    SW.dynamics_tendencies!(vars,m)
    SW.implicit_correction!(vars,m.implicit,m.time_stepping,m)
    vars
end
records=[]
@testset "actual wet-field split reference preserves dynamics RHS and background once" begin
 for equal in (false,true)
    vars=[full_rhs(m,equal) for m in models]
    base,off,on=vars
    @test maximum(abs,base.dynamics.w)>0
    @test base.grid.temperature.data==off.grid.temperature.data==on.grid.temperature.data
    differences=[]
    for key in (:temperature,:pressure,:divergence,:vorticity,:humidity)
        a=SW.get_step(getproperty(base.tendencies,key)).data
        b=SW.get_step(getproperty(off.tendencies,key)).data
        @test a==b
        push!(differences,(;variable=string(key),maxAbs=maximum(abs,a-b)))
    end
    @test base.scratch.implicit_background_tendency.data==off.scratch.implicit_background_tendency.data==on.scratch.implicit_background_tendency.data
    @test maximum(abs,base.scratch.implicit_background_tendency)>0
    m=models[3];c=m.implicit;p=c.inner
    span=SW.time_step(m.time_stepping,on.prognostic.clock)/on.prognostic.scale[]
    n=8;N=17;eye=Matrix{Float64}(I,N,N)
    li=SW.get_step(on.tendencies.temperature).spectrum.l_indices
    maxError=0.;maxAbsolute=0.;checked=0
    for lm in eachindex(li)
        l=li[lm];l>c.truncation && continue;lambda=-l*(l-1)
        A=zeros(N,N);A[1:n,n+1:2n]=lambda*p.R;A[1:n,end]=lambda*p.U
        A[n+1:2n,1:n]=p.L;A[end,1:n]=p.W
        rhs=[SW.get_step(base.tendencies.divergence).data[lm,:];
            SW.get_step(base.tendencies.temperature).data[lm,:];SW.get_step(base.tendencies.pressure).data[lm]]
        deltaP=SW.get_step(base.prognostic.pressure,1).data[lm]-SW.get_step(base.prognostic.pressure,2).data[lm]
        deltaD=SW.get_step(base.prognostic.divergence,1).data[lm,:]-SW.get_step(base.prognostic.divergence,2).data[lm,:]
        rhs[1:n] .+= lambda.*(p.U.+m.atmosphere.R_dry.*Tdyn).*deltaP
        rhs[n+1:2n] .+=p.L*deltaD
        expected=(eye-span*A)\rhs
        actual=[SW.get_step(on.tendencies.divergence).data[lm,:];
            SW.get_step(on.tendencies.temperature).data[lm,:];SW.get_step(on.tendencies.pressure).data[lm]]
        @test actual≈expected rtol=3e-12 atol=2e-9
        maxAbsolute=max(maxAbsolute,maximum(abs,actual-expected))
        maxError=max(maxError,maximum(abs,actual-expected)/max(1.,maximum(abs,expected)));checked+=1
    end
    push!(records,(;equal,maxW=maximum(abs,base.dynamics.w),maxBackground=maximum(abs,base.scratch.implicit_background_tendency),differences,checked,maxError,maxAbsolute))
 end
end
record=(;source=REVIEW_SOURCE,sourceSHA=bytes2hex(sha256(read(REVIEW_SOURCE))),scriptSHA=bytes2hex(sha256(read(@__FILE__))),
    implementationSHA=bytes2hex(sha256(read(joinpath(@__DIR__,"implicit-split-reference-v2.jl")))),
    scope="Actual2006 wet fields including nonzero terrain, winds, q, pressure gradients and nonzero background advection. No parameterization or integration. Enabled-false new wrapper preserves complete legacy corrected dynamics RHS bitwise, both equal and unequal old/current. Enabled-true results compared with independent block LU solve per valid spectral coefficient; auxiliary input kept exactly as archived.",records)
open(io->JSON3.write(io,record),joinpath(REVIEW_ROOT,"build/earth-speedy-transport/physics-split-reference-grid-test-v2.json"),"w")
println(JSON3.write(record))
