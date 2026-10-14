# Second batch of isolated corrections. The first-batch model remains frozen.
include("../earth-speedy-moisture-monsoon-20261013/physics-model.jl")
include("convection-corrected.jl")
include("cloud-correction.jl")
include("implicit-corrected.jl")
include("surface-evaporation-corrected.jl")
include("longwave-corrected.jl")
const PHYSICS_FIX=get(ENV,"PHYSICS_FIX","all-corrections")
PHYSICS_FIX in ("combined","combined-implicit","combined-evaporation","combined-longwave","all-corrections") || error("Unknown v2 configuration")
const FIX_IMPLICIT=PHYSICS_FIX in ("combined-implicit","all-corrections")
const FIX_EVAPORATION=PHYSICS_FIX in ("combined-evaporation","all-corrections")
const FIX_LONGWAVE=PHYSICS_FIX in ("combined-longwave","all-corrections")

function transport_model(sg,mode;callbacks=SW.CallbackDict())
    PRESERVE_MASS_WATER || error("Transport experiments require MASS_IMPLEMENTATION=fixed")
    land=SW.LandModel(sg;soil_moisture=AuditedBucket(sg),snow=AuditedSnow(sg))
    clouds=CorrectedDiagnosticClouds(sg;mode=:full)
    longwave=FIX_LONGWAVE ? SW.OneBandLongwave(sg;radiative_transfer=ReflectingLongwaveRadiativeTransfer(sg)) : SW.OneBandLongwave(sg)
    radiation=SW.Radiation(sg;shortwave=SW.OneBandShortwave(sg;clouds),longwave)
    implicit=FIX_IMPLICIT ? ConsistentImplicitPrimitiveEquation(sg) : SW.ImplicitPrimitiveEquation(sg)
    surface_humidity_flux=FIX_EVAPORATION ? SW.SurfaceHumidityFlux(sg;land=DewAwareLandHumidityFlux(sg)) : SW.SurfaceHumidityFlux(sg)
    SW.PrimitiveWetModel(sg;land,ocean=SW.SlabOcean(sg),boundary_layer=SurfaceAwareBoundaryLayer(sg),
        large_scale_condensation=ConservativeCondensation(sg),vertical_diffusion=ConservativeVerticalDiffusion(sg;surface_aware=true),
        convection=ConservativeParcelConvection(sg),radiation,implicit,surface_humidity_flux,
        time_stepping=SW.Leapfrog(sg;Δt_at_T32=Minute(30)),feedback=nothing,callbacks)
end
