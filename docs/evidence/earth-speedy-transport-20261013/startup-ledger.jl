"""Diagnostic-only scalar flux accounting; no model methods or model state mutations."""
module StartupFluxBudgets
export LeapfrogFluxLedger, advance_flux!, ledger_snapshot, restore_ledger, budget_residuals

Base.@kwdef mutable struct LeapfrogFluxLedger
    old::Float64 = 0.0
    current::Float64 = 0.0
    rectangular::Float64 = 0.0
    elapsed_seconds::Float64 = 0.0
    last_counter::Int = -1
end

"""
Advance an external flux integral with SpeedyWeather's Leapfrog/RAW convention.
Call once for each tendency evaluation, using its pre-update clock step_counter.
Flux is in stock-units/second; nominal_dt is seconds (not radius-scaled).
The two startup atmospheric update intervals are dt/2 and dt while the clock
advances dt/2 each time; later atmospheric updates span 2dt and the clock dt.
No atmospheric water or physical flux is adjusted by this diagnostic.
"""
function advance_flux!(b::LeapfrogFluxLedger, rate; nominal_dt, step_counter, robert_filter, williams_filter)
    step_counter == b.last_counter + 1 || throw(ArgumentError("Flux ledger requires consecutive counters; restore its checkpoint when resuming"))
    isfinite(rate) && isfinite(nominal_dt) && nominal_dt > 0 || throw(ArgumentError("finite rate and positive finite nominal_dt required"))
    all(isfinite, (robert_filter, williams_filter)) || throw(ArgumentError("finite RAW coefficients required"))
    startup = step_counter <= 1
    dt = step_counter == 0 ? nominal_dt / 2 : step_counter == 1 ? nominal_dt : 2nominal_dt
    elapsed = startup ? nominal_dt / 2 : nominal_dt
    w1 = startup ? 0.0 : robert_filter * williams_filter / 2
    w2 = startup ? 0.0 : robert_filter * (1 - williams_filter) / 2
    new = b.old + dt * rate
    reference = startup ? b.old : b.current
    update = b.old - 2reference + new
    b.old = reference + w1 * update
    b.current = new - w2 * update
    b.rectangular += elapsed * rate
    b.elapsed_seconds += elapsed
    b.last_counter = step_counter
    return b.current
end

ledger_snapshot(b::LeapfrogFluxLedger) = (; version=1, b.old, b.current,
    b.rectangular, b.elapsed_seconds, b.last_counter)
function restore_ledger(s)
    s.version == 1 || throw(ArgumentError("unsupported flux-ledger checkpoint version"))
    all(isfinite, (s.old, s.current, s.rectangular, s.elapsed_seconds)) || throw(ArgumentError("nonfinite flux-ledger checkpoint"))
    return LeapfrogFluxLedger(;old=s.old,current=s.current,rectangular=s.rectangular,
        elapsed_seconds=s.elapsed_seconds,last_counter=s.last_counter)
end

"""Retain both time conventions; their difference is never labeled a physical flux."""
budget_residuals(b::LeapfrogFluxLedger, water_change) = (
    rectangularResidual = water_change - b.rectangular,
    timeStaggerContribution = b.current - b.rectangular,
    discreteFluxResidual = water_change - b.current,
)
end
