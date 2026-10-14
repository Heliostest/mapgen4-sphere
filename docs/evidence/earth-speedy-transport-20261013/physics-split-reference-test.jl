# Independent review: block equations, not implementation's componentwise solve.
using LinearAlgebra, Random, Test, JSON3
include("transport-v2-model.jl")
include("implicit-split-reference.jl")
BLAS.set_num_threads(1);Random.seed!(730131)
const REVIEW_ROOT=normpath(joinpath(@__DIR__,"../../.."))
function review_operator(p,l)
    n=p.nlayers;A=zeros(2n+1,2n+1);lambda=-l*(l-1)
    A[1:n,n+1:2n]=lambda*p.R;A[1:n,end]=lambda*p.U
    A[n+1:2n,1:n]=p.L;A[end,1:n]=p.W
    A
end
summaries=[]
@testset "independent split-reference block equations and RAW" begin
 for radius in (3.2e6,6.371e6),alpha in (0.,.5,1.),enabled in (false,true)
    sg=SW.SpectralGrid(NF=Float64,truncation=8,nlayers=8)
    c=SplitReferenceImplicit(sg;centering=alpha,enabled)
    m=SW.PrimitiveDryModel(sg;implicit=c,feedback=nothing,
        time_stepping=SW.Leapfrog(sg;Δt_at_T32=Minute(30),adjust_with_output=false))
    m.time_stepping.Δt=1800.;m.time_stepping.Δt_millisec=Millisecond(1800000)
    SW.initialize!(m.geopotential,m);SW.initialize!(m.adiabatic_conversion,m)
    vars=SW.Variables(m);vars.prognostic.scale[]=radius;vars.prognostic.clock.step_counter=2
    Tdyn=[200.14398364787579,226.3216267409902,243.64870254570545,255.55264889675274,
        264.64527635568294,272.12312864979833,278.59057770444474,284.38619228860114]
    span=3600/radius
    SW.initialize!(c,span,Tdyn,m.geometry,m.geopotential,m.atmosphere,m.adiabatic_conversion)
    @test c.temp_profile == Tdyn
    @test c.inner.temp_profile == fill(m.atmosphere.reference_temperature,8)
    n=8;N=17;eye=Matrix{Float64}(I,N,N)
    maxError=0.;maxRawError=0.;maxCompensation=0.
    for equal in (false,true),l in 2:8,trial in 1:3
        p=c.inner;A=review_operator(p,l);lambda=-l*(l-1)
        oldstate=randn(ComplexF64,N);current=equal ? copy(oldstate) : randn(ComplexF64,N)
        fullF=randn(ComplexF64,N)
        # Native mixed-level RHS before the SI correction: T at current,
        # geopotential and reference pressure gradient at old, continuity at old.
        raw=copy(fullF)
        raw[1:n] .+= lambda.*(p.R*(oldstate[n+1:2n]-current[n+1:2n]) .-
            m.atmosphere.R_dry.*Tdyn.*(oldstate[end]-current[end]))
        raw[end]+=dot(p.W,oldstate[1:n]-current[1:n])
        expected=enabled && alpha!=0 ? (eye-alpha*span*A)\(fullF+A*(oldstate-current)) : raw
        # old=current makes the pressure re-splitting exactly zero; it does not
        # require different finite-time SI inverses to produce identical steps.
        correction=lambda.*(p.U.+m.atmosphere.R_dry.*Tdyn).*(oldstate[end]-current[end])
        equal && @test correction == zeros(ComplexF64,n)
        maxCompensation=max(maxCompensation,maximum(abs,correction))
        for a in (vars.prognostic.temperature,vars.prognostic.divergence,vars.prognostic.pressure,
                vars.tendencies.temperature,vars.tendencies.divergence,vars.tendencies.pressure);fill!(a,0);end
        fill!(vars.dynamics.w,0)
        field=SW.get_step(vars.prognostic.divergence,1)
        lm=findfirst(==(l),field.spectrum.l_indices)
        for (step,x) in ((1,oldstate),(2,current))
            SW.get_step(vars.prognostic.divergence,step).data[lm,:] .= x[1:n]
            SW.get_step(vars.prognostic.temperature,step).data[lm,:] .= x[n+1:2n]
            SW.get_step(vars.prognostic.pressure,step).data[lm] = x[end]
        end
        SW.get_step(vars.tendencies.divergence).data[lm,:] .= raw[1:n]
        SW.get_step(vars.tendencies.temperature).data[lm,:] .= raw[n+1:2n]
        SW.get_step(vars.tendencies.pressure).data[lm] = raw[end]
        before=(copy(vars.prognostic.divergence.data),copy(vars.prognostic.temperature.data),copy(vars.prognostic.pressure.data))
        SW.implicit_correction!(vars,c,m.time_stepping,m)
        actual=[SW.get_step(vars.tendencies.divergence).data[lm,:];SW.get_step(vars.tendencies.temperature).data[lm,:];SW.get_step(vars.tendencies.pressure).data[lm]]
        err=maximum(abs,actual-expected)/max(1.,maximum(abs,expected));maxError=max(maxError,err)
        @test actual≈expected rtol=2e-12 atol=2e-9
        @test vars.prognostic.divergence.data==before[1]
        @test vars.prognostic.temperature.data==before[2]
        @test vars.prognostic.pressure.data==before[3]
        # Independently apply the RAW update to expected block-solved tendency.
        w1=m.time_stepping.robert_filter*m.time_stepping.williams_filter/2
        w2=m.time_stepping.robert_filter*(1-m.time_stepping.williams_filter)/2
        next=oldstate+span*expected;df=oldstate-2current+next
        desired=[current+w1*df;next-w2*df]
        xo=copy(oldstate);xc=copy(current)
        SW.launch!(SW.CPU(),SW.LinearWorkOrder,(N,),SW.leapfrog_kernel!,xo,xc,xc,actual,span,w1,w2)
        @test [xo;xc]≈desired rtol=3e-12 atol=2e-9
        maxRawError=max(maxRawError,maximum(abs,[xo;xc]-desired)/max(1.,maximum(abs,desired)))
    end
    push!(summaries,(;radius,alpha,enabled,maxError,maxRawError,maxCompensation))
 end
end
record=(;scriptSHA=bytes2hex(sha256(read(@__FILE__))),implementationSHA=bytes2hex(sha256(read(joinpath(@__DIR__,"implicit-split-reference.jl")))),
    scope="Independent complete block solve for arbitrary full current RHS and unequal old/current states. Two radii, alpha0/.5/1, enabled/disabled, valid degree indices2:8, complex coefficients. Actual new wrapper and installed RAW kernel used. Background zero in this test; nonzero advection and full-grid RHS require separate checks.",summaries)
open(io->JSON3.write(io,record),joinpath(REVIEW_ROOT,"build/earth-speedy-transport/physics-split-reference-test.json"),"w")
println(JSON3.write(record))
