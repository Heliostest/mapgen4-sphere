using SpeedyWeather, Dates, Test, JSON3, LinearAlgebra
const SW = SpeedyWeather
BLAS.set_num_threads(1)
implementation = get(ENV, "CLOUD_IMPLEMENTATION", "native")
implementation != "native" && include("cloud-correction.jl")
sg = SpectralGrid(NF=Float64, truncation=32, nlayers=8)
scheme = implementation == "native" ? SW.DiagnosticClouds(sg) : CorrectedDiagnosticClouds(sg; mode=Symbol(implementation))
rad = SW.Radiation(sg; shortwave=SW.OneBandShortwave(sg; clouds=scheme))
model = PrimitiveWetModel(sg; radiation=rad, time_stepping=Leapfrog(sg; Δt_at_T32=Minute(30)), feedback=nothing)
sim = initialize!(model)
v = sim.variables

# A controlled column, independent of climatological rain targets. gse is d(cp*T+Phi)/dPhi.
function column(; rain=0., gse=.25, dphi=10000., offset=0., land=0., rh=0., rh_bottom=.5)
    SW.reset_tendencies!(v,model.time_stepping)
    SW.reset_variables!(v)
    ps=100000.; cp=model.atmosphere.heat_capacity
    v.parameterizations.surface_pressure[1]=ps
    model.land_sea_mask.land_fraction[1]=land
    heights=[150000.,120000.,95000.,72000.,50000.,31000.,5000. + dphi,5000.]
    for step in 1:2,k in 1:8
        t=k==7 ? 290. + (gse-1)*dphi/cp : 290.
        SW.get_step(v.grid.temperature,step).data[1,k]=t
        p=SW.pressure(k,ps,model.geometry.vertical_coordinates)
        qsat=SW.saturation_humidity(t,p,model.atmosphere)
        SW.get_step(v.grid.humidity,step).data[1,k]=(k==8 ? rh_bottom : rh)*qsat
        v.dynamics.geopotential[1,k]=heights[k]+offset
    end
    v.parameterizations.rain_rate[1]=rain/(86400*1000)
    v.parameterizations.cloud_top[1]=rain>0 ? 3 : 9
    v.parameterizations.cos_zenith[1]=.5
    v.parameterizations.ocean.albedo[1]=.07
    v.parameterizations.land.albedo[1]=.2
    return nothing
end

function diagnose(; kwargs...)
    column(;kwargs...)
    before=(T=copy(v.grid.temperature.data),q=copy(v.grid.humidity.data),rain=v.parameterizations.rain_rate[1])
    result=SW.clouds!(1,v,scheme,model)
    @test isequal(before.T,v.grid.temperature.data) && isequal(before.q,v.grid.humidity.data)
    @test before.rain==v.parameterizations.rain_rate[1]
    @test all(iszero,SW.get_step(v.tendencies.grid.temperature).data) && all(iszero,SW.get_step(v.tendencies.grid.humidity).data)
    @test v.parameterizations.cloud_cover[1]==result.cloud_cover
    return result
end

function radiation(;kwargs...)
    column(;kwargs...)
    # Exercise the actual Radiation dispatch with native transmissivity and transfer.
    shortwave_only=SW.Radiation(model.radiation.shortwave,nothing)
    SW.parameterization!(1,v,shortwave_only,model)
    dt=SW.get_step(v.tendencies.grid.temperature).data[1,:]
    mass=[SW.pressure_thickness(k,100000.,model.geometry.vertical_coordinates)/model.planet.gravity for k in 1:8]
    atmosphere=sum(mass.*dt)*model.atmosphere.heat_capacity
    incoming=model.planet.solar_constant*v.parameterizations.cos_zenith[1]
    outgoing=v.parameterizations.outgoing_shortwave[1]
    surface=v.parameterizations.surface_shortwave_down[1]-v.parameterizations.surface_shortwave_up[1]
    residual=incoming-outgoing-surface-atmosphere
    @test abs(residual)<1e-9
    @test all(isfinite,dt)
    @test all(iszero,SW.get_step(v.tendencies.grid.humidity).data)
    return (;cover=v.parameterizations.cloud_cover[1],incoming,outgoing,surface,atmosphere,residual)
