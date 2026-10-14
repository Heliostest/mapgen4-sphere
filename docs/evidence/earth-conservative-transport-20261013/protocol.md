# Conservative pressure and moisture core: protocol

This continues the user's request to repair water conservation. All previous evidence, installed SpeedyWeather sources and formal defaults remain frozen. New work is confined to this directory and `build/earth-conservative-transport`.

The immediate deliverable is a reusable source-free pressure/mass/tracer subsystem with actual pressure-wave feedback, positive humidity, shared local face budgets and restart. It is a prerequisite for coupling, not an atmospheric climate model. It must not be described as a replacement of the eight-layer hydrostatic temperature/divergence semi-implicit solve. No new six-year climate result is inferred from this subsystem.

Keep native T32 Gaussian area weights and eight sigma thicknesses. Native state and winds are imported from the original frozen 2001 state with the previous, separately verified scalar projection; record its small import inventory difference. Prognostic pressure and water stay in finite-volume grid storage. Any spectral projection is diagnostic only. No global mass correction, clipping, residual injection, regional multiplier or temperature floor.

Acceptance: local face continuity and global air/water/dry mass to floating-point solve accuracy; constant tracer; nonnegative sharp tracer and both dry and wet bounds; hydrostatic reference at rest; a compressional wave with propagating phase and convergence (not only decay); rigid rotation error under refinement; conservative sigma redistribution with zero top/bottom boundary; exact own-state checkpoint/restart. Preserve native legacy RED evidence and new algorithm failures. A passing three-day subsystem run is not the earlier coupled three-day acceptance gate.

The pressure subsystem uses first-order backward Euler; its diffusion and phase error must be measured. The nominal native-scale step is 1800 s; predictor-positive subdivisions may be accepted and counted explicitly. Test 1800/900/450 s separately rather than silently declaring subcycling equivalent to the old 30-minute LF/RAW scheme.

Source and input hashes are captured per execution. During test-driven development source versions may evolve only between completed runs; archive each exact version. Once the final candidate starts acceptance runs its sources freeze; changes require a new candidate name. Previous evidence is never regenerated in place.
