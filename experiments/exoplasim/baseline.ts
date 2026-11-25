import {readFile,writeFile} from 'node:fs/promises';
import {loadWorld} from './prepare.ts';
import {CalendarFlux} from '../../climate-diagnostics.ts';
import {FIELDS} from './data.ts';
const input=JSON.parse(await readFile('build/exoplasim/input.json','utf8'));
const {p,o,rt,worldSha256}=await loadWorld(input.worldPath);
if(worldSha256!==input.worldSha256)throw new Error('World changed after export');
// Reinitialize the existing model at the same circular-orbit January phase
// used by ExoPlaSim's native calendar. Initial inventories remain model-specific.
const january={...o,orbitPhaseRad:-2*Math.PI*80.5/365};rt.invalidate();rt.sync(p,january,0,null);
const m=rt.model!,w=rt.water!,e=rt.environment!,year=m.yearS,n=rt.grid.count;
const ledger=Object.fromEntries(FIELDS.map(key=>[key,new CalendarFlux(n,year,0)]));
const coverage=new CalendarFlux(1,year,0),step=e.step.bind(e);let elapsed=0;
e.step=(dt:number)=>{step(dt);ledger.temperatureK.add(elapsed,dt,m.temperatureK);ledger.rainMmDay.add(elapsed,dt,w.precipitationKgM2S.map(x=>x*86400));ledger.eastMps.add(elapsed,dt,w.windEastMps);ledger.northMps.add(elapsed,dt,w.windNorthMps);coverage.add(elapsed,dt,[1]);elapsed+=dt;};
// Run through the last complete physical step; the sub-step tail is reported.
const targetSteps=Math.floor(year/m.stepS),start=performance.now();
while(m.steps<targetSteps){rt.sync(p,january,Math.min(targetSteps,m.steps+32)*m.stepS,null);if(m.steps%960===0)console.log(`baseline ${(m.timeS/year*365).toFixed(1)} days`);}
const months=Array.from({length:12},(_,i)=>({month:i+1,width:rt.grid.width,height:rt.grid.height,seconds:coverage.months[i][0],...Object.fromEntries(FIELDS.map(key=>[key,Array.from(ledger[key].months[i],x=>x/coverage.months[i][0])]))}));
const result={worldSha256,months,elapsedS:elapsed,tailS:year-elapsed,wallSeconds:(performance.now()-start)/1000,waterResidualMm:w.diagnostics().residualMm,energyResidualJm2:e.diagnostics().energyResidualJm2,parameters:{planet:p,orbit:january,thermal:rt.config,water:rt.waterConfig,environment:rt.environmentConfig},notes:'Current production physics, January reinitialization, first transient year, monthly means weighted by physical seconds. Air is the current single-column variable; wind is the current single-layer wind.'};
await writeFile('build/exoplasim/baseline.json',JSON.stringify(result));console.log(JSON.stringify({baselineDone:true,wallSeconds:result.wallSeconds,tailS:result.tailS,waterResidualMm:result.waterResidualMm}));
