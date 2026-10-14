using SpeedyWeather, Dates, Test, JSON3, LinearAlgebra
const SW=SpeedyWeather
BLAS.set_num_threads(1)
const IMPLEMENTATION=get(ENV,"SURFACE_EVAPORATION_IMPLEMENTATION","native")
IMPLEMENTATION=="fixed" && include("surface-evaporation-corrected.jl")
sg=SW.SpectralGrid(NF=Float64,truncation=8,nlayers=8)
landflux=IMPLEMENTATION=="fixed" ? DewAwareLandHumidityFlux(sg) : SW.SurfaceLandHumidityFlux(sg)
oceanflux=SW.SurfaceOceanHumidityFlux(sg)
flux=SW.SurfaceHumidityFlux(sg;land=landflux,ocean=oceanflux)
m=SW.PrimitiveWetModel(sg;surface_humidity_flux=flux,feedback=nothing)
sim=SW.initialize!(m);v=sim.variables;a=m.atmosphere
const PS=100000.0
function configure!(v,m;ts=300.,rh=.5,alpha=.1,landfraction=1.,snow=0.,ice=0.)
    SW.reset_tendencies!(v,m.time_stepping);SW.reset_variables!(v)
    p=v.parameterizations;p.surface_pressure[1]=PS;p.surface_air_density[1]=1.2
    p.surface_wind_speed[1]=5.;p.boundary_layer_drag[1]=.002
    p.land.soil_moisture_availability[1]=alpha
    m.land_sea_mask.land_fraction[1]=landfraction
    v.prognostic.land.soil_temperature.data[1,:,:].=ts
    v.prognostic.land.soil_moisture.data[1,:,:].=.6
    v.prognostic.land.snow_depth.data[1,:].=snow
    v.prognostic.ocean.sea_surface_temperature.data[1,:].=302.
    v.prognostic.ocean.sea_ice_concentration[1]=ice
    qs=SW.saturation_humidity(ts,PS,a)
    v.grid.humidity.data[1,:,:].=rh*qs
    p.land.snow_melt_rate[1]=0;p.rain_rate[1]=0
    for key in (:surface_shortwave_down,:surface_longwave_down)
        getproperty(p,key)[1]=0
    end
    for key in (:surface_shortwave_up,:surface_longwave_up,:sensible_heat_flux)
        getproperty(p.land,key)[1]=0
    end
    return qs
end
results=[]
@testset "Evaporation availability cannot manufacture thermodynamic dew" begin
    for (label,ts,rh,alpha) in (
        ("warm dry soil",300.,.5,.1),("warm moderate soil",300.,.6,.3),
        ("no available soil water",305.,.4,0.),("exact saturation dry soil",290.,1.,.2),
        ("positive stressed evaporation",305.,.2,.5),("wet soil evaporation",300.,.5,1.),
        ("cold true dew dry soil",275.,1.2,.1),("cold true dew wet soil",275.,1.2,1.))
        qs=configure!(v,m;ts,rh,alpha)
        SW.parameterization!(1,v,flux,m)
        actual=v.parameterizations.land.surface_humidity_flux[1]
        C=1.2*.002*5.
        # Dew is limited by saturation at Ts, independent of evaporation stress.
        expected=C*(rh>1 ? (1-rh)*qs : max((alpha-rh)*qs,0.))
        @test isapprox(actual,expected;atol=1e-16,rtol=1e-12)
        @test rh<=1 ? actual>=0 : actual<0
        if alpha>rh
            @test actual==C*(alpha*qs-rh*qs) # positive native arithmetic unchanged
        end
        if rh<=1&&alpha<=rh;@test actual==0;end
        push!(results,(;label,ts,rh,alpha,actualMmDay=actual*86400,expectedMmDay=expected*86400))
    end
end
println(JSON3.write((;implementation=IMPLEMENTATION,results)))

@testset "Mixed surfaces share one atmospheric land-water and latent-heat flux" begin
    for landfraction in (0.,.3,1.),rh in (.2,.6,1.2),alpha in (.1,.5,1.),snow in (0.,.05)
        ts=285.;qs=configure!(v,m;ts,rh,alpha,landfraction,snow,ice=.2)
        SW.parameterization!(1,v,flux,m)
        p=v.parameterizations;fl=p.land.surface_humidity_flux[1];fo=p.ocean.surface_humidity_flux[1]
        expectedLand=1.2*0.002*5.0*(rh>1 ? (1-rh)*qs : max((alpha-rh)*qs,0.))/(1+snow/0.05)
        @test isapprox(fl,expectedLand;atol=1e-18,rtol=1e-12)
        total=landfraction*fl+(1-landfraction)*fo
        @test isapprox(p.surface_humidity_flux[1],total;atol=1e-18)
        dqa=SW.get_tendency_step(v.tendencies.grid.humidity,m.time_stepping,flux)
        air=PS/m.planet.gravity*sum(dqa[1,k]*m.geometry.σ_levels_thick[k] for k in 1:8)
        @test isapprox(air,total;atol=1e-18)
        # Native ocean flux remains untouched, including its ice insulation.
        oq=SW.saturation_humidity(302.,PS,a)
        @test fo≈1.2*0.002*5.0*(oq-rh*qs)/(1+0.2/oceanflux.sea_ice_insulation) atol=1e-18
        if landfraction>0
            SW.timestep!(v,m.land.soil_moisture,m)
            ds=SW.get_tendency_step(v.tendencies.land.soil_moisture,SW.time_stepper(m.time_stepping,:land),m.land.soil_moisture)
            land=a.water_density*m.land.thermodynamics.field_capacity*sum(ds[1,k]*m.land.geometry.layer_thickness[k] for k in 1:2)
            @test abs(land+fl)<1e-16
            # Prescribed ocean reservoir supplies its own portion of total E.
            @test abs(air+landfraction*land-(1-landfraction)*fo)<1e-16
            SW.timestep!(v,m.land.temperature,m)
            dts=SW.get_tendency_step(v.tendencies.land.soil_temperature,SW.time_stepper(m.time_stepping,:land),m.land.temperature)
            td=m.land.thermodynamics
            Csoil=td.heat_capacity_water*.6*td.field_capacity+td.heat_capacity_dry_soil
            soilHeat=Csoil*sum(dts[1,k]*m.land.geometry.layer_thickness[k] for k in 1:2)
            @test abs(soilHeat+a.latent_heat_condensation*fl)<1e-9
        end
    end
end
