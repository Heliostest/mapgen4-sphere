/** Continuous, fixed-step Earth inventory evidence. This entry never seeks a
 * season or regenerates a reference climate. Bundle baseline imports from
 * c84e725; bundle after imports from the implementation under review.
 *
 * MOISTURE_EVIDENCE_LABEL=before|after, MOISTURE_EVIDENCE_INPUT=<saved scene>,
 * MOISTURE_EVIDENCE_SOURCE=<commit or worktree description>. Optional --initial-only.
 * Snapshots in build/earth-moisture-climate/ are strict-encoded and strict-decoded.
 * Use the sibling bundle-integrate.mjs helper to preserve fixed baseline imports.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {makeMesh} from '../../../mesh.ts';
import config,{HIGH_DETAIL_SPACING} from '../../../config.js';
import Map from '../../../map.ts';
import Geometry from '../../../geometry.ts';
import {meshIdentity} from '../../../terrain-document.ts';
import {decodeSimulationDocument,encodeSimulationDocument} from '../../../simulation-document.ts';
import {ThermalRuntime} from '../../../thermal-runtime.ts';
import {sampleTerrainGrid,thermalCell} from '../../../thermal.ts';
import {makeSurfaceGrid,surfaceCell} from '../../../surface-grid.ts';
import {sunState} from '../../../astronomy.ts';

const evidence='docs/evidence/earth-moisture-climate-20261010',output='build/earth-moisture-climate';
const label=process.env.MOISTURE_EVIDENCE_LABEL??'after';
if(!['before','after'].includes(label))throw new Error('Expected before or after evidence label');
const input=process.env.MOISTURE_EVIDENCE_INPUT??`${output}/${label==='after'?'experimental-input':'before-day0'}.json`;
const source=process.env.MOISTURE_EVIDENCE_SOURCE??'implementation worktree';
const bundledCodeSha256=createHash('sha256').update(await readFile(process.argv[1])).digest('hex');
await mkdir(output,{recursive:true});await mkdir(evidence,{recursive:true});
const start=performance.now();config.spacing=HIGH_DETAIL_SPACING;
const {mesh,t_peaks}=await makeMesh();
const raw=await readFile(input,'utf8'),d=decodeSimulationDocument(raw,meshIdentity(mesh,config),128);
const map=new Map(mesh,t_peaks,config);
map.assignElevation(d.terrain.parameters.elevation,{size:128,constraints:new Float32Array(d.terrain.constraints.values)},new Float32Array(d.terrain.offsets!));
const indices=new Int32Array(3*mesh.numSolidSides),em=new Float32Array(2*(mesh.numRegions+mesh.numTriangles));
Geometry.setMapGeometry(map,0,indices,em);
const elevation=new Float32Array(mesh.numRegions+mesh.numTriangles);elevation.set(map.elevation_r);elevation.set(map.elevation_t,mesh.numRegions);
const rt=ThermalRuntime.fromSnapshot(d.runtime,d.terrain.settings.planet,d.terrain.settings.orbit);
const sample=sampleTerrainGrid(rt.grid,mesh.xyz_r,elevation);
rt.attachRestoredTerrain(sample.landFraction,sample.landElevation,{mesh,directions:mesh.xyz_r,elevation,quadElements:indices});
assert(rt.model&&rt.water&&rt.environment,'Evidence requires complete water and thermal physics');
assert.equal(rt.model.steps,0,'Start from the authored day-zero snapshot');
assert(rt.environmentConfig.terrainWater&&rt.environmentConfig.glaciers&&rt.environmentConfig.dynamicCirculation,'Preserve authored routing, glaciers and dynamic atmosphere');
const terrainDigest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const terrainHashes={offsets:terrainDigest(d.terrain.offsets),constraints:terrainDigest(d.terrain.constraints),meshElevations:createHash('sha256').update(new Uint8Array(elevation.buffer)).digest('hex')};
const planet=d.terrain.settings.planet,orbit=d.terrain.settings.orbit,radius=planet.radiusM;
const points=[['Amazon',-3,-60],['Congo',0,23],['Sahara',24,15],['Sahel',14,0],['Europe',50,10],['Siberia',62,100],['India',22,80],['Himalaya south',28,86],['Tibet',33,88],['Andes east',-12,-70],['Atacama',-24,-69],['Australia interior',-25,134],['Australia east',-30,152],['Australia north',-12,131],['Australia south west',-32,116],['Antarctica interior',-85,0],['Greenland interior',72,-40]] as const;
const regions=points.map(([name,lat,lon])=>({name,south:lat-4,north:Math.min(90,lat+4),west:lon-8,east:lon+8}));
const cumulativeRain=new Float64Array(rt.grid.count),cumulativeEvap=new Float64Array(rt.grid.count),monthlyRain=Array.from({length:12},()=>new Float64Array(rt.grid.count));
const initialVapor=rt.water.atmosphereKgM2.slice(),cumulativeTransport=new Float64Array(rt.grid.count),airIntegral=new Float64Array(rt.grid.count),landIntegral=new Float64Array(rt.grid.count),oceanIntegral=new Float64Array(rt.grid.count),soilIntegral=new Float64Array(rt.grid.count);
const vaporTransport=()=>(rt.water as typeof rt.water & {vaporTransportKgM2?:Float64Array})!.vaporTransportKgM2;
function sum(values:Iterable<number>){let total=0,c=0;for(const value of values){const y=value-c,t=total+y;c=(t-total)-y;total=t;}return total;}
function area(south:number,north:number,west:number,east:number){return radius**2*(east-west)*Math.PI/180*(Math.sin(north*Math.PI/180)-Math.sin(south*Math.PI/180));}
function overlap(region:typeof regions[number],south:number,north:number,west:number,east:number){const lo=Math.max(region.south,south),hi=Math.min(region.north,north),left=Math.max(region.west,west),right=Math.min(region.east,east);return hi>lo&&right>left?area(lo,hi,left,right):0;}
type OptionalLayers={landTemperatureK?:ArrayLike<number>;oceanTemperatureK?:ArrayLike<number>;landCapacity?:ArrayLike<number>;oceanCapacity?:ArrayLike<number>;config:{separateReservoirs?:boolean}};
function layers(){return rt.model! as typeof rt.model & OptionalLayers;}
function independentBudget(){
 const m=rt.model!,w=rt.water!,n=rt.grid.count,t=layers();
 const storeKeys=['atmosphereKgM2','soilKgM2','surfaceKgM2','snowKgM2','seaIceKgM2','landIceKgM2','shelfLandIceKgM2','shelfSeaIceKgM2'] as const;
 const stores=Object.fromEntries(storeKeys.map(key=>[key,w[key]?sum(w[key])/n:0]));
 const totalMm=w.oceanGlobalKgM2+sum(Object.values(stores));
 let sensibleJm2:number,sensibleLayers:string;
 if(t.config.separateReservoirs&&t.landTemperatureK&&t.oceanTemperatureK&&t.landCapacity&&t.oceanCapacity){
  sensibleJm2=sum(Array.from({length:n},(_,i)=>m.capacity[i]*m.temperatureK[i]+t.landCapacity![i]*t.landTemperatureK![i]+t.oceanCapacity![i]*t.oceanTemperatureK![i]))/n;
  sensibleLayers='separate air, land and ocean reservoirs';
 }else{sensibleJm2=sum(Array.from({length:n},(_,i)=>m.capacity[i]*m.temperatureK[i]))/n;sensibleLayers='legacy single mixed column';}
 const latentJm2=2.45e6*stores.atmosphereKgM2-334000*(stores.snowKgM2+stores.seaIceKgM2+stores.landIceKgM2+stores.shelfLandIceKgM2+stores.shelfSeaIceKgM2);
 const enthalpyJm2=sensibleJm2+latentJm2,waterResidualMm=totalMm-w.initialTotalMm,energyResidualJm2=enthalpyJm2-rt.environment!.initialEnthalpy-m.radiationJm2;
 const internalWaterResidualMm=w.diagnostics().residualMm,internalEnergyResidualJm2=rt.environment!.diagnostics().energyResidualJm2;
 assert(Math.abs(waterResidualMm)<1e-6,'Independent global water ledger drift');
 const energyTolerance=Math.max(1e-3,512*Number.EPSILON*Math.max(Math.abs(enthalpyJm2),Math.abs(rt.environment!.initialEnthalpy),Math.abs(m.radiationJm2)));
 assert(Math.abs(energyResidualJm2)<energyTolerance,'Independent global enthalpy ledger drift');
 return {sensibleLayers,storesGlobalMm:stores,oceanGlobalMm:w.oceanGlobalKgM2,totalMm,initialTotalMm:w.initialTotalMm,waterResidualMm,internalWaterResidualMm,sensibleJm2,latentJm2,enthalpyJm2,initialEnthalpyJm2:rt.environment!.initialEnthalpy,radiationJm2:m.radiationJm2,energyResidualJm2,internalEnergyResidualJm2,energyToleranceJm2:energyTolerance};
}
function physicalRegional(region:typeof regions[number]){
 const grid=rt.grid,w=rt.water!,m=rt.model!,t=layers();let landM2=0,seaM2=0,landIceKg=0,shelfIceKg=0,seaIceKg=0,snowKg=0,soilKg=0,surfaceKg=0,landIceCoveredM2=0,seaIceExtentM2=0,seaIceAreaM2=0,snowCoveredM2=0,airKArea=0,landKArea=0,seaKArea=0,wholeM2=0,rainKg=0,evapKg=0,transportKg=0,vaporDeltaKg=0;
 for(let j=0;j<grid.height;j++)for(let x=0;x<grid.width;x++){
  const k=j*grid.width+x,north=Math.asin(1-2*j/grid.height)*180/Math.PI,south=Math.asin(1-2*(j+1)/grid.height)*180/Math.PI,west=-180+360*x/grid.width,a=overlap(region,south,north,west,west+360/grid.width);if(!a)continue;
  const f=w.land[k],land=a*f,sea=a*(1-f),iceFraction=f<1?Math.min(1,w.seaIceKgM2[k]/((1-f)*917*.5)):0;
  rainKg+=a*cumulativeRain[k];evapKg+=a*cumulativeEvap[k];transportKg+=a*cumulativeTransport[k];vaporDeltaKg+=a*(w.atmosphereKgM2[k]-initialVapor[k]);wholeM2+=a;landM2+=land;seaM2+=sea;landIceKg+=a*w.landIceKgM2[k];shelfIceKg+=a*((w.shelfLandIceKgM2?.[k]??0)+(w.shelfSeaIceKgM2?.[k]??0));seaIceKg+=a*w.seaIceKgM2[k];snowKg+=a*w.snowKgM2[k];soilKg+=a*w.soilKgM2[k];surfaceKg+=a*w.surfaceKgM2[k];
  if(f>0&&w.landIceKgM2[k]/f>=917)landIceCoveredM2+=land;if(f>0&&w.snowKgM2[k]/f>=30)snowCoveredM2+=land;
  if(iceFraction>=.15)seaIceExtentM2+=sea;seaIceAreaM2+=sea*iceFraction;
  airKArea+=a*m.temperatureK[k];landKArea+=land*(t.landTemperatureK?.[k]??m.temperatureK[k]);seaKArea+=sea*(t.oceanTemperatureK?.[k]??m.temperatureK[k]);
 }
 return {cumulativeRainWholeAreaMm:rainKg/wholeM2,cumulativeEvapWholeAreaMm:evapKg/wholeM2,vaporStorageChangeMm:vaporDeltaKg/wholeM2,netVaporTransportMm:vaporTransport()?transportKg/wholeM2:null,vaporBudgetResidualMm:vaporTransport()?(vaporDeltaKg+rainKg-evapKg-transportKg)/wholeM2:null,landAreaKm2:landM2/1e6,oceanAreaKm2:seaM2/1e6,landIceKg,landIceVolumeKm3:landIceKg/917/1e9,landMeanIceThicknessM:landM2?landIceKg/(917*landM2):0,landIceCoverageAt1m:landM2?landIceCoveredM2/landM2:0,shelfIceKg,shelfIceVolumeKm3:shelfIceKg/917/1e9,snowKg,landMeanSnowMm:landM2?snowKg/landM2:0,snowCoverageAt30mm:landM2?snowCoveredM2/landM2:0,seaIceKg,seaIceExtentAt15PercentKm2:seaIceExtentM2/1e6,seaIceAreaKm2:seaIceAreaM2/1e6,soilKg,surfaceWaterKg:surfaceKg,airMeanC:wholeM2?airKArea/wholeM2-273.15:null,landMeanC:landM2?landKArea/landM2-273.15:null,oceanMeanC:seaM2?seaKArea/seaM2-273.15:null};
}
function displayRegional(region:typeof regions[number]){
 const grid=makeSurfaceGrid(),s=rt.surfaceState()!;let landM2=0,seaM2=0,landIceMassEstimateKg=0,shelfMassEstimateKg=0,landIceCoveredM2=0,shelfLandCoveredM2=0,shelfSeaCoveredM2=0,snowCoveredM2=0,frozenCoveredM2=0,seaIceExtentM2=0,seaIceAreaM2=0;
 for(let j=0;j<grid.height;j++)for(let x=0;x<grid.width;x++){
  const k=j*grid.width+x,north=90-180*Math.max(0,(j-.5)/(grid.height-1)),south=90-180*Math.min(1,(j+.5)/(grid.height-1)),west=-180+360*x/grid.width,a=overlap(region,south,north,west,west+360/grid.width);if(!a)continue;
  const f=s.land[k],land=a*f,sea=a*(1-f),ice=rt.sampleSurface((x+.5)/grid.width,j/(grid.height-1))!.seaIceFraction,landIce=s.landIceKgM2?.[k]??0,shelfLand=s.shelfLandIceKgM2?.[k]??0,shelfSea=s.shelfSeaIceKgM2?.[k]??0,snow=s.snowMm?.[k]??0;
  landM2+=land;seaM2+=sea;landIceMassEstimateKg+=land*landIce;shelfMassEstimateKg+=land*shelfLand+sea*shelfSea;if(landIce>=917)landIceCoveredM2+=land;if(shelfLand>=917)shelfLandCoveredM2+=land;if(shelfSea>=917)shelfSeaCoveredM2+=sea;if(snow>=30)snowCoveredM2+=land;if(landIce>=917||shelfLand>=917||snow>=30)frozenCoveredM2+=land;
  if(ice>=.15)seaIceExtentM2+=sea;seaIceAreaM2+=sea*ice;
 }
 return {landAreaKm2:landM2/1e6,oceanAreaKm2:seaM2/1e6,landMeanIceThicknessEstimateM:landM2?landIceMassEstimateKg/(917*landM2):0,landIceCoverageAt1m:landM2?landIceCoveredM2/landM2:0,shelfIceVolumeEstimateKm3:shelfMassEstimateKg/917/1e9,shelfLandCoverageAt1m:landM2?shelfLandCoveredM2/landM2:0,shelfSeaAreaAt1mKm2:shelfSeaCoveredM2/1e6,snowCoverageAt30mm:landM2?snowCoveredM2/landM2:0,snowOrIceCoverage:landM2?frozenCoveredM2/landM2:0,seaIceExtentAt15PercentKm2:seaIceExtentM2/1e6,seaIceAreaKm2:seaIceAreaM2/1e6};
}
const samples:unknown[]=[];
async function save(dayLabel:number){
 const m=rt.model!,state=rt.snapshot(),saved={...d,terrain:{...d.terrain,settings:{...d.terrain.settings,timeS:state.state!.lastTarget}},runtime:state,comparison:{baseline:null,history:[]}};
 // encode includes the model's strict physical validation; explicitly decode
 // the persisted text as well. Do not bypass a known cross-engine albedo error.
 const encoded=encodeSimulationDocument(saved);decodeSimulationDocument(encoded,meshIdentity(mesh,config),128);
 assert.equal(terrainDigest(saved.terrain.offsets),terrainHashes.offsets);assert.equal(terrainDigest(saved.terrain.constraints),terrainHashes.constraints);
 const file=`${output}/${label}-day${dayLabel}.json`;await writeFile(file,encoded);
 const grid=makeSurfaceGrid(),s=rt.surfaceState()!,t=layers(),w=rt.water!;
 const reading={requestedDay:dayLabel,modelDay:m.timeS/86400,clockDay:state.state!.lastTarget/86400,steps:m.steps,stepS:m.stepS,seasonDeg:sunState(planet,orbit,m.timeS).orbitAngleRad*180/Math.PI,snapshotFile:file,wallSeconds:(performance.now()-start)/1000,globalMeanC:m.diagnostics().meanK-273.15,budget:independentBudget(),regions:regions.map(region=>({region,physicalEqualAreaGrid:physicalRegional(region),displayGrid:displayRegional(region)})),points:points.map(([name,lat,lon])=>{
  const u=(lon+180)/360,v=(90-lat)/180,k=surfaceCell(grid,u,v),cell=thermalCell(rt.grid,u,v),surface=rt.sampleSurface(u,v)!,water=rt.sampleWater(u,v)!;
  return {name,lat,lon,physicalCell:cell,localLandFraction:s.land[k],iceSurfaceDemM:state.state!.localHeight[k]*planet.reliefM,observedGroundedSeedM:state.iceInventory?.groundedThicknessM[k]??0,observedShelfSeedM:state.iceInventory?.shelfThicknessM[k]??0,productBedrockM:state.iceInventory?.bedrockM[k]??null,physicalGlacierBedrockM:w.glacier?.bedrockM?.[cell]??null,localLandIceM:surface.landIceM,localShelfIceM:surface.shelfIceM??0,localShelfIceFraction:surface.shelfIceFraction??0,physicalLandIceM:w.land[cell]>0?w.landIceKgM2[cell]/(w.land[cell]*917):0,localSeaIceFraction:surface.seaIceFraction,physicalSeaIceM:water.iceM,annualMeanAirC:m.timeS>0?airIntegral[cell]/m.timeS-273.15:null,annualMeanLandC:m.timeS>0&&w.land[cell]>0?landIntegral[cell]/m.timeS-273.15:null,annualMeanOceanC:m.timeS>0&&w.land[cell]<1?oceanIntegral[cell]/m.timeS-273.15:null,meanSoilMm:m.timeS>0&&w.land[cell]>0?soilIntegral[cell]/m.timeS/w.land[cell]:null,cumulativeRainMm:cumulativeRain[cell],cumulativeEvapMm:cumulativeEvap[cell],monthlyRainMm:monthlyRain.map(a=>a[cell]),referenceRainMmYear:surface.annualRainMm,biome:surface.biome,vegetation:surface.vegetationFraction,soilMm:water.soilMm,instantRainMmDay:water.precipitationMmDay,physicalSnowMm:water.snowMm,localSnowMm:s.snowMm?.[k]??0,localAirC:surface.localTemperatureK-273.15,surfaceC:(surface.surfaceTemperatureK??surface.localTemperatureK)-273.15,physicalAirC:m.temperatureK[cell]-273.15,physicalLandC:w.land[cell]>0?(t.landTemperatureK?.[cell]??m.temperatureK[cell])-273.15:null,physicalOceanC:w.land[cell]<1?(t.oceanTemperatureK?.[cell]??m.temperatureK[cell])-273.15:null,referenceMeanC:surface.meanTemperatureK-273.15,referenceWarmestC:surface.warmestTemperatureK-273.15};
 })};samples.push(reading);
 await writeFile(`${evidence}/${label}-continuous.json`,JSON.stringify({sourceCommit:source,bundledCodeSha256,inputFile:input,inputSha256:createHash('sha256').update(raw).digest('hex'),method:'Each physical step advances the actual ThermalRuntime.sync; no seasonal seeking, parameter reinitialization, disabled routing or replaced model.',physicalGrid:{width:rt.grid.width,height:rt.grid.height,cells:rt.grid.count,area:'equal-area',budget:'whole-cell stores and equal-area global ledger'},displayGrid:{width:grid.width,height:grid.height,area:'spherical row quadrature; inventory downscaling is a display estimate, not the conserved physical ledger'},seasonalMonthNote:'Month zero begins at the vernal equinox (orbit phase 0); approximate DJF uses bins 9-11, JJA bins 3-5. Monthly rain is accumulated actual step flux, not a smoothing window.',regionNote:'Regional rectangles clip both grids by spherical area. Greenland bounds can include neighboring coarse mixed cells; coverage is a model diagnostic, not a satellite extent product.',inventoryDefinitions:{landIceCoverage:'conditional land thickness >= 1 m',shelfIce:'separate floating ice inventory; excluded from seasonal sea ice extent',snowCoverage:'conditional land snow water equivalent >= 30 mm',seaIceExtent:'ocean area in cells with ice concentration >= 15%',seaIceArea:'ocean area multiplied by model ice concentration; 0.5 m inventory maps to full concentration'},terrainHashes,thermalConfig:rt.config,waterConfig:rt.waterConfig,environmentConfig:rt.environmentConfig,samples},null,2)+'\n');
 console.log(JSON.stringify({label,day:reading.modelDay,steps:reading.steps,wallSeconds:reading.wallSeconds,budget:reading.budget,regions:reading.regions}));
}
await save(0);
for(const day of process.argv.includes('--initial-only')?[]:[90,180,270,365]){
 const count=Math.floor((day*86400-rt.model!.epochS)/rt.model!.stepS);
 while(rt.model!.steps<count){const next=rt.model!.steps+1;rt.sync(planet,orbit,rt.model!.epochS+next*rt.model!.stepS+.001,null);assert.equal(rt.model!.steps,next,'Each sync advances one actual physical step');for(let i=0;i<rt.grid.count;i++){const rain=rt.water!.precipitationKgM2S[i]*rt.model!.stepS;cumulativeRain[i]+=rain;cumulativeEvap[i]+=rt.water!.evaporationKgM2S[i]*rt.model!.stepS;cumulativeTransport[i]+=vaporTransport()?.[i]??0;airIntegral[i]+=rt.model!.temperatureK[i]*rt.model!.stepS;landIntegral[i]+=(layers().landTemperatureK?.[i]??rt.model!.temperatureK[i])*rt.model!.stepS;oceanIntegral[i]+=(layers().oceanTemperatureK?.[i]??rt.model!.temperatureK[i])*rt.model!.stepS;soilIntegral[i]+=rt.water!.soilKgM2[i]*rt.model!.stepS;monthlyRain[Math.min(11,Math.floor(rt.model!.timeS/(365.2425*86400)*12))][i]+=rain;}if(next%1000===0)console.log(JSON.stringify({label,progressDay:rt.model!.timeS/86400,steps:next,wallSeconds:(performance.now()-start)/1000}));}
 await save(day);
}
