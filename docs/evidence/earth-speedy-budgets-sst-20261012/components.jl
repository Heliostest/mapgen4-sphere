using SpeedyWeather, Dates, SHA, JLD2
include("corrections.jl")
using .BudgetCorrections
const SW=SpeedyWeather
const MASS_CONTEXTS=IdDict{Any,Any}()
const SST_CONTEXTS=IdDict{Any,Any}()
struct AuditedBucket{T} <: SW.AbstractDynamicSoilMoisture
    inner::T
end
AuditedBucket(sg::SW.SpectralGrid)=AuditedBucket(SW.LandBucketMoisture(sg))
SW.variables(c::AuditedBucket,m::SW.AbstractModel)=(SW.variables(c.inner,m)...,
    SW.ParameterizationVariable(:deep_drainage,SW.Grid2D();namespace=:land,units="m",desc="Accumulated lower layer drainage"),
    SW.ParameterizationVariable(:soil_clipping_source,SW.Grid2D();namespace=:land,units="m",desc="Accumulated water introduced by lower bound clipping"))
SW.initialize!(c::AuditedBucket,m::SW.PrimitiveEquation)=SW.initialize!(c.inner,m)
SW.initialize!(v::SW.Variables,c::AuditedBucket,m::SW.PrimitiveEquation)=SW.initialize!(v,c.inner,m)
SW.timestep!(v::SW.Variables,c::AuditedBucket,m::SW.PrimitiveEquation)=SW.timestep!(v,c.inner,m)
function Base.filter!(v::SW.Variables,c::AuditedBucket,m::SW.PrimitiveEquation)
    land=v.parameterizations.land;γ=m.land.thermodynamics.field_capacity;H=m.land.geometry.layer_thickness
    audited_filter!(v.prognostic.land.soil_moisture.data,land.river_runoff.data,land.deep_drainage.data,land.soil_clipping_source.data,m.land_sea_mask.land_fraction.data,γ*H[1],γ*H[2],c.inner.infiltration_fraction)
end
struct AuditedSnow{T} <: SW.AbstractDynamicSnow
    inner::T
end
AuditedSnow(sg::SW.SpectralGrid)=AuditedSnow(SW.SnowModel(sg))
SW.variables(c::AuditedSnow,m::SW.AbstractModel)=(SW.variables(c.inner,m)...,
    SW.ParameterizationVariable(:snow_cap_outflow,SW.Grid2D();namespace=:land,units="m",desc="Liquid equivalent water removed by snow cap"),
    SW.ParameterizationVariable(:snow_clipping_source,SW.Grid2D();namespace=:land,units="m",desc="Unrealized candidate overmelt cancelled by snow clipping; not a physical source"))
SW.initialize!(c::AuditedSnow,m::SW.PrimitiveEquation)=SW.initialize!(c.inner,m)
SW.initialize!(v::SW.Variables,c::AuditedSnow,m::SW.PrimitiveEquation)=SW.initialize!(v,c.inner,m)
SW.timestep!(v::SW.Variables,c::AuditedSnow,m::SW.PrimitiveEquation)=SW.timestep!(v,c.inner,m)
function Base.filter!(v::SW.Variables,c::AuditedSnow,m::SW.PrimitiveEquation)
    before=copy(vec(SW.get_step(v.prognostic.land.snow_depth).data))
    filter!(v,c.inner,m)
    after=vec(SW.get_step(v.prognostic.land.snow_depth).data)
    v.parameterizations.land.snow_cap_outflow.data .+=max.(before.-after,0)
    v.parameterizations.land.snow_clipping_source.data .+=max.(after.-before,0)
end
struct CenteredSeasonalSST{T} <: SW.AbstractPrescribedOcean
    inner::T
    freezingK::Float64
end
@kwdef mutable struct SSTContext
    boundary::Any
    externalHeatJm2::Float64=0
    lastExternalHeatJm2::Float64=0
    lastExternalCellJm2::Vector{Float64}
    updates::Int=0
    targetTime::DateTime=DateTime(2001,1,1)
