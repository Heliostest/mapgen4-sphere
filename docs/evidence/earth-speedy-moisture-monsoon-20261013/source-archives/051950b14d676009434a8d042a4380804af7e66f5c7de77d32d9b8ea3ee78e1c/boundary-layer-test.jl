using SpeedyWeather, Dates, Test, JSON3, LinearAlgebra
const SW=SpeedyWeather
BLAS.set_num_threads(1)
implementation=get(ENV,"BOUNDARY_IMPLEMENTATION","native")
implementation=="fixed"&&include("boundary-layer.jl")
sg=SpectralGrid(NF=Float64,truncation=32,nlayers=8)
scheme=implementation=="fixed" ? SurfaceAwareBoundaryLayer(sg) : SW.BoundaryLayer(sg)
model=PrimitiveWetModel(sg;boundary_layer=scheme,time_stepping=Leapfrog(sg;Δt_at_T32=Minute(30)),feedback=nothing)
sim=initialize!(model);v=sim.variables;m=model

function column(;land=0.,skin=310.,sst=310.,availability=1.,ice=0.,snow=0.,height=500.,orography=0.)
    for step in 1:2
        SW.get_step(v.grid.temperature,step).data[1,:].=285.
        SW.get_step(v.grid.humidity,step).data[1,:].=.006
        SW.get_step(v.grid.u,step).data[1,:].=5.
        SW.get_step(v.grid.v,step).data[1,:].=0.
    end
    v.parameterizations.surface_pressure[1]=100000.
    m.land_sea_mask.land_fraction[1]=land;m.orography.orography[1]=orography
    v.dynamics.geopotential[1,8]=(height+orography)*m.planet.gravity
    SW.get_step(v.prognostic.ocean.sea_surface_temperature).data[1]=sst
    SW.get_step(v.prognostic.ocean.sea_ice_concentration).data[1]=ice
    SW.get_step(v.prognostic.land.soil_temperature).data[1,:].=skin
    SW.get_step(v.prognostic.land.snow_depth).data[1]=snow
    v.parameterizations.land.soil_moisture_availability[1]=availability
    SW.reset_tendencies!(v,m.time_stepping);SW.reset_variables!(v)
    before=(T=copy(v.grid.temperature.data),q=copy(v.grid.humidity.data),ocean=copy(v.prognostic.ocean.sea_surface_temperature.data),soil=copy(v.prognostic.land.soil_temperature.data))
    SW.parameterization!(1,v,scheme,m)
    drag=implementation=="fixed" ? scheme.inner.drag : scheme.drag
    ri=implementation=="fixed" ? v.parameterizations.surface_bulk_richardson[1] : SW.bulk_richardson_surface(1,height*m.planet.gravity,v,m.atmosphere,drag,m.time_stepping)
    @test isequal(before.T,v.grid.temperature.data)&&isequal(before.q,v.grid.humidity.data)
    @test isequal(before.ocean,v.prognostic.ocean.sea_surface_temperature.data)&&isequal(before.soil,v.prognostic.land.soil_temperature.data)
    @test all(iszero,SW.get_step(v.tendencies.grid.temperature).data)&&all(iszero,SW.get_step(v.tendencies.grid.humidity).data)
    d=v.parameterizations.boundary_layer_drag[1]
    air=(density=v.parameterizations.surface_air_density[1],temperature=v.parameterizations.surface_air_temperature[1],wind=v.parameterizations.surface_wind_speed[1])
    SW.parameterization!(1,v,m.surface_heat_flux,m)
    SW.parameterization!(1,v,m.surface_humidity_flux,m)
    dq=SW.get_step(v.tendencies.grid.humidity).data[1,:]
    dt=SW.get_step(v.tendencies.grid.temperature).data[1,:]
    mass=[SW.pressure_thickness(k,100000.,m.geometry.vertical_coordinates)/m.planet.gravity for k in 1:8]
    heat=sum(mass.*dt)*m.atmosphere.heat_capacity
    water=sum(mass.*dq)
    fluxH=v.parameterizations.sensible_heat_flux[1];fluxE=v.parameterizations.surface_humidity_flux[1]
    @test isapprox(heat,fluxH;atol=1e-10,rtol=1e-12)
    @test isapprox(water,fluxE;atol=1e-15,rtol=1e-12)
    @test isapprox(fluxH,land*v.parameterizations.land.sensible_heat_flux[1]+(1-land)*v.parameterizations.ocean.sensible_heat_flux[1];atol=1e-10)
    @test isapprox(fluxE,land*v.parameterizations.land.surface_humidity_flux[1]+(1-land)*v.parameterizations.ocean.surface_humidity_flux[1];atol=1e-15)
    return (;land,skin,sst,availability,ice,snow,ri,drag=d,air,heat=fluxH,water=fluxE)
