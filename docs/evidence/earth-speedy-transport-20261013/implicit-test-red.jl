# Independent tests for the implicit temperature operator and its explicit split.
# Calls installed native kernels; does not alter any installed method or source.
using SpeedyWeather, LinearAlgebra, JSON3, Test
const SW=SpeedyWeather
const IMPLICIT_MODE=get(ENV,"IMPLICIT_IMPLEMENTATION","native")

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

function main()
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
main()
