# Independent tests for the implicit temperature operator and its explicit split.
# Calls installed native kernels; does not alter any installed method or source.
using SpeedyWeather, LinearAlgebra, JSON3, Test, Dates
const SW=SpeedyWeather
const IMPLICIT_MODE=get(ENV,"IMPLICIT_IMPLEMENTATION","native")
IMPLICIT_MODE=="fixed" && include("implicit-corrected.jl")

function native_temperature_response(profile,D,m;full_temperature=false)
    n=length(profile);ds=m.geometry.σ_levels_thick;half=m.geometry.σ_levels_half
    div=reshape(D,1,n);sumabove=zeros(1,n);w=zeros(1,n)
    for k in 1:n
        sumabove[1,k]=sum(ds[1:k-1].*D[1:k-1])
        w[1,k]=k==n ? 0. : half[k+1]*dot(ds,D)-sum(ds[1:k].*D[1:k])
    end
    temp=reshape(copy(profile),1,n,1)
    !full_temperature && fill!(temp,0.)
    tendency=zeros(1,n,1)
    SW.launch!(SW.CPU(),SW.RingGridWorkOrder,(1,n),SW.vertical_advection_kernel!,
        tendency,1,w,temp,1,ds,n,m.vertical_advection)
    anomaly=zeros(1,n);q=zeros(1,n);zero2=zeros(1,n)
    SW.launch!(SW.CPU(),SW.RingGridWorkOrder,(1,n),SW._temperature_tendency_kernel!,
        reshape(tendency,1,n),anomaly,div,q,sumabove,zero2,zero2,
        profile,m.adiabatic_conversion.σ_lnp_A,m.adiabatic_conversion.σ_lnp_B,m.atmosphere)
    vec(tendency)
end

function explicit_temperature_jacobian(profile,m;full_temperature=false)
    n=length(profile);J=zeros(n,n);epsilon=1e-6
    for j=1:n
        D=zeros(n);D[j]=epsilon
        J[:,j]=(native_temperature_response(profile,D,m;full_temperature)-
            native_temperature_response(profile,-D,m;full_temperature))/(2epsilon)
    end
    J
end

function native_main()
    sg=SW.SpectralGrid(NF=Float64,truncation=8,nlayers=8)
    m=SW.PrimitiveDryModel(sg;feedback=nothing)
    SW.initialize!(m.geopotential,m);SW.initialize!(m.adiabatic_conversion,m)
    records=Any[]
    for (name,T) in (("isothermal",fill(280.,8)),("stratified",[210.,215.,225.,240.,255.,270.,282.,292.]))
        SW.initialize!(m.implicit,3600.0 / m.planet.radius,T,m.geometry,m.geopotential,m.atmosphere,m.adiabatic_conversion)
        Jactual=explicit_temperature_jacobian(T,m)
        Jfull=explicit_temperature_jacobian(T,m;full_temperature=true)
        # This term is analytically the adiabatic conversion. Native temperature
        # kernels above independently calculate its central finite differences.
        Jadia=Diagonal(m.implicit.L2)*m.implicit.L3+Diagonal(m.implicit.L4)
        L=copy(m.implicit.L)
        push!(records,(;name,T,nativeL=L,actualExplicitJacobian=Jactual,fullTemperatureJacobian=Jfull,
            nativeLMinusActualMax=maximum(abs,L-Jactual),
            missingBackgroundAdvectionMax=maximum(abs,Jfull-Jactual),
            adiabaticJacobianError=maximum(abs,Jactual-Jadia),
            nativeLBarotropicExcess=(L-Jadia)*ones(8),
            physicalVerticalBarotropic=(Jfull-Jadia)*ones(8)))
    end
    path="build/earth-speedy-transport/implicit-native-matrix.json"
    open(io->JSON3.write(io,records),path,"w")
    println(JSON3.write(records))
    @testset "native implicit temperature operator matches explicit linearization" begin
        @test records[1].adiabaticJacobianError<1e-12
        @test records[2].adiabaticJacobianError<1e-12
        @test records[1].nativeLMinusActualMax<1e-12
        @test maximum(abs,records[1].nativeLBarotropicExcess)<1e-12
        @test records[2].missingBackgroundAdvectionMax<1e-12
    end
end

