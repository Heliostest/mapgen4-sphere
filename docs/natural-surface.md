# Ice and potential vegetation

Choose **Natural surface (ice & vegetation)** or **Generate climate now**. The generated climate immediately colors the map, without Play or elapsed model time. Original map remains the unchanged elevation/rainfall palette. Diagnostic temperature, rain and wind layers remain available. Ice, vegetation, temperature and moisture are reconstructed after terrain, physical parameters or manual date changes. Camera and display edits preserve history. The natural layer's legend and inspection identify potential cover rather than measured vegetation or ice mass.

## Annual reference and cover

`surface.ts` samples the existing geographic climate generator at 12 evenly spaced midpoints across one orbital year, without running its transient solver. Natural cover uses a separate 96×49 latitude reference, including both poles. `surface-grid.ts` samples the authored pre-fold terrain locally. Coastal land fraction uses geographic bins (nearest terrain vertex when empty); land height uses the four angular-nearest vertices, weighted by inverse squared chord distance and normalized over land samples. The actual nearest polar vertex supplies each exact pole. Heights cannot use narrow longitude-bin membership: near a pole, adjacent bins can contain vertices several degrees apart in latitude, creating false alternating high/low ridges. Both membership and angular weights are reused across painting. Annual mean temperature, warmest sampled temperature and mean rain rate are independent of the selected season or epoch. Rain is expressed as an Earth-year equivalent (`mean mm/day × 365.2425`) so changing orbital length alone cannot change a water-demand threshold. The reference uses physical height, thermal settings, land/sea influence and the wind/orographic rainfall estimate already described in [generated climate](generated-climate.md).

Classification follows the first matching row. Thresholds are illustrative, not a Köppen implementation or a calibrated ecological model. Temperatures below are °C; precipitation is mm per Earth year.

| Condition | Potential cover |
| --- | --- |
| Mean >45, or warmest <10 with rain <50 | Barren ground |
| Warmest <0 | Perennial ice / snow |
| Warmest <10 | Tundra |
| Rain <250 | Desert |
| Rain <max(500,25×mean temperature) | Grassland / steppe |
| Mean <5 | Boreal forest |
| Mean <20 | Temperate forest |
| Rain <1000 | Savanna |
| Rain <1600 | Tropical seasonal forest |
| Otherwise | Tropical rainforest |

During Play, these underlying types stay tied to the reference annual climate. The conservative thermal and water models retain their 48×24 equal-area grid. Their temperature and soil-fraction changes from the generated initial state are interpolated onto the local reference; temperature clamps at zero kelvin and soil fraction to [0,1]. This downscaling changes snow and vegetation tint and supplies the separate diagnostic sea-ice history described below, without changing the conservative physical budgets. The local surface estimate in the cover probe can differ from the coarse thermal diagnostic. A cold day cannot turn a forest into tundra. This is not ecological succession, glacier evolution or an accumulating land-snow reservoir.

Snow cover is `clamp((273.15−T)/8) × clamp(annual rain/120)`. Cold alone cannot create snow in a completely dry cell. Snow blends the terrestrial color toward white; the potential perennial-ice class exposes barren substrate if the local temperature estimate warms above freezing. Vegetation blends at most 35% toward a dry ochre tint below 60% soil capacity. All fractions clamp to [0,1]. None of these visual estimates transfers water or heat, changes Bond albedo, alters terrain geometry, or changes artistic river channels.

## Sea ice with freezing and melting history

The former instantaneous `clamp((271.35−T)/6)` rule erased all winter sea ice whenever the thermal estimate rose above freezing. At the default equinox phase it produced north/south ocean estimates of about −35/+7°C at ±86.25°, and therefore no southern ocean ice. Rendering was already capable of drawing sea ice. The temperature generator and its seasonal lag are unchanged; the fix gives sea ice a finite freeze/melt history rather than forcing hemispheres to share a temperature or painting fixed white caps.

