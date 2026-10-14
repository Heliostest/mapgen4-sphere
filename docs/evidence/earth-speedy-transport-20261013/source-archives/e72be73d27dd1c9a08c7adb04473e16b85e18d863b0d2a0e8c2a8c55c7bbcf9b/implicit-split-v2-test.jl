# A missing pressure time-level shift must fail the dense coupled-system oracle.
using SpeedyWeather, LinearAlgebra, Test, Dates, JSON3, JLD2
const SW=SpeedyWeather
include("implicit-corrected.jl")
const SPLIT_MODE="candidate"
if get(ENV,"SPLIT_REVISION","v2")=="v1"
    include("implicit-split-reference.jl")
else
    include("implicit-split-reference-v2.jl")
end
BLAS.set_num_threads(1)
constructor(sg;kwargs...)=SPLIT_MODE=="candidate" ? SplitReferenceImplicit(sg;kwargs...) : ConsistentImplicitPrimitiveEquation(sg;kwargs...)

function main()
    errors=Float64[]
    @testset "split reference preserves dynamics and solves SI time levels" begin
    for NF in (Float64,Float32),nonuniform in (false,true)
        sg=SW.SpectralGrid(;NF,truncation=8,nlayers=8)
        half=NF.(nonuniform ? [0.,.02,.07,.18,.4,.62,.78,.9,1.] : collect(0.:.125:1.))
        geo=SW.Geometry(sg;vertical_coordinates=SW.SigmaCoordinates(sg,half))
        Tdyn=NF.([200.,226.,244.,256.,265.,272.,279.,284.])
        for (alpha,enabled) in ((0.,true),(1.,false),(.5,true),(1.,true))
            c=constructor(sg;centering=alpha,enabled)
            m=SW.PrimitiveDryModel(sg;geometry=geo,implicit=c,feedback=nothing,
                time_stepping=SW.Leapfrog(sg;Δt_at_T32=Minute(30),adjust_with_output=false))
            m.time_stepping.Δt=1800.;m.time_stepping.Δt_millisec=Millisecond(1800000)
            SW.initialize!(m.geopotential,m);SW.initialize!(m.adiabatic_conversion,m);SW.initialize!(c,m)
            v=SW.Variables(m);v.prognostic.clock.step_counter=2
            fill!(v.dynamics.w,0)
            for radius in (3.2e6,6.371e6)
                v.prognostic.scale[]=radius
                tau=SW.time_step(m.time_stepping,v.prognostic.clock)/radius
                SW.initialize!(c,tau,Tdyn,geo,m.geopotential,m.atmosphere,m.adiabatic_conversion)
                c.Δt[]=SW.time_step(m.time_stepping,v.prognostic.clock)
                ideal=ConsistentImplicitPrimitiveEquation(sg;centering=alpha,enabled)
                Tsi=fill(NF(m.atmosphere.reference_temperature),8)
                SW.initialize!(ideal,tau,Tsi,geo,m.geopotential,m.atmosphere,m.adiabatic_conversion)
                @test c.temp_profile==Tdyn
                if enabled && alpha!=0
                    @test c.U≈ideal.U
                    @test c.L≈ideal.L
                end
                for l in (1,3,8),samelevels in (true,false)
                    fill!(v.tendencies.temperature,0);fill!(v.tendencies.divergence,0);fill!(v.tendencies.pressure,0)
                    fill!(v.prognostic.divergence,0);fill!(v.prognostic.pressure,0)
                    lm=findfirst(==(l),v.tendencies.temperature.spectrum.l_indices)
                    dD=NF.(samelevels ? zeros(8) : collect(range(-.05,.04;length=8)))
                    dT=NF.(samelevels ? zeros(8) : collect(range(-2.,1.;length=8)))
                    dp=NF(samelevels ? 0 : .002)
                    curD=NF.(collect(range(.01,.08;length=8)))
                    SW.get_step(v.prognostic.divergence,1).data[lm,:].=curD.+dD
                    SW.get_step(v.prognostic.divergence,2).data[lm,:].=curD
                    SW.get_step(v.prognostic.pressure,1)[lm]=NF(.03)+dp
                    SW.get_step(v.prognostic.pressure,2)[lm]=NF(.03)
                    lambda=-l*(l-1);Udyn=-m.atmosphere.R_dry.*Tdyn
                    Fd=NF.(collect(range(.2,-.1;length=8)))
                    Ft=NF.(collect(range(.01,-.02;length=8)));Fp=NF(.001)
                    rawD=Fd+lambda.*(ideal.R*dT+Udyn.*dp)
                    rawP=Fp+dot(ideal.W,dD)
                    SW.get_step(v.tendencies.divergence).data[lm,:].=rawD
                    SW.get_step(v.tendencies.temperature).data[lm,:].=Ft
                    SW.get_step(v.tendencies.pressure)[lm]=rawP
                    beforeD=copy(v.prognostic.divergence.data);beforeP=copy(v.prognostic.pressure.data)
                    A=zeros(NF,17,17)
                    A[1:8,9:16].=lambda.*ideal.R;A[1:8,17].=lambda.*ideal.U
                    A[9:16,1:8].=ideal.L;A[17,1:8].=ideal.W
                    active=enabled&&alpha!=0
                    expected=if active
                        G=[Fd+lambda.*(ideal.R*dT+ideal.U.*dp);Ft+ideal.L*dD;rawP]
                        (I-NF(alpha*tau).*A)\G
                    else
                        [rawD;Ft;rawP]
                    end
                    SW.implicit_correction!(v,c,m.time_stepping,m)
                    actual=[vec(SW.get_step(v.tendencies.divergence).data[lm,:]);
                        vec(SW.get_step(v.tendencies.temperature).data[lm,:]);SW.get_step(v.tendencies.pressure)[lm]]
                    relative=maximum(abs,actual-expected)/max(1.,maximum(abs,expected))
                    push!(errors,relative)
                    @test relative<(NF==Float32 ? 2e-5 : 1e-11)
                    @test v.prognostic.divergence.data==beforeD
                    @test v.prognostic.pressure.data==beforeP
                end
            end
        end
    end
    end
    if SPLIT_MODE=="candidate"
        @testset "native startup refresh and same-dt checkpoint retention" begin
            sg=SW.SpectralGrid(NF=Float64,truncation=8,nlayers=8)
            c=constructor(sg);m=SW.PrimitiveDryModel(sg;implicit=c,feedback=nothing)
            SW.initialize!(m.geopotential,m);SW.initialize!(m.adiabatic_conversion,m)
            v=SW.Variables(m);v.prognostic.scale[]=m.planet.radius
            Tdyn=[200.,226.,244.,256.,265.,272.,279.,284.]
            SW.initialize!(c,1800/m.planet.radius,Tdyn,m.geometry,m.geopotential,m.atmosphere,m.adiabatic_conversion)
            v.dynamics.average_temperature_profile.=Tdyn.+20
            for counter in 0:2
                v.prognostic.clock.step_counter=counter
                v.dynamics.average_temperature_profile .= Tdyn .+ 10(counter+1)
                SW.reinitialize!(c,m,v)
                @test c.temp_profile==v.dynamics.average_temperature_profile
                @test c.inner.temp_profile==fill(m.atmosphere.reference_temperature,8)
            end
            savedReference=copy(c.temp_profile)
            v.dynamics.average_temperature_profile .+= 99
            SW.reinitialize!(c,m,v)
            @test c.temp_profile==savedReference
            path="build/earth-speedy-transport/implicit-split-v2-roundtrip.jld2"
            JLD2.jldsave(path;c)
            loaded=JLD2.load(path,"c")
            @test loaded.temp_profile==savedReference
            @test loaded.inner.temp_profile==c.inner.temp_profile
            @test loaded.Δt[]==c.Δt[]
            @test loaded.temp_profile!==loaded.inner.temp_profile
        end
    end
    open(io->JSON3.write(io,(;mode=SPLIT_MODE,maxRelativeKernelError=maximum(errors))),
        "build/earth-speedy-transport/implicit-split-v2-$(SPLIT_MODE)-test.json","w")
end
main()
