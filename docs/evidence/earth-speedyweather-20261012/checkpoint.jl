using JLD2
const CHECKPOINT_PARTS=(:time_stepping,:implicit,:ocean,:sea_ice,:land,:solar_zenith,:albedo,:radiation,:horizontal_diffusion,:vertical_diffusion,:surface_momentum_flux,:surface_heat_flux,:surface_humidity_flux,:large_scale_condensation,:convection,:drag)
function checkpoint(path,vars,model)
    # Materialized public fields restore into fresh fused buffers; never serialize FFT plans.
    parts=Dict(string(k)=>getproperty(model,k) for k in CHECKPOINT_PARTS)
    containers=Dict(string(k)=>SpeedyWeather.materialize_views(getproperty(vars,k)) for k in (:prognostic,:grid,:tendencies,:scratch,:parameterizations))
    JLD2.jldsave(path;containers,components=parts,version=string(pkgversion(SpeedyWeather)),scaledRadius=vars.prognostic.scale[])
end
function restore_checkpoint(path)
    saved=JLD2.load(path)
    saved["version"]==string(pkgversion(SpeedyWeather))||error("Checkpoint version mismatch")
    sg=SpectralGrid(NF=Float64,truncation=32,nlayers=8)
    model=PrimitiveWetModel(sg;time_stepping=Leapfrog(sg;Δt_at_T32=Minute(30)),feedback=nothing)
    sim=initialize!(model;time=DateTime(2001,1,1))
    for (key,value) in saved["components"]
        setproperty!(model,Symbol(key),value)
    end
    for (key,value) in saved["containers"]
        SpeedyWeather.copy_variables!(getproperty(sim.variables,Symbol(key)),value)
    end
    # Finalize unscales spectral vor/div. Regular stepping requires radius scaling.
    sim.variables.prognostic.scale[]==1&&SpeedyWeather.scale_prognostic!(sim.variables,model.planet.radius)
    model.output.active=false
    return sim
end
