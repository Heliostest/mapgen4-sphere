# East Asian rainfall: primary-source reference notes

Checked 2026-10-15. These references describe observations, climatological products, and published experiments. They do not establish the cause of any discrepancy in this repository's model.

## Rainfall progresses by region and season

The observed eastern-China latitude–time analysis in *Seasonal Transitions and the Westerly Jet in the Holocene East Asian Summer Monsoon* distinguishes the following stages. The study explicitly tests its seasonal-stage extraction against observed precipitation; these are climatological stages, not fixed dates in every year. [Primary paper, section 3](https://journals.ametsoc.org/view/journals/clim/30/9/jcli-d-16-0087.1.xml).

| Stage | Reference spatial and seasonal behavior |
| --- | --- |
| Southern China | Persistent spring rain precedes a pre-Meiyu increase in early May, especially around 18–25°N. |
| Yangtze / Meiyu | The rain belt shifts toward the Yangtze valley around mid-June. |
| Northern and northeastern China | A further northward transition occurs around mid-July. |
| Retreat | Southward retreat around late August / early September marks the summer monsoon's end. |

Source for all table rows: [primary paper, observed seasonal stages](https://journals.ametsoc.org/view/journals/clim/30/9/jcli-d-16-0087.1.xml). The publisher's indexed full-text excerpt was readable; direct publisher-page retrieval returned HTTP 403 during this check.

## Rainfall amount and circulation are different validation targets

Chiang, Kong, Wu and Battisti (2020) describe an early-summer rain belt extending from eastern China toward Japan, followed by a July shift toward northern China and Korea. Their controlled atmospheric-model experiments connect these stages to evolving moist southerlies, extratropical northerlies, and westerly flow around the Tibetan Plateau. The paper also describes the seasonal reversal of the land–ocean thermal contrast into the winter monsoon. [*Origins of East Asian Summer Monsoon Seasonality*, abstract and introduction; DOI 10.1175/JCLI-D-19-0888.1, author-hosted paper](https://atmos.uw.edu/~david/Chiang_etal_2020.pdf).

**Review inference:** an area-average rainfall total cannot identify those circulation features or the rain belt's position. Opposing wet/dry spatial errors can cancel. Examine the monthly latitude–time rainfall pattern, separate southern/central/northern regions, and inspect seasonal winds and moisture convergence before describing a circulation as validated. The published mechanisms are hypotheses to test in this model, not a demonstrated diagnosis of its code. [Physical context: Chiang et al. (2020)](https://atmos.uw.edu/~david/Chiang_etal_2020.pdf).

## Japan is not a uniform summer-wet / winter-dry region

JMA identifies early-summer Baiu rain with a stationary front between warm tropical-maritime and cooler polar-maritime air. In later summer the North Pacific High often brings hot, sunny conditions; autumn fronts and tropical cyclones contribute large September precipitation. Winter northwesterlies bring heavy snow on the Sea of Japan side and sunnier weather on the Pacific side. A Japanese regional average therefore mixes different seasonal and topographic regimes. [JMA, *Overview of Japan's climate*](https://ds.data.jma.go.jp/gmd/cpd/longfcst/en/tourist_japan.html).

## GPCC v2022: identify the actual climatology period

DWD defines GPCC Climatology v2022 as rain-gauge-based, gridded land precipitation with monthly totals. Its main background climatology focuses on 1951–2000; separate 30-year products include **1991–2020**, calculated using at least 20 complete years. Thus “v2022” alone does not identify a 1991–2020 reference period. This audit uses the frozen **2.5°** file, `normals_1991_2020_v2022_25.nc.gz`. DWD provides station count, interpolation error, and gauge-error fields alongside precipitation. [DWD product definition and downloads](https://opendata.dwd.de/climate_environment/GPCC/html/gpcc_normals_v2022_doi_download.html).

The resolution-specific 2.5° citation is Rustemeier et al. (2022), DOI [10.5676/DWD_GPCC/CLIM_M_V2022_250](https://doi.org/10.5676/DWD_GPCC/CLIM_M_V2022_250). For comparisons, record the file, period, land mask, and area weighting; reconcile monthly-total versus daily-rate units before computing errors. These last items are review recommendations, not measured results from the local model.
