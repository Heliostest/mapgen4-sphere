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

During Play, these underlying types stay tied to the reference annual climate. The conservative thermal and water models retain their 48×24 equal-area grid. Their temperature and soil-fraction changes from the generated initial state are interpolated onto the local reference; temperature clamps at zero kelvin and soil fraction to [0,1]. This downscaling changes snow, sea ice and vegetation tint without advancing a separate surface solver or changing physical budgets. The local surface estimate in the cover probe can differ from the coarse thermal diagnostic. A cold day cannot turn a forest into tundra. This is not ecological succession, glacier evolution or an accumulating snow reservoir.

Snow cover is `clamp((273.15−T)/8) × clamp(annual rain/120)`. Cold alone cannot create snow in a completely dry cell. Snow blends the terrestrial color toward white; the potential perennial-ice class exposes barren substrate if the local temperature estimate warms above freezing. Sea-ice cover is `clamp((271.35−T)/6)`, a visual approximation with a −1.8°C freezing threshold. There is no local salinity or separate seawater-temperature model: it uses the downscaled temperature described above. Vegetation blends at most 35% toward a dry ochre tint below 60% soil capacity. All fractions clamp to [0,1]. None of these visual estimates transfers water or heat, changes Bond albedo, adds ice thickness, alters terrain geometry, or changes artistic river channels.

## Rendering and lifecycle

The 96×49 RGBA8 surface texture stores terrestrial RGB and sea-ice fraction in alpha. Its samples are spaced 3.75° in latitude, with endpoint texel centers at ±90°, and periodic longitude. Reference fields share a single scalar value at each pole before classification. This replaces the failed approach of blending the colors of the outer equal-area ring (centered around ±73.4°) toward an average at the pole: that approach rounded the fan tip but could not recover the missing local terrain and latitude. Linear filtering blends the new neighboring colors. Fine terrain elevations choose land versus ocean, so coastal bins do not paint vegetation over the sea. Existing relief shading, outline passes, ocean depth colors and river curves remain. The legend is a base-color key; shading, soil wetness and snow can alter the displayed color. Cover probes describe the nearest local reference sample, not a precise vegetation boundary or individual mountain snowline. No pole is forced white; its ice estimate still depends on the selected geographic and physical parameters.

The field is derived from restored temperature/water state, so it needs no additional evolving checkpoint. Reset/disable/unsupported slow spin clears the texture and probe. Portable terrain files keep their existing schema and load into Original map; climate cover is reconstructed when enabled, not stored as simulated history. When geological geometry is only being previewed, climate still represents its source terrain; applying erosion reconstructs climate on the accepted terrain as before.

Qualitative temperature/precipitation dependence is described in the [NASA-hosted GLOBE biome guide](https://mynasadata.larc.nasa.gov/sites/default/files/2019-04/Seasons-Biomes_Get-2-Know-Your-TerrBiome-10-27-10.pdf). The seawater freezing reference comes from [NSIDC's cryosphere guide](https://nsidc.org/learn/what-cryosphere). The thresholds, saturation widths and palette above are our chosen approximations, not models published by those organizations.