end

@testset "Cloud units and stability" begin
    @testset "Rain m/s to mm/day, square root contribution and cap" begin
        results=[]
        for (rain,expected) in ((0.,0.),(1.,.2),(4.,.4),(10.,.2sqrt(10.)),(20.,.2sqrt(10.)))
            result=diagnose(;rain)
            push!(results,(;rain_mm_day=rain,cover=result.cloud_cover,expected))
            @test isapprox(result.cloud_cover,expected;atol=1e-14)
        end
        println(JSON3.write((;implementation,precipitation=results)))
        mixed=diagnose(;rain=1.,rh=.65)
        @test isapprox(mixed.cloud_cover,.45;atol=1e-13)
        saturated=diagnose(;rain=10.,rh=1.)
        @test saturated.cloud_cover==1.
    end
    @testset "Dimensionless upward dry static energy gradient" begin
        results=[]
        for (gse,expected) in ((-.1,0.),(0.,0.),(.2,0.),(.25,0.),(.325,.3),(.4,.6),(.5,.6))
            result=diagnose(;gse)
            # precip_only deliberately preserves the native stability diagnosis for attribution.
            target=implementation=="precip_only" ? (gse<0 ? .6 : 0.) : expected
            push!(results,(;gse,cover=result.stratocumulus_cover,expected=target))
            @test isapprox(result.stratocumulus_cover,target;atol=1e-12)
        end
        println(JSON3.write((;implementation,stability=results)))
        a=diagnose(;gse=.325,dphi=10000.)
        b=diagnose(;gse=.325,dphi=20000.)
        c=diagnose(;gse=.325,dphi=10000.,offset=25000.)
        @test isapprox(a.stratocumulus_cover,b.stratocumulus_cover;atol=1e-12)
        @test isapprox(a.stratocumulus_cover,c.stratocumulus_cover;atol=1e-12)
        for land in (0.,.25,1.)
            r=diagnose(;gse=.4,land,rh_bottom=.5)
            expected=implementation=="precip_only" ? 0. : .6*(1-.5land)
            @test isapprox(r.stratocumulus_cover,expected;atol=1e-12)
        end
    end
    @testset "Actual Radiation interface, shortwave energy closure" begin
        clear=radiation(;rain=0.,gse=.25)
        rainy=radiation(;rain=1.,gse=.25)
        strat=radiation(;rain=0.,gse=.4)
        @test isapprox(rainy.cover,.2;atol=1e-14)
        @test rainy.outgoing>clear.outgoing
        @test rainy.surface<clear.surface
        if implementation!="precip_only"
            @test strat.outgoing>clear.outgoing
            @test strat.surface<clear.surface
        end
        println(JSON3.write((;implementation,radiation=(;clear,rainy,strat))))
        column(;rain=1.,gse=.325,rh=.5)
        SW.parameterization!(1,v,model.radiation,model)
        @test all(isfinite,SW.get_step(v.tendencies.grid.temperature).data[1,:])
        @test isfinite(v.parameterizations.outgoing_longwave[1])
        @test isapprox(v.parameterizations.cloud_cover[1],.2+((.5-.3)/.7)^2;atol=1e-13)
    end
    if implementation!="native"
        @testset "Drop-in declaration and unchanged coefficients" begin
            native=SW.DiagnosticClouds(sg)
            @test SW.variables(scheme)==SW.variables(native)
            @test all(getfield(scheme.inner,f)==getfield(native,f) for f in fieldnames(typeof(native)))
            @test_throws ArgumentError CorrectedDiagnosticClouds(sg;mode=:unknown)
        end
    end
end