end
function register_sst!(m)
    boundary=CenteredSeasonalSST(m.spectral_grid);SW.initialize!(boundary,m)
    c=SSTContext(boundary=boundary,lastExternalCellJm2=zeros(m.geometry.npoints))
    SST_CONTEXTS[m]=c;return c
end
function prescribe_sst!(v,m,c)
    # Keep the native surface flux / ice response. After that response, an
    # explicitly budgeted external boundary maintains the prescribed SST.
    clock=v.prognostic.clock
    dtms=m.time_stepping.Δt_millisec.value÷(clock.step_counter<=1 ? 2 : 1)
    target=clock.time+Millisecond(dtms);b=monthly_bracket(target)
    mt=c.boundary.inner.monthly_temperature.data
    sst=vec(SW.get_step(v.prognostic.ocean.sea_surface_temperature).data)
    C=m.ocean.heat_capacity_mixed_layer;w=native_weights(m);marine=1 .-m.land_sea_mask.land_fraction.data
    for i in eachindex(sst)
        desired=max(c.boundary.freezingK,(1-b.weight)*mt[i,b.leftMonth]+b.weight*mt[i,b.rightMonth])
        c.lastExternalCellJm2[i]=C*(desired-sst[i]);sst[i]=desired
    end
    c.lastExternalHeatJm2=sum(w.*marine.*c.lastExternalCellJm2)
    c.externalHeatJm2+=c.lastExternalHeatJm2;c.updates+=1;c.targetTime=target
    return nothing
end
CenteredSeasonalSST(sg)=CenteredSeasonalSST(SW.SeasonalOceanClimatology(sg),271.35)
SW.initialize!(c::CenteredSeasonalSST,m::SW.PrimitiveEquation)=SW.initialize!(c.inner,m)
SW.initialize!(v::SW.Variables,c::CenteredSeasonalSST,m::SW.PrimitiveEquation)=SW.timestep!(v,c,m)
function SW.timestep!(v::SW.Variables,c::CenteredSeasonalSST,m::SW.PrimitiveEquation)
    b=monthly_bracket(v.prognostic.clock.time);mt=c.inner.monthly_temperature.data
    sst=vec(v.prognostic.ocean.sea_surface_temperature.data)
    @views @. sst=max(c.freezingK,(1-b.weight)*mt[:,b.leftMonth]+b.weight*mt[:,b.rightMonth])
end
function native_weights(m)
    solid=SW.RingGrids.get_solid_angles(m.spectral_grid.Grid,m.spectral_grid.nlat_half)
    return Float64[solid[r]/(4π) for r in m.geometry.whichring]
end
function air_stocks(v,m,w=native_weights(m);step=2)
    ps=exp.(vec(SW.get_step(v.grid.pressure,step).data));q=SW.get_step(v.grid.humidity,step).data
    qbar=q*m.geometry.σ_levels_thick
    total=sum(w.*ps)/m.planet.gravity;water=sum(w.*ps.*qbar)/m.planet.gravity
    return (;totalKgM2=total,waterKgM2=water,dryKgM2=total-water)
end
@kwdef mutable struct MassContext
    weights::Vector{Float64}
    targetDryKgM2::Float64
    scratchPressure::Any
    scratchHumidity::Any
    waterCorrectionMm::Float64=0
    sensibleCorrectionJm2::Float64=0
    totalMassCorrectionKgM2::Float64=0
    absoluteMassCorrectionKgM2::Float64=0
    maxRawDryRelative::Float64=0
    maxMemoryRawDryRelative::Float64=0
    memoryWaterModeMm::Float64=0
    memoryTotalMassModeKgM2::Float64=0
    maxMemoryDeltaLogPressure::Float64=0
    maxPostDryRelative::Float64=0
    lastDeltaLogPressure::Float64=0
    corrections::Int=0
