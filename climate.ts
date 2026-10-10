import {dailyMeanInsolation,type ThermalGrid,type ThermalConfig} from './thermal.ts';
import {deriveOrbit,sunState,STEFAN_BOLTZMANN,type OrbitConfig} from './astronomy.ts';
import {DEFAULT_PLANET,type PlanetConfig} from './planet.ts';
import type {WaterConfig} from './water.ts';
import {referenceMoisture} from './reference-moisture.ts';
import type {EnvironmentConfig} from './environment.ts';

const clamp=(x:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,x));
export type ClimateGrid=Pick<ThermalGrid,'width'|'height'|'count'|'sinLat'>&{edges:readonly {a:number;b:number}[]};
/** Earth-inspired surface wind template, not a pressure/momentum solver.
 * Positive components point east/north. Season shifts the convergence belt. */
export function circulationWinds(grid:ClimateGrid,planet:PlanetConfig,orbit:OrbitConfig,timeS:number,land:ArrayLike<number>,strength:number) {
    const declination=sunState(planet,orbit,timeS).declinationRad;
    const eastMps=new Float64Array(grid.count),northMps=new Float64Array(grid.count);
    const rotation=Math.min(1,DEFAULT_PLANET.siderealPeriodS/planet.siderealPeriodS);
    for(let i=0;i<grid.count;i++) {
        const lat=Math.asin(grid.sinLat[Math.floor(i/grid.width)]);
        const shifted=(lat-.4*declination)*180/Math.PI,d=Math.min(90,Math.abs(shifted));
        const band=Math.min(2,Math.floor(d/30)),shape=Math.sin(Math.PI*(d-band*30)/30);
        const speed=strength*(1-.25*land[i])*shape;
        eastMps[i]=(band===1?1:-1)*speed*rotation*(planet.retrograde?-1:1);
        northMps[i]=(band===1?1:-1)*Math.sign(shifted)*.35*speed;
    }
    return {eastMps,northMps};
}

export interface GeneratedClimate {
    atmosphereKgM2?:Float64Array;
    landTemperatureK?:Float64Array;oceanTemperatureK?:Float64Array;
    temperatureK:Float64Array;radiationScale:Float64Array;absorbedWm2:Float64Array;
    windEastMps:Float64Array;windNorthMps:Float64Array;
    rainMmDay:Float64Array;evaporationMmDay:Float64Array;soilFraction:Float64Array;humidityFraction:Float64Array;surfaceMm:Float64Array;
}
/** Reference initialization. Transport mode uses the same water/thermal closure
 * over a spinup and recorded cycle; the displayed clock remains unchanged.
 * Legacy saves retain their analytic geographic estimates. Neither is equilibrium. */
