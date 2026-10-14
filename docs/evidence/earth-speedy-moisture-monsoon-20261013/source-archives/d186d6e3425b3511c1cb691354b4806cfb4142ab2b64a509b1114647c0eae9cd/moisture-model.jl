include("components.jl")
include("condensation.jl")
const REPAIRED_MIXING=false
function repaired_model(sg,mode;callbacks=SW.CallbackDict())
    PRESERVE_MASS_WATER||error("Moisture repair requires MASS_IMPLEMENTATION=fixed")
    land=SW.LandModel(sg;soil_moisture=AuditedBucket(sg),snow=AuditedSnow(sg))
    SW.PrimitiveWetModel(sg;land,ocean=SW.SlabOcean(sg),large_scale_condensation=ConservativeCondensation(sg),
        time_stepping=SW.Leapfrog(sg;Δt_at_T32=Minute(30)),feedback=nothing,callbacks)
end
