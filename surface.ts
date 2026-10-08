import {generateClimate} from './climate.ts';
import {deriveOrbit,type OrbitConfig} from './astronomy.ts';
import type {PlanetConfig} from './planet.ts';
import type {ThermalGrid,ThermalConfig} from './thermal.ts';
import type {WaterConfig} from './water.ts';

/** Potential cover, not a vegetation, snow-mass or ice-flow simulation. */
export const BIOMES={
    ice:{label:'Perennial ice / snow',color:[234,242,240]},
    tundra:{label:'Tundra',color:[143,153,125]},
    boreal:{label:'Boreal forest',color:[46,88,76]},
    temperate:{label:'Temperate forest',color:[70,121,66]},
    grassland:{label:'Grassland / steppe',color:[156,168,89]},
    desert:{label:'Desert',color:[215,182,122]},
    savanna:{label:'Savanna',color:[179,173,83]},
    'tropical-forest':{label:'Tropical seasonal forest',color:[90,137,61]},
    rainforest:{label:'Tropical rainforest',color:[27,101,63]},
    barren:{label:'Barren ground',color:[151,132,112]},
} as const;
export type Biome=keyof typeof BIOMES;
export interface SurfaceClimate {meanTemperatureK:number;warmestTemperatureK:number;annualRainMm:number;}
export interface SurfaceReference {meanTemperatureK:Float64Array;warmestTemperatureK:Float64Array;annualRainMm:Float64Array;}
const clamp=(x:number)=>Math.max(0,Math.min(1,x));

/** Illustrative Earth-inspired thresholds; not a Köppen classification. */
export function classifyBiome(meanK:number,warmestK:number,rainMm:number):Biome {
    const mean=meanK-273.15,warmest=warmestK-273.15;
    if(mean>45 || (warmest<0 && rainMm<50))return 'barren';
    if(warmest<0)return 'ice';
    if(warmest<10)return 'tundra';
    if(rainMm<250)return 'desert';
    if(rainMm<Math.max(500,25*mean))return 'grassland';
    if(mean<5)return 'boreal';
    if(mean<20)return 'temperate';
    if(rainMm<1000)return 'savanna';
    return rainMm<1600?'tropical-forest':'rainforest';
}

/** Sample one full reference year analytically; never advance model time.
 * Anchor phases independently of the selected date to keep vegetation stable. */
export function generateSurfaceReference(grid:ThermalGrid,planet:PlanetConfig,orbit:OrbitConfig,thermal:ThermalConfig,water:WaterConfig,land:ArrayLike<number>,heightM:ArrayLike<number>):SurfaceReference {
    const meanTemperatureK=new Float64Array(grid.count),warmestTemperatureK=new Float64Array(grid.count),annualRainMm=new Float64Array(grid.count);
    const {yearS}=deriveOrbit(planet,orbit),annualOrbit={...orbit,orbitPhaseRad:0,spinPhaseRad:0};
    for(let month=0;month<12;month++) {
        const c=generateClimate(grid,planet,annualOrbit,thermal,water,land,heightM,(month+.5)*yearS/12);
        for(let i=0;i<grid.count;i++) {
            meanTemperatureK[i]+=c.temperatureK[i]/12;
            warmestTemperatureK[i]=Math.max(warmestTemperatureK[i],c.temperatureK[i]);
            // Earth-year equivalent: thresholds describe available water per
            // fixed time, so a longer orbit alone cannot create a rainforest.
            annualRainMm[i]+=c.rainMmDay[i]*365.2425/12;
        }
    }
    return {meanTemperatureK,warmestTemperatureK,annualRainMm};
}

export function surfaceCover(climate:SurfaceClimate,temperatureK:number,soilFraction:number) {
    const biome=classifyBiome(climate.meanTemperatureK,climate.warmestTemperatureK,climate.annualRainMm);
    const snowFraction=clamp((273.15-temperatureK)/8)*clamp(climate.annualRainMm/120);
    const seaIceFraction=clamp((271.35-temperatureK)/6);
    const base=BIOMES[biome==='ice'?'barren':biome].color;
    const dry=biome==='barren'||biome==='desert'||biome==='ice'?0:.35*(1-clamp(soilFraction/.6));
    const dormant=[166,145,97],snow=BIOMES.ice.color;
    const color=base.map((c,i)=>(c*(1-dry)+dormant[i]*dry)*(1-snowFraction)+snow[i]*snowFraction);
    return {biome,snowFraction,seaIceFraction,color};
}
