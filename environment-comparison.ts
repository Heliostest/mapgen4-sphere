import type {ThermalRuntime} from './thermal-runtime.ts';
import {thermalCell} from './thermal.ts';
export interface EnvironmentMetrics {temperatureC:number;icePercent:number;snowPercent:number;northIcePercent:number;southIcePercent:number;vegetationPercent:number;albedo:number;snowMm:number;iceMm:number;landIceMm:number;glacierSpeedMyr:number;glacialSolidResidualM:number;meltMmDay:number;rainMmDay:number;currentMps:number;waterResidualMm:number;energyResidualJm2:number;}
export interface EnvironmentSnapshot {
    timeS:number;ageDays:number;description:string;parameters:string;width:number;height:number;rgb:Uint8Array;
    temperatureC:Float64Array;snowMm:Float64Array;iceM:Float64Array;landIceM:Float64Array;vegetation:Float64Array;land:Float64Array;
    east:Float64Array;north:Float64Array;metrics:EnvironmentMetrics;
}
export interface ComparisonState {baseline:EnvironmentSnapshot|null;history:{time:number;metrics:EnvironmentMetrics}[];}
export function environmentMetrics(rt:ThermalRuntime):EnvironmentMetrics|null {
    const m=rt.model,w=rt.water,e=rt.environment,s=rt.surfaceState();if(!m||!w||!e||!s)return null;
    const d=e.diagnostics(),water=w.diagnostics();let north=0,south=0,nw=0,sw=0,vegetation=0,land=0;
    for(let i=0;i<w.grid.count;i++) {
        const latitude=w.grid.sinLat[Math.floor(i/w.grid.width)],wet=1-w.land[i];
        if(latitude>.866){north+=wet*e.iceCover[i];nw+=wet;}if(latitude<-.866){south+=wet*e.iceCover[i];sw+=wet;}
        vegetation+=e.vegetation[i]*w.land[i];land+=w.land[i];
    }
    return {temperatureC:m.diagnostics().meanK-273.15,icePercent:100*d.iceFraction,snowPercent:100*d.snowFraction,northIcePercent:nw?100*north/nw:0,southIcePercent:sw?100*south/sw:0,
        vegetationPercent:land?100*vegetation/land:0,albedo:d.albedo,snowMm:water.snowMm,iceMm:water.iceMm,landIceMm:water.landIceMm,glacierSpeedMyr:w.glacier?.diagnostics().maxSpeedMyr??0,glacialSolidResidualM:w.glacier?.diagnostics().solidResidualM??0,meltMmDay:water.meltMmDay,rainMmDay:water.rainMmDay,currentMps:d.maxCurrentMps,waterResidualMm:water.residualMm,energyResidualJm2:d.energyResidualJm2};
}
export function captureEnvironment(rt:ThermalRuntime):EnvironmentSnapshot|null {
    const metrics=environmentMetrics(rt),s=rt.surfaceState(),m=rt.model,w=rt.water,e=rt.environment;if(!metrics||!s||!m||!w||!e)return null;
    const {width,height,pixels}=s.texture,n=width*height,temperatureC=new Float64Array(n),rgb=new Uint8Array(n*3),east=new Float64Array(n),north=new Float64Array(n);
    for(let i=0;i<n;i++) {
        const u=(i%width+.5)/width,v=Math.floor(i/width)/(height-1),k=thermalCell(rt.grid,u,v),cover=rt.sampleSurface(u,v)!;
        temperatureC[i]=cover.localTemperatureK-273.15;east[i]=e.ocean.eastMps[k];north[i]=e.ocean.northMps[k];
        const frozenSea=Math.max(cover.seaIceFraction,cover.shelfIceFraction);
        for(let c=0;c<3;c++)rgb[3*i+c]=s.land[i]>.5?pixels[4*i+c]:[25,63,95][c]*(1-frozenSea)+[201,224,230][c]*frozenSea;
    }
    return {timeS:m.timeS,ageDays:(m.timeS-m.epochS)/86400,parameters:JSON.stringify({planet:m.planet,orbit:m.orbit,thermal:m.config,water:w.config,environment:rt.environmentConfig}),description:`tilt ${(m.planet.obliquityRad*180/Math.PI).toFixed(1)}° · season ${((m.orbit.orbitPhaseRad*180/Math.PI+360*m.timeS/m.yearS)%360).toFixed(1)}° · current ${rt.environmentConfig.oceanStrengthMps} m/s · vegetation ${rt.environmentConfig.vegetation?'on':'off'} · ice albedo ${rt.environmentConfig.iceAlbedo?'on':'off'}`,
        width,height,rgb,temperatureC,snowMm:s.snowMm!.map((v,i)=>s.land[i]>.5?v:0),iceM:s.iceKgM2!.map((v,i)=>s.land[i]<.5?v/917:0),landIceM:s.landIceKgM2!.map((v,i)=>s.land[i]>.5?v/917:0),vegetation:rt.vegetation!.cover.map((v,i)=>s.land[i]>.5?v:0),land:s.land.slice(),east,north,metrics};
}
export const METRICS:[keyof EnvironmentMetrics,string,string][]=[
    ['temperatureC','Global temperature','°C'],['icePercent','Ocean ice cover','% ocean'],['snowPercent','Land snow cover','% land'],
    ['northIcePercent','North polar ocean ice (>60°)','% ocean'],['southIcePercent','South polar ocean ice (<−60°)','% ocean'],
    ['vegetationPercent','Vegetation cover','% land'],['albedo','Mean albedo','0–1'],['snowMm','Snow inventory','global mm'],['iceMm','Sea-ice inventory','global mm'],
    ['landIceMm','Grounded ice inventory','global mm'],['glacierSpeedMyr','Maximum ice speed','m/yr'],['glacialSolidResidualM','Glacial solid residual','global m'],
    ['meltMmDay','Snow / land-ice melt','global mm/day'],['rainMmDay','Precipitation','mm/day'],['currentMps','Maximum current','m/s'],
    ['waterResidualMm','Water budget residual','mm'],['energyResidualJm2','Total enthalpy residual','J/m²'],
];
export function comparisonCSV(b:EnvironmentSnapshot,c:EnvironmentSnapshot) {
    const rows=[['metric','unit','baseline','current','delta'],['absolute_day','days',b.timeS/86400,c.timeS/86400,(c.timeS-b.timeS)/86400],['age_since_generation','days',b.ageDays,c.ageDays,c.ageDays-b.ageDays],
        ['summary','',b.description,c.description,''],['parameters','',b.parameters,c.parameters,''],...METRICS.map(([key,label,unit])=>[label,unit,b.metrics[key],c.metrics[key],c.metrics[key]-b.metrics[key]])];
    return rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');
}
