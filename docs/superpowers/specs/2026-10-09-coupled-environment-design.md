# Coupled environment

The authorized scope includes snow/sea-ice mass and fusion energy, melt routing,
ocean heat transport, gradual vegetation change and an inspectable comparison UI.
Generated geography must be ready at time zero; Play evolves fixed steps.

## Design

- Water owns atmosphere, soil, surface, snow and sea-ice inventories. Frozen
  stores are kg/m² of whole equal-area cells; ocean inventory is per global area.
  Snow precipitation and ocean freezing release fusion heat; melting consumes it.
  Evaporation/condensation also exchange latent heat with the thermal column.
  Energy accounting includes vapor and frozen enthalpy. No glacier dynamics.
- A dedicated environment module owns phase adjustment and albedo, conservative
  closed ocean circulation loops, and vegetation history. Coast masks prevent
  heat crossing dry land; no pressure, salinity or deep-ocean dynamics are implied.
- Initial frozen stores are drawn from available water. Their generated thermal
  adjustment defines the time-zero baseline, not a hidden simulation warm-up.
- Fine geographic surface samples retain the corrected polar terrain. Displayed
  snow/ice distributions downscale physical cell inventories using the generated
  geographic pattern; probes distinguish local estimates from cell inventories.
- Vegetation initializes from annual climate, then relaxes toward sustained
  climate/moisture suitability. Cover affects albedo and land evaporation.
- All evolving state and budget terms participate in acknowledged-frame rollback.
- A comparison panel contains baseline/current surface maps, ocean arrows,
  latitude profiles, metric deltas, polar coverage, history and CSV export.
  Baselines survive parameter edits until explicitly replaced.

## Acceptance

Mass and total enthalpy close; freeze/melt is source/energy limited; melt reaches
the routing/erosion forcing. Ocean transport conserves energy and cannot cross
land. Vegetation responds slowly and boundedly. Initial generation, frame
partitioning, rollback and both poles have regression coverage. Production UI
must be visually inspected, including comparison and a running state.

Physical concepts: MITgcm thermodynamic sea-ice documentation
https://mitgcm.readthedocs.io/en/latest/phys_pkgs/thsice.html and NOAA GFDL ocean/ice
https://www.gfdl.noaa.gov/ocean-and-ice-processes/ . The numerical closures here
are illustrative choices, not implementations or calibrations of those models.
