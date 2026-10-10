/** Independent follow-up probes, never edits product code. */
import {writeFile} from 'node:fs/promises';
import {TerrainWater} from '../../../terrain-water.ts';
import {ThermalRuntime} from '../../../thermal-runtime.ts';
import {makeThermalGrid,sampleTerrainGrid,thermalCell} from '../../../thermal.ts';
import {DEFAULT_PLANET} from '../../../planet.ts';
import {DEFAULT_ORBIT} from '../../../astronomy.ts';
import {uvToDirection} from '../../../sphere.ts';
import {makeSurfacePartition} from '../../../refinement-topology.ts';
import {makeSphereMesh} from '../../../sphere-mesh.ts';
function fixture(quality:'balanced'|'high'='balanced',planet={...DEFAULT_PLANET},plain=false,glaciers=false) {
    const grid=makeThermalGrid(8,4),rt=new ThermalRuntime(grid);rt.enabled=rt.waterEnabled=true;rt.config.separateReservoirs=true;
    if(plain)rt.config.landHeatCapacity=100000;rt.environmentConfig.glaciers=glaciers;
    const directions:number[]=[],elevation:number[]=[];
    for(let j=0;j<32;j++)for(let x=0;x<64;x++){directions.push(...uvToDirection((x+.5)/64,Math.acos(1-2*(j+.5)/32)/Math.PI));elevation.push(plain?.005:x%8>=4?.65:.005);}
    const land=new Float64Array(grid.count).fill(1),height=new Float64Array(grid.count).fill(plain?.005:.3275),source={directions,elevation};
    rt.setTerrain(land,height,source);rt.refinement=quality;rt.sync(planet,DEFAULT_ORBIT,0,0);return {rt,source,land,height};
}
const results:any={};
function differences(a:any,b:any,prefix='') {const out:any[]=[];if(ArrayBuffer.isView(a)){for(let i=0;i<a.length&&out.length<12;i++)if(a[i]!==b[i])out.push({path:prefix+'['+i+']',a:a[i],b:b[i],delta:typeof a[i]==='number'?b[i]-a[i]:null});return out;}if(a&&typeof a==='object'){for(const k of Object.keys(a)){out.push(...differences(a[k],b?.[k],prefix?prefix+'.'+k:k));if(out.length>=24)break;}return out;}if(a!==b)return [{path:prefix,a,b}];return [];}
{
    const water={grid:{count:1},cellAreaM2:1000,surfaceKgM2:new Float64Array([10]),dischargeM3S:new Float64Array(1),oceanGlobalKgM2:0};
    const route=new TerrainWater({cell:new Int32Array(2),areaM2:new Float64Array([500,500]),bedM:new Float64Array(2),neighbors:[[],[]]},water),mass=new Float64Array([0,10]);
    route.setPartition(new Int32Array([0,0]),mass,new Int32Array([0,0]));route.route(water,1800,1);
    results.unrepresentedFallback=route.diagnostics(water);
    route.volumeM3.set([2,0]);mass[0]=water.surfaceKgM2[0]=2;mass[1]=0;route.setPartition(new Int32Array([0,0]),mass,new Int32Array([0,0]));const saved=route.checkpoint();
    mass[0]=water.surfaceKgM2[0]=1;route.route(water,1800,1);mass[0]=water.surfaceKgM2[0]=2;route.restore(saved,water);route.route(water,1800,1);results.restoreNextRoute={saved:Array.from(saved.volumeM3),after:Array.from(route.volumeM3)};
}
{
    const {rt,land,height,source}=fixture(),r=rt.refinedSurface!,m=rt.model!,p=r.partition,k=12;
    m.config.emissivity=0;m.temperatureK.fill(280);for(let t=0;t<p.parent.length;t++)r.landK[t]=r.landAirK(t);r.aggregate();const before=r.landK.slice(),energy=m.energy();r.stepSurface(k,1800,0);
    results.localAirEquilibrium={maxChange:Math.max(...r.landK.map((v,i)=>Math.abs(v-before[i]))),energyResidual:m.energy()-energy};
    const fresh=fixture(),saved=fresh.rt.snapshot(),q=saved.state!.refined!.partition;q.heightM[0]+=1000;
    let outcome='accepted';try{const restored=ThermalRuntime.fromSnapshot(saved,DEFAULT_PLANET,DEFAULT_ORBIT);restored.attachRestoredTerrain(land,height,source);}catch(e){outcome=String(e);}results.topologyTamper=outcome;
    for(let x=0;x<rt.grid.width;x++)m.temperatureK[x]=270+x;
    results.poleAirSpread=Math.max(...[0,.125,.25,.5,.75].map(u=>r.sample(u,0).airK))-Math.min(...[0,.125,.25,.5,.75].map(u=>r.sample(u,0).airK));
    let budget='accepted';try{makeSurfacePartition(makeThermalGrid(128,32),new Float64Array(4096).fill(.5),new Float64Array(4096),null,10000,'high');}catch(e){budget=String(e);}results.creationBudget=budget;
}
{
    const {rt}=fixture('high'),r=rt.refinedSurface!,p=r.partition;
    for(let k=0;k<rt.grid.count;k++)for(let t=p.offset[k];t<p.offset[k+1];t++)r.landK[t]+=((t-p.offset[k])%p.level[k])%2?10:-10;
    r.aggregate();const air=rt.model!.temperatureK.slice(),land=rt.model!.landTemperatureK.slice(),energy=rt.model!.energy();rt.enableRefinement('balanced');
    results.coarsenHeat={maxAirChange:Math.max(...rt.model!.temperatureK.map((v,i)=>Math.abs(v-air[i]))),maxParentLandChange:Math.max(...rt.model!.landTemperatureK.map((v,i)=>Math.abs(v-land[i]))),globalSensibleResidual:rt.model!.energy()-energy};
}
{
    const {mesh}=makeSphereMesh(1600,35,12345),grid=makeThermalGrid(8,4),rt=new ThermalRuntime(grid),elevation=new Float64Array(mesh.numRegions+mesh.numTriangles),inlandLakeId=new Int32Array(mesh.numTriangles);
    for(let a=0;a<mesh.numRegions;a++)elevation[a]=mesh.xyz_r[3*a]>0?-.2:.03;
    for(let t=0;t<mesh.numTriangles;t++){elevation[mesh.numRegions+t]=mesh.xyz_t[3*t]>0?-.2:.03;if(elevation[mesh.numRegions+t]<0&&mesh.xyz_t[3*t+1]>0&&mesh.xyz_t[3*t+2]>0)inlandLakeId[t]=1;}
    const source={mesh,directions:mesh.xyz_r,elevation,drainage:{inlandLakeId,basinId:new Int32Array(mesh.numTriangles),terminal:new Uint8Array(mesh.numTriangles)}},sample=sampleTerrainGrid(grid,mesh.xyz_r,elevation);
    rt.enabled=rt.waterEnabled=true;rt.config.separateReservoirs=true;rt.environmentConfig.terrainWater=true;rt.setTerrain(sample.landFraction,sample.landElevation,source);rt.refinement='balanced';rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
    const r=rt.refinedSurface!,w=rt.water!,t=r.lakeArea.findIndex((v,i)=>v>0&&r.partition.land[i]===0);if(t<0)throw new Error('Lake probe missing an exclusively finite-lake patch');
    r.surface[t]+=10;w.oceanGlobalKgM2-=10/grid.count;r.aggregate();r.route(0);r.validate();
    const volume=()=>{const route=rt.water!.routing!;return route.volumeM3.reduce((sum,v,i)=>sum+((route.network.inlandLakeId?.[i]??0)>0?v:0),0);};
    const cold=rt.refinedSurface!;w.oceanGlobalKgM2+=cold.ice.reduce((s,v)=>s+v,0)/grid.count;cold.ice.fill(0);cold.landK.fill(273.15);cold.seaK.fill(280);for(let a=0;a<cold.lakeArea.length;a++)if(cold.lakeArea[a]===cold.partition.sea[a]&&cold.partition.sea[a]>0)cold.seaK[a]=270;cold.aggregate();
    const lakeBefore=volume(),oceanBefore=w.oceanGlobalKgM2,massBefore=w.diagnostics().totalMm;
    const freezeOceanBefore=w.oceanGlobalKgM2;cold.phase(1800);results.actualLakeFreeze={globalOceanLoss:freezeOceanBefore-w.oceanGlobalKgM2,seaIceOnLake:cold.ice.reduce((sum,v,a)=>sum+(cold.lakeArea[a]===cold.partition.sea[a]&&cold.partition.sea[a]>0?v:0),0)};
    // Return to valid generated heat for the pure topology-change probe.
    const energy=rt.model!.energy();(rt.environment as any).initialEnthalpy=rt.environment!.enthalpy()-rt.model!.radiationJm2;
    rt.enableRefinement('high');results.actualLakeRemap={lakeBefore,lakeAfter:volume(),globalOceanGain:rt.water!.oceanGlobalKgM2-oceanBefore,totalWaterResidual:rt.water!.diagnostics().totalMm-massBefore,sensibleResidual:rt.model!.energy()-energy};
    let restore='accepted';try{const saved=rt.snapshot(),restored=ThermalRuntime.fromSnapshot(saved,DEFAULT_PLANET,DEFAULT_ORBIT);restored.attachRestoredTerrain(sample.landFraction,sample.landElevation,source);results.lakeRestoreInitialDiff=differences(rt.snapshot(),restored.snapshot());const target=rt.model!.timeS+rt.model!.stepS;rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,target,null);restored.sync(DEFAULT_PLANET,DEFAULT_ORBIT,target,null);const diff=differences(rt.snapshot(),restored.snapshot());restore=diff.length?'different':'identical';results.lakeRestoreNextDiff=diff;}catch(e){restore=String(e);}results.actualLakeRemapRestore=restore;
}
{
    const planet={...DEFAULT_PLANET,reliefM:40000},{rt,source,land}=fixture('balanced',planet,true),oldStep=rt.model!.stepS;
    const changed={...source,elevation:source.elevation.map(()=>.9)};let outcome='accepted',restore='not attempted';
    try{rt.setTerrain(land,new Float64Array(rt.grid.count).fill(.9),changed);try{ThermalRuntime.fromSnapshot(rt.snapshot(),planet,DEFAULT_ORBIT);restore='accepted';}catch(e){restore=String(e);}}catch(e){outcome=String(e);}
    results.changedStability={oldStep,newStep:rt.model!.stepS,newStable:rt.model!.maxStableStepS,outcome,restore};
}
{
    const planet={...DEFAULT_PLANET,reliefM:40000},{rt,source,land}=fixture('balanced',planet,true),high={...source,elevation:source.elevation.map(()=>.9)};
    rt.invalidate();rt.setTerrain(land,new Float64Array(rt.grid.count).fill(.9),high);rt.sync(planet,DEFAULT_ORBIT,0,0);const oldStep=rt.model!.stepS;
    let outcome='accepted',restore='not attempted';try{rt.setTerrain(land,new Float64Array(rt.grid.count).fill(.005),source);try{ThermalRuntime.fromSnapshot(rt.snapshot(),planet,DEFAULT_ORBIT);restore='accepted';}catch(e){restore=String(e);}}catch(e){outcome=String(e);}
    results.loweredReliefStability={oldStep,newStep:rt.model!.stepS,newStable:rt.model!.maxStableStepS,outcome,restore};
}
{
    const {rt,source,land,height}=fixture('balanced',{...DEFAULT_PLANET},false,true),g=rt.water!.glacier!;
    g.erodedM[0]=2;g.sedimentM[0]=2;const initial=g.diagnostics(),mass=rt.water!.diagnostics().totalMm,energy=rt.environment!.enthalpy();
    const changed={...source,elevation:source.elevation.map((v,i)=>{const d=source.directions.slice(3*i,3*i+3),u=.5+Math.atan2(d[0],d[2])/(2*Math.PI),vv=Math.acos(d[1])/Math.PI;return thermalCell(rt.grid,u,vv)===0?-.2:v;})};
    land[0]=height[0]=0;let outcome='accepted',nextDiff:any[]=[];
    try{rt.setTerrain(land,height,changed);const saved=rt.snapshot(),restored=ThermalRuntime.fromSnapshot(saved,DEFAULT_PLANET,DEFAULT_ORBIT);restored.attachRestoredTerrain(land,height,changed);const target=rt.model!.timeS+rt.model!.stepS;rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,target,null);restored.sync(DEFAULT_PLANET,DEFAULT_ORBIT,target,null);nextDiff=differences(rt.snapshot(),restored.snapshot());}catch(e){outcome=String(e);}
    results.glacierHistoryRemap={initial,after:rt.water!.glacier!.diagnostics(),erodedVolumeM:rt.water!.glacier!.erodedVolumeM?.[0],sedimentM:rt.water!.glacier!.sedimentM[0],depositedM:rt.water!.glacier!.depositedM[0],waterResidual:rt.water!.diagnostics().totalMm-mass,enthalpyResidual:rt.environment!.enthalpy()-energy-rt.model!.radiationJm2,outcome,nextDiff};
}
{
    const planet={...DEFAULT_PLANET,reliefM:100000};let outcome='accepted',minimum:number|null=null,maximum:number|null=null,restore='not attempted';
    try{const {rt}=fixture('balanced',planet);minimum=Math.min(...rt.refinedSurface!.landK);maximum=Math.max(...rt.refinedSurface!.landK);try{ThermalRuntime.fromSnapshot(rt.snapshot(),planet,DEFAULT_ORBIT);restore='accepted';}catch(e){restore=String(e);}}catch(e){outcome=String(e);}
    results.creationStateBounds={reliefM:planet.reliefM,outcome,minimum,maximum,restore};
}
{
    // Opt-in must retain finite water even where a coarse cell contains no land.
    const {mesh}=makeSphereMesh(1600,35,12345),grid=makeThermalGrid(8,4),rt=new ThermalRuntime(grid),elevation=new Float64Array(mesh.numRegions+mesh.numTriangles),inlandLakeId=new Int32Array(mesh.numTriangles);
    for(let a=0;a<mesh.numRegions;a++)elevation[a]=mesh.xyz_r[3*a]>0?-.2:.03;
    for(let t=0;t<mesh.numTriangles;t++){elevation[mesh.numRegions+t]=mesh.xyz_t[3*t]>0?-.2:.03;if(elevation[mesh.numRegions+t]<0&&mesh.xyz_t[3*t+1]>0&&mesh.xyz_t[3*t+2]>0)inlandLakeId[t]=1;}
    const source={mesh,directions:mesh.xyz_r,elevation,drainage:{inlandLakeId,basinId:new Int32Array(mesh.numTriangles),terminal:new Uint8Array(mesh.numTriangles)}},sample=sampleTerrainGrid(grid,mesh.xyz_r,elevation);
    rt.enabled=rt.waterEnabled=true;rt.config.separateReservoirs=true;rt.environmentConfig.terrainWater=true;rt.setTerrain(sample.landFraction,sample.landElevation,source);rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
    const w=rt.water!,route=w.routing!,triangle=route.network.inlandLakeId!.findIndex((id,t)=>id>0&&route.network.cell[t]>=0&&w.land[route.network.cell[t]]===0);
    if(triangle<0)throw new Error('Classic migration probe needs an exclusively wet inland lake parent');const k=route.network.cell[triangle];
    w.surfaceKgM2[k]+=10;w.oceanGlobalKgM2-=10/grid.count;route.synchronize(w);
    const total=w.diagnostics().totalMm,volume=route.volumeM3.reduce((s,v)=>s+v,0),surface=w.surfaceKgM2[k];let outcome='accepted',restore='not attempted';
    try{rt.enableRefinement('balanced');try{ThermalRuntime.fromSnapshot(rt.snapshot(),DEFAULT_PLANET,DEFAULT_ORBIT);restore='accepted';}catch(e){restore=String(e);}}catch(e){outcome=String(e);}
    results.classicLakeMigration={parent:k,land:w.land[k],surfaceBefore:surface,surfaceAfter:w.surfaceKgM2[k],routedVolumeBefore:volume,routedVolumeAfter:route.volumeM3.reduce((s,v)=>s+v,0),totalWaterResidual:w.diagnostics().totalMm-total,outcome,restore};
    // A fine peak absent from vertex-averaged coarse relief needs a shorter step.
    const peakCell=sample.landFraction.findIndex(v=>v===1),peak=elevation.slice(),planet={...DEFAULT_PLANET,reliefM:40000},atomic=new ThermalRuntime(grid);
    for(let t=0;t<mesh.numTriangles;t++){const [x,y,z]=mesh.xyz_t.subarray(3*t,3*t+3),u=.5+Math.atan2(x,z)/(2*Math.PI),v=Math.acos(y)/Math.PI;if(thermalCell(grid,u,v)===peakCell&&t%2===0)peak[mesh.numRegions+t]=.9;}
    const peakSource={...source,elevation:peak};atomic.enabled=atomic.waterEnabled=true;atomic.config.separateReservoirs=true;atomic.config.landHeatCapacity=100000;atomic.environmentConfig.terrainWater=true;
    atomic.setTerrain(sample.landFraction,sample.landElevation,peakSource);atomic.sync(planet,DEFAULT_ORBIT,0,0);atomic.sync(planet,DEFAULT_ORBIT,atomic.model!.stepS,null);
    const saved=atomic.snapshot(),previousPartition=(atomic.water!.routing as any).partition;let lateOutcome='accepted';try{atomic.enableRefinement('high');}catch(e){lateOutcome=String(e);}
    results.lateEnableAtomic={oldStep:saved.state!.stepS,newStep:atomic.model!.stepS,outcome:lateOutcome,snapshotDiff:differences(saved,atomic.snapshot()),routingPartitionUnchanged:(atomic.water!.routing as any).partition===previousPartition};
}
console.log(JSON.stringify(results,null,2));await writeFile('docs/evidence/earth-climate-refinement-20261011/code-review-recheck.json',JSON.stringify(results,null,2)+'\n');