end

@testset "Boundary layer physics" begin
@testset "Interior Richardson uses the lowest air level and relative elevation" begin
    heights=[15000.,12000.,9500.,7200.,5000.,3100.,1700.,500.]
    function profile(orog,skin)
        column(;land=1.,skin,sst=skin,orography=orog)
        for step in 1:2,k in 1:8
            SW.get_step(v.grid.temperature,step).data[1,k]=285+(500-heights[k])*m.planet.gravity/m.atmosphere.heat_capacity
            SW.get_step(v.grid.humidity,step).data[1,k]=0.
            v.dynamics.geopotential[1,k]=(heights[k]+orog)*m.planet.gravity
        end
        if implementation=="fixed"
            return [boundary_layer_richardson(1,k,v,m.vertical_diffusion,m) for k in 1:8]
        end
        return copy(SW.bulk_richardson!(1,v,m.vertical_diffusion,m.time_stepping,m.atmosphere).data[1,:])
    end
    a=profile(0.,310.);b=profile(2500.,310.);cold=profile(0.,260.)
    @test maximum(abs.(a[1:7]))<1e-10
    @test all(isapprox.(a[1:7],b[1:7];atol=1e-10))
    @test isapprox(a[8],b[8];atol=1e-10)
    @test all(isapprox.(a[1:7],cold[1:7];atol=1e-10))
    @test a[8]<cold[8]
    println(JSON3.write((;implementation,interiorFlat=a,interiorMountain=b,interiorColdSkin=cold)))
end

@testset "Surface stability responds to the independent lower boundary" begin
    for land in (0.,1.)
        hot=column(;land,skin=310.,sst=310.)
        cold=column(;land,skin=260.,sst=260.)
        println(JSON3.write((;implementation,hot,cold)))
        @test hot.ri<0
        @test cold.ri>0
        @test hot.ri<cold.ri
        @test hot.drag>cold.drag
        @test hot.air==cold.air
        @test hot.heat>0&&cold.heat<0
    end
    ocean=column(;land=0.,skin=310.,sst=280.)
    land=column(;land=1.,skin=310.,sst=280.)
    mixed=column(;land=.5,skin=310.,sst=280.)
    @test land.ri<mixed.ri<ocean.ri
    @test land.air==mixed.air==ocean.air
    dry=column(;land=1.,skin=295.,sst=295.,availability=0.)
    wet=column(;land=1.,skin=295.,sst=295.,availability=1.)
    @test wet.ri<dry.ri
    flat=column(;land=1.,skin=310.,sst=310.,orography=0.)
    mountain=column(;land=1.,skin=310.,sst=310.,orography=2500.)
    @test isapprox(flat.ri,mountain.ri;atol=1e-12)
    @test isapprox(flat.drag,mountain.drag;atol=1e-14)
    water=column(;land=0.,skin=310.,sst=310.)
    ice=column(;land=0.,skin=310.,sst=310.,ice=1.)
    @test isapprox(ice.heat/water.heat,1/101;rtol=1e-12)
    @test isapprox(ice.water/water.water,1/101;rtol=1e-12)
    bare=column(;land=1.,skin=310.,sst=310.)
    snowy=column(;land=1.,skin=310.,sst=310.,snow=.1)
    @test isapprox(snowy.heat/bare.heat,1/3;rtol=1e-12)
    @test isapprox(snowy.water/bare.water,1/3;rtol=1e-12)
    println(JSON3.write((;implementation,mixed,dry,wet,flat,mountain,ice,snowy)))
end
end
