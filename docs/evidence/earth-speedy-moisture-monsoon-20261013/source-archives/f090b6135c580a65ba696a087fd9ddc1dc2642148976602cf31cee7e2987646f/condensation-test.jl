using SpeedyWeather, Dates, Test, JSON3, LinearAlgebra
const SW=SpeedyWeather
BLAS.set_num_threads(1)
implementation=get(ENV,"MOISTURE_IMPLEMENTATION","native")
implementation=="fixed"&&include("condensation.jl")
sg=SpectralGrid(NF=Float64,truncation=32,nlayers=8)
model=PrimitiveWetModel(sg;time_stepping=Leapfrog(sg;Δt_at_T32=Minute(30)),feedback=nothing)
sim=initialize!(model);v=sim.variables;m=model
scheme=implementation=="fixed" ? ConservativeCondensation(sg) : SW.ImplicitCondensation(sg)
records=[]
@testset "column water and moist enthalpy conservation" begin
for (label,temps,relative,snow,reevap) in (
    ("dry-below-rain",[220.,230,245,275,282,290,297,302],[.1,.1,.1,1.5,.15,.1,.1,.1],false,30.),
    ("rain-without-reevap",[220.,230,245,275,282,290,297,302],[.1,.1,.1,1.5,.15,.1,.1,.1],false,0.),
    ("melting-snow",[220.,230,245,260,282,290,297,302],[.1,.1,1.5,.15,.15,.1,.1,.1],true,30.),
    ("frozen-snow",[220.,230,240,245,248,252,255,258],[.1,.1,1.5,.15,.15,.1,.1,.1],true,30.),
    ("condensation-and-reevap",[220.,230,245,275,282,290,297,302],[.1,.1,.1,1.5,.97,.97,.97,.97],false,30.),
    ("no-condensation",[220.,230,245,275,282,290,297,302],fill(.1,8),false,30.))
    native=SW.ImplicitCondensation(sg;snow,reevaporation=reevap)
    scheme=implementation=="fixed" ? ConservativeCondensation(native) : native
    ps=100000.;v.parameterizations.surface_pressure[1]=ps
    T=SW.get_step(v.grid.temperature,1);q=SW.get_step(v.grid.humidity,1)
    for k in 1:8
        T[1,k]=temps[k];q[1,k]=relative[k]*SW.saturation_humidity(temps[k],SW.pressure(k,ps,m.geometry.vertical_coordinates),m.atmosphere)
    end
    SW.reset_tendencies!(v,m.time_stepping);SW.reset_variables!(v)
    for key in (:rain_large_scale,:snow_large_scale);fill!(getproperty(v.parameterizations,key),0);end
    SW.parameterization!(1,v,scheme,m)
    dq=SW.get_step(v.tendencies.grid.humidity).data[1,:]
    dT=SW.get_step(v.tendencies.grid.temperature).data[1,:]
    mass=[SW.pressure_thickness(k,ps,m.geometry.vertical_coordinates)/m.planet.gravity for k in 1:8]
    rain=v.parameterizations.rain_rate_large_scale[1]*m.atmosphere.water_density
    ice=v.parameterizations.snow_rate_large_scale[1]*m.atmosphere.water_density
    residual=sum(mass.*dq)+rain+ice
    # Liquid-reference moist enthalpy: cp*T + Lv*q; falling ice carries -Lf per kg.
    enthalpy=sum(mass.*(m.atmosphere.heat_capacity.*dT.+m.atmosphere.latent_heat_condensation.*dq))-m.atmosphere.latent_heat_fusion*ice
    push!(records,(;label,residualKgM2S=residual,residualMmDay=86400residual,enthalpyWm2=enthalpy,rainKgM2S=rain,snowKgM2S=ice))
    println(JSON3.write(records[end]))
    @test abs(residual)<1e-12
    @test abs(enthalpy)<1e-8
    @test rain>=0&&ice>=0
end
end
