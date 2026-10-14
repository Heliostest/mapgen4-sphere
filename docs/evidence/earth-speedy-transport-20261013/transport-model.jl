# Experiment-only composition; old modules and installed package remain frozen.
include("../earth-speedy-moisture-monsoon-20261013/physics-model.jl")
const PHYSICS_FIX=get(ENV,"PHYSICS_FIX","baseline")
PHYSICS_FIX in ("baseline","parcel","clouds-precip","clouds-full","combined")||error("Unknown physics configuration")
if PHYSICS_FIX in ("parcel","combined")
    include("convection-corrected.jl")
end
if PHYSICS_FIX in ("clouds-precip","clouds-full","combined")
    include("cloud-correction.jl")
end
function transport_model(sg,mode;callbacks=SW.CallbackDict())
    PRESERVE_MASS_WATER||error("Transport experiments require MASS_IMPLEMENTATION=fixed")
    land=SW.LandModel(sg;soil_moisture=AuditedBucket(sg),snow=AuditedSnow(sg))
    convection=PHYSICS_FIX in ("parcel","combined") ? ConservativeParcelConvection(sg) : SW.BettsMillerConvection(sg)
    clouds=PHYSICS_FIX in ("clouds-precip","clouds-full","combined") ? CorrectedDiagnosticClouds(sg;mode=PHYSICS_FIX=="clouds-precip" ? :precip_only : :full) : SW.DiagnosticClouds(sg)
    radiation=SW.Radiation(sg;shortwave=SW.OneBandShortwave(sg;clouds))
    SW.PrimitiveWetModel(sg;land,ocean=SW.SlabOcean(sg),boundary_layer=SurfaceAwareBoundaryLayer(sg),
        large_scale_condensation=ConservativeCondensation(sg),vertical_diffusion=ConservativeVerticalDiffusion(sg;surface_aware=true),
        convection,radiation,time_stepping=SW.Leapfrog(sg;Δt_at_T32=Minute(30)),feedback=nothing,callbacks)
end
