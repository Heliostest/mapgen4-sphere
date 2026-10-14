include("components.jl")
include("condensation.jl")
include("boundary-layer.jl")
include("vertical-diffusion.jl")
const REPAIRED_MIXING=get(ENV,"MIXING_IMPLEMENTATION","fixed")=="fixed"
function repaired_model(sg,mode;callbacks=SW.CallbackDict())
    PRESERVE_MASS_WATER||error("Full repaired experiments require MASS_IMPLEMENTATION=fixed")
    land=SW.LandModel(sg;soil_moisture=AuditedBucket(sg),snow=AuditedSnow(sg))
    mixing=REPAIRED_MIXING ? ConservativeVerticalDiffusion(sg;surface_aware=true) : SW.BulkRichardsonDiffusion(sg)
    SW.PrimitiveWetModel(sg;land,ocean=SW.SlabOcean(sg),boundary_layer=SurfaceAwareBoundaryLayer(sg),large_scale_condensation=ConservativeCondensation(sg),vertical_diffusion=mixing,
        time_stepping=SW.Leapfrog(sg;Δt_at_T32=Minute(30)),feedback=nothing,callbacks)
end