end
function register_mass!(v,m;target=air_stocks(v,m).dryKgM2)
    c=MassContext(weights=native_weights(m),targetDryKgM2=target,
        scratchPressure=similar(SW.get_step(v.grid.pressure,1)),scratchHumidity=similar(SW.get_step(v.grid.humidity,1)))
    MASS_CONTEXTS[m]=c;return c
end
mass_ledger(c::MassContext)=(;targetDryKgM2=c.targetDryKgM2,waterCorrectionMm=c.waterCorrectionMm,sensibleCorrectionJm2=c.sensibleCorrectionJm2,totalMassCorrectionKgM2=c.totalMassCorrectionKgM2,absoluteMassCorrectionKgM2=c.absoluteMassCorrectionKgM2,maxRawDryRelative=c.maxRawDryRelative,maxMemoryRawDryRelative=c.maxMemoryRawDryRelative,memoryWaterModeMm=c.memoryWaterModeMm,memoryTotalMassModeKgM2=c.memoryTotalMassModeKgM2,maxMemoryDeltaLogPressure=c.maxMemoryDeltaLogPressure,maxPostDryRelative=c.maxPostDryRelative,corrections=c.corrections)
function constrain_mass!(v,m,c)
    lp=vec(SW.get_step(v.grid.pressure,2).data);q=SW.get_step(v.grid.humidity,2).data
    qbar=q*m.geometry.σ_levels_thick;g=m.planet.gravity
    a=mass_mode_shift(lp,qbar,c.weights,c.targetDryKgM2,g);δ=a.deltaLogPressure
    rawSensible=sum(c.weights.*exp.(lp).*(SW.get_step(v.grid.temperature,2).data*m.geometry.σ_levels_thick))/g*m.atmosphere.heat_capacity
    c.waterCorrectionMm+=a.rawWaterKgM2*expm1(δ);c.sensibleCorrectionJm2+=rawSensible*expm1(δ)
    dm=a.rawTotalKgM2*expm1(δ);c.totalMassCorrectionKgM2+=dm;c.absoluteMassCorrectionKgM2+=abs(dm)
    c.maxRawDryRelative=max(c.maxRawDryRelative,abs(a.rawDryKgM2/c.targetDryKgM2-1))
    SW.get_step(v.prognostic.pressure,2).data[1]+=δ*m.spectral_transform.norm_sphere
    lp .+=δ
    c.lastDeltaLogPressure=δ;c.corrections+=1
    c.maxPostDryRelative=max(c.maxPostDryRelative,abs(air_stocks(v,m,c.weights).dryKgM2/c.targetDryKgM2-1))
    # RAW filtering alters the retained spectral state. Its global mode needs
    # the same constraint, but do not overwrite the prior physical grid state.
    SW.transform!(c.scratchPressure,SW.get_step(v.prognostic.pressure,1),m.spectral_transform)
    SW.transform!(c.scratchHumidity,SW.get_step(v.prognostic.humidity,1),m.spectral_transform)
    qb=max.(c.scratchHumidity.data,0)*m.geometry.σ_levels_thick
    b=mass_mode_shift(vec(c.scratchPressure.data),qb,c.weights,c.targetDryKgM2,g)
    # These are retained RAW-memory diagnostics, not extra physical fluxes.
    c.memoryWaterModeMm+=b.rawWaterKgM2*expm1(b.deltaLogPressure)
    c.memoryTotalMassModeKgM2+=b.rawTotalKgM2*expm1(b.deltaLogPressure)
    c.maxMemoryDeltaLogPressure=max(c.maxMemoryDeltaLogPressure,abs(b.deltaLogPressure))
    SW.get_step(v.prognostic.pressure,1).data[1]+=b.deltaLogPressure*m.spectral_transform.norm_sphere
    c.maxMemoryRawDryRelative=max(c.maxMemoryRawDryRelative,abs(b.rawDryKgM2/c.targetDryKgM2-1))
    return nothing
