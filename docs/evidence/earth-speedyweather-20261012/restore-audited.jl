include("checkpoint.jl")
function restore_audited(path)
    sim=restore_checkpoint(path)
    # These derived diagnostics are retained by transform! and consumed by
    # parameterizations before the next transform. Reconstruct them from saved
    # physical/spectral state without shifting the two leapfrog grid time slots.
    vars=sim.variables;model=sim.model
    SpeedyWeather.temperature_average!(vars,SpeedyWeather.get_step(vars.prognostic.temperature,2),model.spectral_transform)
    SpeedyWeather.geopotential!(vars,model)
    return sim
end