function fixed_main()
    summaries=Any[]
    @testset "consistent implicit matrix and linear wave stability" begin
    for half in (collect(0.:.125:1.),[0.,.02,.07,.18,.4,.62,.78,.9,1.])
        sg=SW.SpectralGrid(NF=Float64,truncation=32,nlayers=8)
        geo=SW.Geometry(sg;vertical_coordinates=SW.SigmaCoordinates(sg,half))
        for (name,T) in (("isothermal",fill(280.,8)),("stratified",[210.,215.,225.,240.,255.,270.,282.,292.]))
            c=ConsistentImplicitPrimitiveEquation(sg)
            m=SW.PrimitiveDryModel(sg;geometry=geo,implicit=c,feedback=nothing,
                time_stepping=SW.Leapfrog(sg;Δt_at_T32=Minute(30),adjust_with_output=false))
            SW.initialize!(m.geopotential,m);SW.initialize!(m.adiabatic_conversion,m);SW.initialize!(c,m)
            J=explicit_temperature_jacobian(T,m;full_temperature=true)
            V=background_advection_matrix(T,half,geo.σ_levels_thick)
            @test maximum(abs,V*ones(8))<1e-12
            name=="isothermal" && @test maximum(abs,V)==0
            maxMatrixError=0.;maxWaveError=0.;maxAmplification=0.
            for alpha in (0.,.5,1.),enabled in (false,true),radius in (3.2e6,6.371e6),dt in (900.,1800.,3600.)
                c=ConsistentImplicitPrimitiveEquation(sg;centering=alpha,enabled)
                SW.initialize!(c,dt/radius,T,geo,m.geopotential,m.atmosphere,m.adiabatic_conversion)
                maxMatrixError=max(maxMatrixError,maximum(abs,c.L-J))
                @test c.L≈J atol=1e-11 rtol=0
                @test c.W == -geo.σ_levels_thick
                @test c.S⁻¹[1,:,:] == Matrix{Float64}(I,8,8)
                for l in (2,16,32)
                    lambda=-l*(l-1);A=zeros(17,17)
                    A[1:8,9:16]=lambda*c.R;A[1:8,17]=lambda*c.U
                    A[9:16,1:8]=c.L;A[17,1:8]=c.W
                    x=[collect(range(-.1,.2;length=8));collect(range(-1.,2.;length=8));.01]
                    tau=dt/radius;a=enabled ? alpha : 0.
                    expected=(I-a*tau*A)\((I+(1-a)*tau*A)*x)
                    tendency=A*x
                    if a!=0
                        tt=reshape(copy(tendency[9:16]),1,8,1)
                        pt=reshape([tendency[17]],1,1)
                        dd=reshape(copy(tendency[1:8]),1,8,1)
                        divergence=reshape(repeat(x[1:8],2),1,8,2)
                        SW.launch!(SW.CPU(),SW.LinearWorkOrder,(1,),SW.implicit_primitive_leapfrog_kernel!,
                            tt,pt,dd,divergence,1,1,1,c.S⁻¹,c.R,c.U,c.L,c.W,[l],a*tau,Val(8))
                        tendency=[vec(dd);vec(tt);pt[1]]
                        G=(I-a*tau*A)\(I+(1-a)*tau*A)
                        amplification=maximum(abs,eigvals(G))
                        maxAmplification=max(maxAmplification,amplification)
                        @test amplification<=1+1e-10
                    end
                    actual=x+tau*tendency
                    maxWaveError=max(maxWaveError,maximum(abs,actual-expected))
                    @test actual≈expected atol=1e-10 rtol=1e-12
                end
            end
            push!(summaries,(;name,half,maxMatrixError,maxWaveError,maxAmplification))
        end
    end
    end
    println(JSON3.write((;matrixAndWave=summaries)))

    @testset "native grid split, terrain, time levels and radius scaling" begin
        sg=SW.SpectralGrid(NF=Float64,truncation=8,nlayers=8)
        half=[0.,.02,.07,.18,.4,.62,.78,.9,1.]
        geo=SW.Geometry(sg;vertical_coordinates=SW.SigmaCoordinates(sg,half))
        Tref=[210.,215.,225.,240.,255.,270.,282.,292.]
        for (alpha,enabled) in ((0.,true),(1.,false))
            c=ConsistentImplicitPrimitiveEquation(sg;centering=alpha,enabled)
            m=SW.PrimitiveDryModel(sg;geometry=geo,implicit=c,feedback=nothing,
                time_stepping=SW.Leapfrog(sg;Δt_at_T32=Minute(30),adjust_with_output=false))
            m.time_stepping.Δt=1800.  # fixed test clock, independent of the T8 resolution scaling
            m.time_stepping.Δt_millisec=Millisecond(1800000)
            SW.initialize!(m.geopotential,m);SW.initialize!(m.adiabatic_conversion,m)
            v=SW.Variables(m)
            for radius in (3.2e6,6.371e6),terrain in (0.,1200.)
                v.prognostic.scale[]=radius
                v.dynamics.average_temperature_profile .= Tref
                for counter in (0,1,2)
                    v.prognostic.clock.step_counter=counter
                    SW.reinitialize!(c,m,v)
                    @test c.Δt[] == (counter==0 ? 900. : counter==1 ? 1800. : 3600.)
                end
                # Different old/current fields expose accidental use of step 1.
                for s in (1,2)
                    sign=s==2 ? 1. : -3.
                    for ij in 1:geo.npoints,k in 1:8
                        lat=geo.latds[ij]*pi/180;lon=geo.londs[ij]*pi/180
                        SW.get_step(v.grid.u,s)[ij,k]=sign*8*cos(lat)*sin(lon)
                        SW.get_step(v.grid.v,s)[ij,k]=sign*4*sin(lat)*cos(lon)
                        SW.get_step(v.grid.divergence,s)[ij,k]=sign*radius*2e-6*cos(lat)*cos(lon)*(1+k/8)
                        SW.get_step(v.grid.temperature,s)[ij,k]=Tref[k]+sign*2*sin(lat+lon)*k/8
                    end
                    for ij in 1:geo.npoints
                        z=terrain*sin(geo.latds[ij]*pi/180)^2
                        SW.get_step(v.grid.pressure,s)[ij]=log(1e5)-m.planet.gravity*z/(m.atmosphere.R_dry*280)
                    end
                    SW.transform!(SW.get_step(v.prognostic.pressure,s),SW.get_step(v.grid.pressure,s),m.spectral_transform)
                    SW.transform!(SW.get_step(v.prognostic.divergence,s),SW.get_step(v.grid.divergence,s),m.spectral_transform)
                end
                SW.pressure_gradient_flux!(v,m.spectral_transform,m.time_stepping)
                SW.vertical_integration!(v,m.geometry,m.time_stepping)
                SW.vertical_velocity!(v,m.geometry,m.time_stepping)
                for reference in (Tref,Tref.+[15.,10.,5.,-5.,-10.,0.,5.,10.]),repeat in 1:2
                    SW.initialize!(c,c.Δt[]/radius,reference,geo,m.geopotential,m.atmosphere,m.adiabatic_conversion)
                    fill!(v.tendencies.grid.temperature,0)
                    SW.vertical_advection!(Val(:temperature),v,v.dynamics.w,geo.σ_levels_thick,m.vertical_advection,m)
                    full=copy(SW.get_step(v.tendencies.grid.temperature).data)
                    current=SW.get_step(v.grid.temperature,2)
                    current.data .-= reference'
                    fill!(v.tendencies.grid.temperature,0)
                    SW.vertical_advection!(Val(:temperature),v,v.dynamics.w,geo.σ_levels_thick,m.vertical_advection,m)
                    current.data .+= reference'
                    SW.transform!(SW.get_step(v.tendencies.temperature),SW.get_step(v.tendencies.grid.temperature),m.spectral_transform)
                    beforeT=copy(v.grid.temperature.data);beforeP=copy(v.prognostic.pressure.data)
                    SW.implicit_correction!(v,c,m.time_stepping,m)
                    expected=similar(SW.get_step(v.tendencies.temperature))
                    field=similar(SW.get_step(v.tendencies.grid.temperature));field.data .= full
                    SW.transform!(expected,field,m.spectral_transform)
                    @test SW.get_step(v.tendencies.temperature).data≈expected.data atol=1e-9 rtol=1e-12
                    @test v.grid.temperature.data==beforeT
                    @test v.prognostic.pressure.data==beforeP
                end
            end
        end
    end
    open(io->JSON3.write(io,(;matrixAndWave=summaries)),"build/earth-speedy-transport/implicit-fixed-matrix.json","w")
end
IMPLICIT_MODE=="fixed" ? fixed_main() : native_main()
