# A dry-air-only global mass correction: preserve p*q in every grid cell/layer.
# Existing pressure-only correction also changes the water stock. Solving
# p' = lambda*p, q' = q/lambda gives D' = lambda*M - W = D_target.
function dry_mass_water_shift(logp,qbar,weights,targetDry,gravity)
    a=BudgetCorrections.mass_mode_shift(logp,qbar,weights,targetDry,gravity)
    delta=log((targetDry+a.rawWaterKgM2)/a.rawTotalKgM2)
    scale=exp(-delta)
    all(x->x*scale<1,qbar)||throw(ArgumentError("Dry-air correction would make water fraction >=1"))
    return (;a...,deltaLogPressure=delta,humidityScale=scale)
end