`sea-ice.ts` maintains a bounded **diagnostic ice potential** `E` in J/m². Its signed cooling estimate is `q = B (Tf − T)`, where `Tf=271.35 K` and `B=4 ε σ Tf³`. Each step applies `E=clamp(E+q Δt,0,Emax)`. For this illustrative closure, density is 917 kg/m³, fusion latent heat 334,000 J/kg, and `Emax` is their product times a chosen 2 m reference column. Display coverage is `clamp(E/(ρ L × 0.5 m))`. The 2 m cap and 0.5 m coverage scale are modeling choices, not measured thickness or a fitted ice-concentration law. Short warmth reduces stored potential; sustained warmth can erase it. No minimum coverage is imposed at either pole.

Generation uses the same twelve midpoint annual climate samples to construct monthly cooling estimates. The periodic fixed point of their bounded energy additions is found directly from lower/upper endpoint sweeps, then evaluated at the selected date, including a partial month. It does not run hidden warmup years, spend clock time, or advance the thermal/water solvers. Orbital duration sets the seconds in each reference month. With symmetric terrain, shifting phase by half an orbit exchanges the hemispheres; zero tilt removes their seasonal difference.

During Play, diagnostic ice advances on every existing fixed thermal substep, including when the water tracer is disabled. It shares the presented-frame checkpoint, so frame batching, pause/rollback, regeneration and reset preserve its history correctly. It does not feed latent heat or melted water back into either conservative solver. Thus the displayed **ice-free thermal estimate** may be above freezing while diagnostic sea ice persists. It is not actual water beneath ice. There is no salinity, snow insulation, ice transport, ocean heat-flux model, thickness prediction or mass accounting. This is a potential-cover improvement, not a thermodynamically coupled sea-ice model.

## Rendering and lifecycle

The 96×49 RGBA8 surface texture stores terrestrial RGB and sea-ice fraction in alpha. Its samples are spaced 3.75° in latitude, with endpoint texel centers at ±90°, and periodic longitude. Reference fields share a single scalar value at each pole before classification. This replaces the failed approach of blending the colors of the outer equal-area ring (centered around ±73.4°) toward an average at the pole: that approach rounded the fan tip but could not recover the missing local terrain and latitude. Linear filtering blends the new neighboring colors. Fine terrain elevations choose land versus ocean, so coastal bins do not paint vegetation over the sea. Existing relief shading, outline passes, ocean depth colors and river curves remain. The legend is a base-color key; shading, soil wetness and snow can alter the displayed color. Cover probes describe the nearest local reference sample, not a precise vegetation boundary or individual mountain snowline. No pole is forced white; its ice estimate still depends on the selected geographic and physical parameters.

Land cover is derived from restored temperature/water state; diagnostic sea-ice energy is restored from its own copy in the same presentation checkpoint. Reset/disable/unsupported slow spin clears the texture, probe and ice history. Portable terrain files keep their existing schema and load into Original map; climate cover is reconstructed when enabled, not stored as simulated history. When geological geometry is only being previewed, climate still represents its source terrain; applying erosion reconstructs climate on the accepted terrain as before.

Qualitative temperature/precipitation dependence is described in the [NASA-hosted GLOBE biome guide](https://mynasadata.larc.nasa.gov/sites/default/files/2019-04/Seasons-Biomes_Get-2-Know-Your-TerrBiome-10-27-10.pdf). [NSIDC's sea-ice science guide](https://nsidc.org/learn/parts-cryosphere/sea-ice/science-sea-ice) explains the −1.8°C freezing reference, accumulated cold, and why winter ice can survive a warm season. [NSIDC's polar comparison](https://nsidc.org/learn/ask-scientist/how-does-antarctic-sea-ice-differ-arctic-sea-ice) explains opposite seasons and geographic differences; real Arctic and Antarctic extents need not match. The diagnostic closure, thresholds, saturation widths and palette above are our chosen approximations, not models published by those organizations.
