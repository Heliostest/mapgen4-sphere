# Bounded evolving circulation

Stage 4 of the authorized phased environment work. Add optional `dynamicCirculation`, default false for old worlds. Winds combine the existing seasonal large-scale template with a prognostic perturbation driven by horizontal temperature contrasts, exact Coriolis rotation and linear surface drag. A diagnostic pressure-potential closure removes the authored lapse-rate contribution before taking spherical gradients. This is not a prognostic air-pressure, air-mass or full momentum solver.

Ocean currents gain five-day memory and respond to circulation of the actual surface wind around each completely wet plaquette. A streamfunction-like superposition of closed loops keeps discrete divergence zero. Pairwise upwind heat transfers retain the existing donor bound, uniform-temperature invariance and land barriers. No deep-ocean layer, salinity, overturning, kinetic-energy budget or GCM claim.

Every new memory field belongs to the complete simulation save and acknowledged-frame rollback. Old saves without the feature remain valid. Missing or invalid enabled state must be rejected before world replacement. Display the mode and current diagnostics; existing wind map and ocean comparison show the evolved vectors. One physical clock, bounded wind components consistent with the moisture CFL, no extra water or heat inventory.

Acceptance: uniform-field/no-force, Coriolis sign/drag, wind cap, wet/dry/ice barriers, conservative heat and moisture, exact continuation/rollback, schema rejection and old defaults; real browser evolution, save/restore, rejection, comparison, Original and mobile. Independent review before local commit.
