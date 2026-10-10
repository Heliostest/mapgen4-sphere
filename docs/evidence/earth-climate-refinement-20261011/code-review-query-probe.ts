/** Independent check of the public query units and translated fine labels. */
import {writeFile} from 'node:fs/promises';
import {ThermalRuntime} from '../../../thermal-runtime.ts';
import {makeThermalGrid} from '../../../thermal.ts';
import {DEFAULT_PLANET} from '../../../planet.ts';
import {DEFAULT_ORBIT} from '../../../astronomy.ts';
import {translate} from '../../../scenes/earth-land-sea/sidebar-zh.js';
const grid=makeThermalGrid(8,4),rt=new ThermalRuntime(grid),land=new Float64Array(grid.count).fill(.25),height=new Float64Array(grid.count).fill(.03);
land[13]=0;rt.enabled=rt.waterEnabled=true;rt.config.separateReservoirs=true;rt.setTerrain(land,height);rt.refinement='balanced';rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
const r=rt.refinedSurface!,p=r.partition,t=p.offset[12],sea=p.offset[13],old=r.soil[t]+r.surface[t];
// Inputs are physically 5mm soil and 7mm standing per local land area.
r.soil[t]=5*p.land[t];r.surface[t]=7*p.land[t];rt.water!.oceanGlobalKgM2+=(old-r.soil[t]-r.surface[t])/grid.count;r.aggregate();
const mixed=rt.sampleWater(p.u[t],p.v[t])!,wet=rt.sampleWater(p.u[sea],p.v[sea])!,text=translate('local land snow 5.0 mm · local grounded ice 2.0 m');
if(mixed.soilMm!==5||mixed.surfaceMm!==7)throw new Error('Fine query must report liquid stores per local land area');
if(wet.soilMm!==null||wet.surfaceMm!==null)throw new Error('Fine query must mark land liquid unavailable over a zero-land patch');
if(text!=='当地陆地积雪 5.0 mm · 当地陆冰 2.0 m')throw new Error('Fine snow and grounded-ice translations differ');
const result={mixed:{landFraction:r.sample(p.u[t],p.v[t]).landFraction,soilMm:mixed.soilMm,standingMm:mixed.surfaceMm},zeroLand:{soilMm:wet.soilMm,standingMm:wet.surfaceMm},translated:text};
console.log(JSON.stringify(result,null,2));await writeFile('docs/evidence/earth-climate-refinement-20261011/code-review-query-probe.json',JSON.stringify(result,null,2)+'\n');