export function generateClimate(grid:ClimateGrid,planet:PlanetConfig,orbit:OrbitConfig,thermal:ThermalConfig,water:WaterConfig,land:ArrayLike<number>,heightM:ArrayLike<number>,timeS:number,environment?:EnvironmentConfig):GeneratedClimate {
    const climate=generateThermalClimate(grid,planet,orbit,thermal,water,land,heightM,timeS);
    if(water.moistureScheme==='transport'&&thermal.separateReservoirs) {
        const reference=referenceMoisture(grid,planet,orbit,thermal,water,land,heightM,environment);
        const phase=orbit.orbitPhaseRad+2*Math.PI*timeS/deriveOrbit(planet,orbit).yearS;
        const month=Math.floor(((phase/(2*Math.PI)%1)+1)%1*12);
        for(const key of ['rainMmDay','evaporationMmDay','soilFraction','humidityFraction','surfaceMm','atmosphereKgM2'] as const)climate[key]=reference.months[month][key].slice();
        if(thermal.airRadiationFraction!==undefined)for(const key of ['temperatureK','landTemperatureK','oceanTemperatureK'] as const)climate[key]=reference.months[month][key].slice();
    }
    return climate;
}
/** Analytic periodic thermal forcing; no moisture-template use in transport mode. */
export function generateThermalClimate(grid:ClimateGrid,planet:PlanetConfig,orbit:OrbitConfig,thermal:ThermalConfig,water:WaterConfig,land:ArrayLike<number>,heightM:ArrayLike<number>,timeS:number):GeneratedClimate {
    if(land.length!==grid.count||heightM.length!==grid.count)throw new RangeError('Climate terrain size mismatch');
    for(let i=0;i<grid.count;i++)if(!Number.isFinite(land[i])||land[i]<0||land[i]>1||!Number.isFinite(heightM[i])||heightM[i]<0)throw new RangeError('Invalid climate terrain');
    const {fluxWm2:flux,yearS}=deriveOrbit(planet,orbit),omega=2*Math.PI/yearS;
    const phase=orbit.orbitPhaseRad+omega*(timeS%yearS),declination=Math.asin(Math.sin(planet.obliquityRad)*Math.sin(phase));
    const n=grid.count,temperatureK=new Float64Array(n),radiationScale=new Float64Array(n),absorbedWm2=new Float64Array(n);
    const rainMmDay=new Float64Array(n),evaporationMmDay=new Float64Array(n),soilFraction=new Float64Array(n),humidityFraction=new Float64Array(n),surfaceMm=new Float64Array(n);
    const annual=new Float64Array(grid.height);
    for(let j=0;j<grid.height;j++)for(let s=0;s<24;s++)annual[j]+=dailyMeanInsolation(grid.sinLat[j],Math.asin(Math.sin(planet.obliquityRad)*Math.sin(2*Math.PI*(s+.5)/24)),flux)/24;
    let marine=Float64Array.from(land,f=>1-f);
    const closePoles=(field:Float64Array)=>{
        for(const j of [0,grid.height-1])if(Math.abs(grid.sinLat[j])===1) {
            let mean=0;for(let x=0;x<grid.width;x++)mean+=field[j*grid.width+x]/grid.width;
            field.fill(mean,j*grid.width,(j+1)*grid.width);
        }
    };
    for(let pass=0;pass<3;pass++) {
        const sum=marine.slice(),weight=new Float64Array(n).fill(1);
        for(const e of grid.edges){sum[e.a]+=marine[e.b];sum[e.b]+=marine[e.a];weight[e.a]++;weight[e.b]++;}
        marine=sum.map((v,i)=>v/weight[i]);
        closePoles(marine);
    }
    const winds=circulationWinds(grid,planet,orbit,timeS,land,water.windMps);
    const transport=thermal.diffusion*(DEFAULT_PLANET.radiusM/planet.radiusM)**2,redistribute=transport/(transport+2);
    const globalT=Math.pow((1-orbit.bondAlbedo)*flux/(4*thermal.emissivity*STEFAN_BOLTZMANN),.25);
    const derivative=Math.max(1e-12,4*thermal.emissivity*STEFAN_BOLTZMANN*globalT**3);
    const sample=(values:ArrayLike<number>,x:number,y:number)=>values[Math.max(0,Math.min(grid.height-1,Math.round(y)))*grid.width+((Math.round(x)%grid.width)+grid.width)%grid.width];
    for(let i=0;i<n;i++) {
        const j=Math.floor(i/grid.width),x=i%grid.width,sinLat=grid.sinLat[j];
        const effectiveLand=land[i]*(1-.6*marine[i]);
        const capacity=effectiveLand*thermal.landHeatCapacity+(1-effectiveLand)*thermal.oceanDepthM*4.2e6;
        const lag=Math.atan(omega*capacity/derivative),amplitude=Math.cos(lag);
        const lagDeclination=Math.asin(Math.sin(planet.obliquityRad)*Math.sin(phase-lag));
        const seasonal=Math.max(0,annual[j]+amplitude*(dailyMeanInsolation(sinLat,lagDeclination,flux)-annual[j]));
        const q=(1-redistribute)*seasonal+redistribute*flux/4;
        // Altitude proxy persists in the transient radiation closure. At Earth
        // temperatures its initial slope is approximately 6.5 K/km, capped.
        radiationScale[i]=Math.max(.55,Math.exp(-.0065*heightM[i]*land[i]/288.15));
        temperatureK[i]=radiationScale[i]*Math.pow(Math.max(0,(1-orbit.bondAlbedo)*q/(thermal.emissivity*STEFAN_BOLTZMANN)),.25);
        absorbedWm2[i]=(1-orbit.bondAlbedo)*dailyMeanInsolation(sinLat,declination,flux);
        const u=winds.eastMps[i],v=winds.northMps[i],speed=Math.hypot(u,v);
        const dx=speed>1e-9?u/speed:0,dy=speed>1e-9?-v/speed:0;
        let ocean=marine[i],weight=1;
        for(let k=1;k<=8;k++){const w=Math.exp(-k/3);ocean+=w*(1-sample(land,x-dx*k,j-dy*k));weight+=w;}
        ocean/=weight;
        const ascent=heightM[i]-sample(heightM,x-dx,j-dy);
        const orography=speed>1e-9?Math.exp(clamp(ascent/1000,-1,1)):1;
        const lat=Math.asin(sinLat)*180/Math.PI,d=Math.abs(lat-.4*declination*180/Math.PI);
        const belt=.25+1.1*Math.exp(-Math.pow(d/12,2))+.6*Math.exp(-Math.pow((d-55)/12,2))-.2*Math.exp(-Math.pow((d-30)/9,2));
        const potential=86400*water.evaporationFraction*absorbedWm2[i]/2.45e6;
        rainMmDay[i]=clamp(potential*belt*(.2+.8*ocean)*orography,0,30);
        const wetness=clamp(rainMmDay[i]/5);
        soilFraction[i]=clamp(.1+.75*wetness,.05,.9);
        humidityFraction[i]=clamp(.3+.45*wetness+.1*ocean,.2,.95);
        surfaceMm[i]=20*wetness*wetness;
        evaporationMmDay[i]=potential*clamp((temperatureK[i]-273.15)/5)*(1-humidityFraction[i])*(land[i]+(water.initialOceanDepthM>0?1-land[i]:0));
    }
    const result={temperatureK,radiationScale,absorbedWm2,windEastMps:winds.eastMps,windNorthMps:winds.northMps,rainMmDay,evaporationMmDay,soilFraction,humidityFraction,surfaceMm};
    for(const field of Object.values(result))closePoles(field);
    return result;
}
