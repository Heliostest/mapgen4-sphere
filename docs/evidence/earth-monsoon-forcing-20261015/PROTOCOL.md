# Seasonal circulation and thermal forcing diagnostic

Exploratory evidence only. Production model and the formal Earth save stay unchanged.
Question approved by the user: does constraining seasonal circulation or thermal state
remove East Asian rainfall errors before changing the precipitation closure?

Use NOAA PSL NCEP–NCAR Reanalysis 1 monthly 1991–2020 climatologies, matching the
GPCC normal period. Reanalysis combines observations with a forecast model and is
not a direct wind observation. Preserve URLs, raw hashes, units, period and valid-year counts.

Start all runs from the exact formal day-zero inventories on the complete terrain.
Use the previously audited `shared-core` profile (transport moisture and air radiation
fraction 0.5) as the common, experimental baseline. One orbital year, 1800 s steps,
March 20 origin. This diagnoses the first-year transient, not equilibrated climate.

Primary 2 × 2 experiment: native / prescribed 10 m wind × native / thermally constrained.
The thermal intervention relaxes model air toward 2 m air temperature and existing
land/ocean surface reservoirs toward reanalysis skin temperature with a one-day timescale.
Skin temperature over water is an effective surface temperature, including ice, **not
an independent SST product**. Mixed coastal source cells have no separate land/ocean
temperatures; the same remapped skin field is used for both existing reservoirs.
The ocean reservoir is liquid water, not the top of sea ice: its target is bounded
below by the model's seawater freezing point. This avoids repeatedly forcing the
bulk ocean below freezing when reanalysis skin represents ice. This floor is an
approximate observation operator, not an observed ice-underwater temperature.
The model's single air temperature is not a rigorously identified 2 m or pressure-level
temperature. This is a sensitivity probe, not a validated vertical observation operator.

Additional wind sensitivity: replace 10 m winds with humidity-weighted 300 hPa–surface
transport winds, derived from monthly mean q and winds on pressure levels. Mask pressure
levels below monthly mean surface pressure; extend the lowest valid above-ground
sample to the surface. A midpoint layer intersecting the surface may not use a
below-ground sample, even for its above-ground fraction.
Remap q dp and q u dp / q v dp separately before division. These products omit transient
covariances and upper-tropospheric humidity; they are **not observed full IVT**.
No humidity or precipitation observations are injected into the model.

Conservatively remap spherical cell averages onto the model's equal-area grid.
Use Gaussian quadrature latitude boundaries for the Gaussian grid and midpoint
latitude boundaries for pressure fields. Periodic longitude cell overlaps handle the seam.
Interpolate monthly targets linearly between month centers with periodic annual wrap.

Apply prescribed winds to the water transport and coupled environment every step.
Record every clipped component if the model's configured wind bound is reached.
Thermal nudging is an external energy source/sink, recorded separately from radiation
and internal exchange; never alter the budget origin to conceal it. Check the coupled
enthalpy ledger after subtracting external forcing. Water remains closed. Thermally
forced trajectories cannot be exported as ordinary strict-runtime saves because the
production save schema has no external-forcing ledger; do not claim strict continuation.

Report matched GPCC-support monthly rainfall, rainfall mechanisms, thermal and wind
diagnostics, water/enthalpy/routing residuals, and negative controls outside East Asia.
Also retain grid fields and humidity-weighted model meridional transport, rather than
inferring moisture delivery solely from area-mean northward wind. No regional coefficient
tuning or production promotion is part of this diagnostic.

Wind also enters bulk evaporation and the ocean circulation closure, so the wind
intervention is not an isolated advection-only experiment. Diagnose the coupled
response and do not uniquely attribute an improvement to vapor advection.
Air/land temperature diagnostics use the GPCC land support; `seaC` is retained as
raw bookkeeping only and is not an SST comparison (absent-ocean cells contain placeholders).
