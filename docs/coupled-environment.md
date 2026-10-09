# Coupled environment

Generate climate constructs a deterministic geographic state at the selected date,
with no hidden warm-up or elapsed time. Play evolves it. The natural surface now
enables the thermal, water, ice/snow, ocean and vegetation systems together.

## Frozen water and energy

`WaterModel` stores vapor, soil, standing water, snow and sea ice in kg/m² of whole
equal-area cells. Its ocean reservoir uses kg/m² of the whole globe. Every local
transfer to/from ocean contributes 1/N; frozen stores are included in the water
residual. Snow water equivalent is numerically mm; sea-ice thickness divides by
917 kg/m³ and ocean fraction. Diagnostics average inventories over the globe.

The annual reference ice potential seeds 0–2 m sea ice. The generated snow target
is 150 mm times the reference snow fraction. Snow draws first from local surface
and soil water; the remaining snow request and sea-ice request share the finite
ocean inventory proportionally. No water is invented on dry planets. Initial
routing is re-diagnosed after freezing without transferring water or advancing
time. Ice plus liquid columns initialize at 271.35 K; warm snow columns are capped
at 273.15 K. Fully frozen columns may remain colder when no liquid ocean remains.
These temperature adjustments belong to the generated initial condition, before
the combined energy baseline. They avoid an artificial first-step supercooling
freeze. Local ice-surface estimates may remain colder than the mixed column.

For the fixed-capacity mixed columns, the modeled global enthalpy is:

`mean(C*T + 2.45e6*vapor − 334000*(snow + seaIce))` J/m².

Its change must equal accumulated net radiation. Internal phase transfers and
closed ocean heat transport cancel globally. Evaporation consumes vaporization
energy; condensation releases it; snowfall releases additional fusion energy.
Snow melt consumes available sensible heat above 273.15 K and enters standing
water before routing. Sea ice melts against heat above 271.35 K; cooling below
that reference freezes available ocean water, weighted by wet area. Every transfer
is limited by source mass and/or available sensible energy. The two phase passes
bracket water exchange, so newly condensed heat can melt snow in the same step.
Compensated accumulated heat/radiation terms avoid rounding drift after large
time-zero adjustments; their compensation terms join rollback checkpoints.

Coverage scales are chosen closures: 30 mm snow water equivalent and 0.5 m sea ice
saturate at full cover. The effective radiation albedo starts from the selected
Bond albedo, adds the small vegetation perturbation, then blends toward at least
0.65 under snow/ice. Disabling ice albedo leaves mass and latent heat active.

This is a single mixed thermal column, not separate air/land/water/ice layers.
Heat capacities remain fixed; moving water's sensible enthalpy, snow insulation,
salinity, ocean level, ice drift, glacier flow and meltwater refreezing in soil are
not resolved. Conservative bookkeeping does not imply empirical calibration.

## Prescribed ocean circulation

`ocean.ts` adds closed loops around four-cell wet plaquettes. Amplitude depends on
configured strength, seasonal zonal wind, latitude, longitude and the minimum
ice-free wet fraction. Net flows cancel on shared faces; each cell's net volume
flow is zero. Dry cells break loops. Donor-cell advection moves mixed-layer heat
in equal and opposite transfers. A combined outgoing-rate limiter preserves the
temperature bounds even for small planets or extreme strengths. Uniform
temperature stays uniform, and transport creates no global energy.

The displayed arrows are the resulting net cell velocities. This is an
illustrative wind-linked gyre template with arbitrary longitudinal anchoring,
not a momentum, pressure, salinity, Coriolis or deep-overturning calculation.
Ice reduces transport but is not itself advected. Setting strength to zero removes
ocean transport; atmospheric diffusion remains independent.

## Vegetation memory and feedback

Fine geographic samples start from annual mean/warmest temperature and rain.
The evolving model smooths temperature and rain over one Earth year. Warmest-month
suitability shifts with the mean anomaly. Cover approaches bounded rain/thermal/
soil suitability with a three-year growth and half-year decline timescale; biome
mixture weights approach the new climate classification over five years. Colors
blend these weights and bare ground. Thus transitions are gradual, not a sudden
forest-to-desert switch on a dry day.

Area-averaged land cover adds `0.06*(0.5−cover)*landFraction` to background albedo.
Land evaporation is scaled by `0.6+0.4*cover` and suppressed by snow; ocean
evaporation is suppressed by sea-ice cover. Turning vegetation evolution/feedback
off keeps generated vegetation fixed and removes its thermal/water perturbations.
There is no species, nutrient, carbon, fire, growth-water uptake or vegetation
erosion shielding model. Melt discharge enters the existing geological snapshot
workflow; it does not automatically advance geological time.

## Comparison and lifecycle

The comparison captures immutable maps, budgets and configuration metadata.
Parameter/terrain/date edits regenerate the current model while the baseline
remains available. Maps include natural surface, temperature, snow, sea ice,
vegetation and current arrows. The table reports deltas, polar ocean fractions,
water closure and combined enthalpy closure. Profiles average longitude; history
uses age since the latest generation and periodically decimates to at most 240
samples. CSV includes absolute date, age, all physics/environment configs and
metric values. It is a comparison report, not a restart or terrain file.

Frozen stores, fluxes, winds, vegetation means/weights and thermal energy terms
are restored together on acknowledged-frame rollback. Diagnostic derived fields
are rebuilt deterministically. Terrain documents keep their existing schema and
do not persist these runtime histories, comparisons or new switches.

Physical context: [MITgcm thermodynamic sea ice](https://mitgcm.readthedocs.io/en/latest/phys_pkgs/thsice.html)
describes enthalpy-based ice/ocean coupling; [NOAA GFDL ocean and ice](https://www.gfdl.noaa.gov/ocean-and-ice-processes/)
describes circulation's heat redistribution role. This code uses its own simplified
closures, not those models' numerical implementations or calibrated parameters.
