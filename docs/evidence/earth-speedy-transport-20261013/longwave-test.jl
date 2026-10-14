using SpeedyWeather, Test, JSON3, LinearAlgebra
const SW=SpeedyWeather
BLAS.set_num_threads(1)
implementation=get(ENV,"LONGWAVE_IMPLEMENTATION","native")
implementation=="fixed" && include("longwave-corrected.jl")
sg=SpectralGrid(NF=Float64,truncation=32,nlayers=8)
rt(eo=.98,el=.98)=implementation=="fixed" ? ReflectingLongwaveRadiativeTransfer(sg;emissivity_ocean=eo,emissivity_land=el) : SW.OneBandLongwaveRadiativeTransfer(sg;emissivity_ocean=eo,emissivity_land=el)
rad=SW.Radiation(sg;longwave=SW.OneBandLongwave(sg;radiative_transfer=rt()))
m=PrimitiveWetModel(sg;radiation=rad,feedback=nothing)
v=initialize!(m).variables
ij=argmin(abs.(m.geometry.latds))
mass=[SW.pressure_thickness(k,100000.,m.geometry.vertical_coordinates)/m.planet.gravity for k in 1:8]

function column(transfer;optics=:default,land=.3,isothermal=false)
    SW.reset_tendencies!(v,m.time_stepping);SW.reset_variables!(v)
    for step in 1:2,k in 1:8
        SW.get_step(v.grid.temperature,step).data[ij,k]=isothermal ? 300. : 240. + 6k
        SW.get_step(v.grid.humidity,step).data[ij,k]=.002
    end
    oceanT=300.;landT=isothermal ? 300. : 290.
    SW.get_step(v.prognostic.ocean.sea_surface_temperature).data[ij]=oceanT
    SW.get_step(v.prognostic.land.soil_temperature).data[ij,:].=landT
    m.land_sea_mask.land_fraction[ij]=land
    v.parameterizations.surface_pressure[ij]=100000.
    beforeT=copy(v.grid.temperature.data);beforeQ=copy(v.grid.humidity.data)
    if optics==:default
        lw=SW.OneBandLongwave(sg;radiative_transfer=transfer)
        # Exercise native Radiation and OneBandLongwave dispatch, with no SW stream.
        SW.parameterization!(ij,v,SW.Radiation(nothing,lw),m)
    else
        t=v.scratch.grid.a;t.data[ij,:].=optics==:opaque ? 0. : 1.
        SW.longwave_radiative_transfer!(ij,v,t,transfer,m)
    end
    @test isequal(beforeT,v.grid.temperature.data) && isequal(beforeQ,v.grid.humidity.data)
    @test all(iszero,SW.get_step(v.tendencies.grid.humidity).data)
    p=v.parameterizations
    dt=copy(SW.get_step(v.tendencies.grid.temperature).data[ij,:])
    heat=sum(mass.*dt)*m.atmosphere.heat_capacity
    up=p.surface_longwave_up[ij];down=p.surface_longwave_down[ij];olr=p.outgoing_longwave[ij]
    residual=heat+down-up+olr
    @test abs(residual)<1e-9
    @test all(isfinite,dt)
    return (;up,down,olr,heat,residual,bottomHeat=mass[8]*dt[8]*m.atmosphere.heat_capacity,
        oceanUp=p.ocean.surface_longwave_up[ij],landUp=p.land.surface_longwave_up[ij],oceanT,landT,dt)
end

@testset "Gray surface longwave reflection" begin
    @testset "Opaque isothermal surface and bottom air exchange zero" begin
        for e in (0.,.25,.98,1.)
            a=column(rt(e,e);optics=:opaque,isothermal=true)
            @test isapprox(a.down-a.up,0.;atol=1e-10)
            @test isapprox(a.bottomHeat,0.;atol=1e-10)
            println(JSON3.write((;implementation,case="opaque-isothermal",emissivity=e,fluxes=a)))
        end
    end
    @testset "Emissivity one is native bitwise-equivalent" begin
        for optics in (:default,:opaque,:transparent)
            a=column(rt(1.,1.);optics)
            b=column(SW.OneBandLongwaveRadiativeTransfer(sg;emissivity_ocean=1.,emissivity_land=1.);optics)
            @test isequal(a,b)
        end
    end
    @testset "Perfectly reflecting surface has zero net absorption" begin
        a=column(rt(0.,0.))
        @test isapprox(a.up,a.down;atol=1e-10)
        @test a.oceanUp==a.landUp==a.up
        println(JSON3.write((;implementation,case="reflecting-surface",fluxes=a)))
    end
    @testset "Transparent atmosphere retains native fluxes and zero air heating" begin
        for e in (0.,.25,.98,1.)
            a=column(rt(e,e);optics=:transparent)
            b=column(SW.OneBandLongwaveRadiativeTransfer(sg;emissivity_ocean=e,emissivity_land=e);optics=:transparent)
            @test isequal(a,b)
            @test maximum(abs.(a.dt))<1e-15
            @test a.down==0.
            @test a.olr==a.up
        end
    end
    @testset "Mixed land and ocean retain separate emissivities and temperatures" begin
        for (eo,el) in ((0.,1.),(1.,0.),(.98,.6)),land in (0.,.25,1.)
            a=column(rt(eo,el);land)
            B=m.atmosphere.stefan_boltzmann
            expectedOcean=eo*B*a.oceanT^4+(1-eo)*a.down
            expectedLand=el*B*a.landT^4+(1-el)*a.down
            @test isapprox(a.oceanUp,expectedOcean;atol=1e-10)
            @test isapprox(a.landUp,expectedLand;atol=1e-10)
            @test isapprox(a.up,(1-land)*expectedOcean+land*expectedLand;atol=1e-10)
        end
    end
    @testset "Default component preserves coefficients and declarations" begin
        scheme=rt()
        native=SW.OneBandLongwaveRadiativeTransfer(sg)
        actual=implementation=="fixed" ? scheme.inner : scheme
        @test actual.emissivity_ocean==native.emissivity_ocean==.98
        @test actual.emissivity_land==native.emissivity_land==.98
        @test SW.variables(scheme)==SW.variables(native)
        a=column(scheme)
        println(JSON3.write((;implementation,case="default-radiation",fluxes=a)))
    end
end