end
function initial_field_comparison(v)
    old=JLD2.load(INITIAL_PATH)["containers"]
    fields=Dict{String,Any}()
    for k in (:temperature,:humidity,:u,:v,:pressure)
        current=getproperty(v.grid,k).data;reference=getproperty(old["grid"],k).data
        fields["grid."*string(k)]=(;exact=isequal(current,reference),maxAbsoluteDifference=maximum(abs.(current.-reference)),sha256=bytes2hex(sha256(reinterpret(UInt8,vec(copy(current))))))
    end
    for k in (:sea_surface_temperature,:sea_ice_concentration)
        current=getproperty(v.prognostic.ocean,k).data;reference=getproperty(old["prognostic"].ocean,k).data
        fields["ocean."*string(k)]=(;exact=isequal(current,reference),maxAbsoluteDifference=maximum(abs.(current.-reference)),sha256=bytes2hex(sha256(reinterpret(UInt8,vec(copy(current))))))
    end
    all(x->x.exact,values(fields))||error("Initial physical grid or ocean differs from frozen reference")
    return fields
end
function SW.SpeedyTransforms.transform!(v::SW.Variables,t::SW.Leapfrog,m::SW.PrimitiveWetModel;initialize::Bool=false)
    invoke(SW.transform!,Tuple{SW.Variables,SW.AbstractTimeStepper,SW.PrimitiveEquation},v,t,m;initialize)
    if !initialize&&haskey(MASS_CONTEXTS,m)
        constrain_mass!(v,m,MASS_CONTEXTS[m])
    end
    !initialize&&haskey(SST_CONTEXTS,m)&&prescribe_sst!(v,m,SST_CONTEXTS[m])
    return nothing
end
function experiment_model(sg,mode;callbacks=SW.CallbackDict())
    land=SW.LandModel(sg;soil_moisture=AuditedBucket(sg),snow=AuditedSnow(sg))
    # Both own an identical native slab/ice response. Seasonal mode registers
    # an external SST constraint separately, so ice never loses its flux step.
    ocean=SW.SlabOcean(sg)
    return SW.PrimitiveWetModel(sg;land,ocean,time_stepping=SW.Leapfrog(sg;Δt_at_T32=Minute(30)),feedback=nothing,callbacks)
end
const INITIAL_PATH="build/earth-speedyweather/annual-initial.jld2"
function apply_frozen_initial!(sim)
    old=JLD2.load(INITIAL_PATH)
    for key in ("prognostic","grid","tendencies","parameterizations")
        src=old["containers"][key]
        if key=="prognostic"
            # SST has no time axis in prescribed mode; copy owned physical
            # fields explicitly, then copy identical atmosphere and land shapes.
            for k in keys(src)
                k==:ocean&&continue
                SW.copy_variables!(NamedTuple{(k,)}((getproperty(sim.variables.prognostic,k),)),NamedTuple{(k,)}((getproperty(src,k),)))
            end
            for k in keys(src.ocean)
                dest=getproperty(sim.variables.prognostic.ocean,k);s=getproperty(src.ocean,k)
                for step in 1:1
                    SW.get_step(dest,step).data .=reshape(SW.get_step(s,step).data,size(SW.get_step(dest,step).data))
                end
            end
        else
            SW.copy_variables!(getproperty(sim.variables,Symbol(key)),src)
        end
    end
    return sim
end
function stock_hash(v)
    h=SHA.SHA2_256_CTX()
    for (name,a) in (("vorticity",v.prognostic.vorticity),("divergence",v.prognostic.divergence),("temperature",v.prognostic.temperature),("pressure",v.prognostic.pressure),("humidity",v.prognostic.humidity),("soil_temperature",v.prognostic.land.soil_temperature),("soil_moisture",v.prognostic.land.soil_moisture),("snow_depth",v.prognostic.land.snow_depth))
        SHA.update!(h,codeunits(name));SHA.update!(h,reinterpret(UInt8,vec(copy(a.data))))
    end
    return bytes2hex(SHA.digest!(h))
end
