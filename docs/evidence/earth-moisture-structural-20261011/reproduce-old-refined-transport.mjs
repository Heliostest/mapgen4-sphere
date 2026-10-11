/** Run from mapgen4-sphere:
 * node docs/evidence/earth-moisture-structural-20261011/reproduce-old-refined-transport.mjs
 * Add --remap to exercise an old irregular coastline after a quality change.
 * Bundles in memory; writes no product, test, checkpoint, or integration data.
 * The old fixture uses the frozen immediate pre-structural water model and
 * pinned original refined deposition, then takes one real coupled step.
 */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const revision='e3222280a0ceddd597245f3c45d75f75d2def9f5';
const remap=process.argv.includes('--remap');
const oldWater=readFileSync('docs/evidence/earth-moisture-structural-20261011/frozen-baseline-water.ts','utf8');
const oldRefined=execFileSync('git',['show',`${revision}:refinement-surface.ts`],{encoding:'utf8',maxBuffer:8*1024*1024});
const oldRuntime=execFileSync('git',['show',`${revision}:thermal-runtime.ts`],{encoding:'utf8',maxBuffer:8*1024*1024});
const sha=text=>createHash('sha256').update(text).digest('hex');
const source=`
import {ThermalRuntime} from './thermal-runtime.ts';
import {makeThermalGrid} from './thermal.ts';
import {DEFAULT_PLANET} from './planet.ts';
import {DEFAULT_ORBIT} from './astronomy.ts';
import {uvToDirection} from './sphere.ts';
export {ThermalRuntime,DEFAULT_PLANET,DEFAULT_ORBIT};
export function fixture(refined=true) {
  const g=makeThermalGrid(8,4),rt=new ThermalRuntime(g);
  rt.enabled=rt.waterEnabled=true;rt.config.separateReservoirs=true;
  rt.waterConfig.moistureScheme='transport';
  const directions=[],elevation=[];
  for(let j=0;j<32;j++)for(let x=0;x<64;x++) {
    directions.push(...uvToDirection((x+.5)/64,Math.acos(1-2*(j+.5)/32)/Math.PI));
    elevation.push(x%8>=${remap?3:4}?-.2:.1);
  }
  rt.setTerrain(new Float64Array(g.count).fill(.5),new Float64Array(g.count).fill(.1),{directions,elevation});
  if(refined)rt.refinement='balanced';
  rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);return rt;
}`;
async function load(old) {
  const result=await build({stdin:{contents:source,resolveDir:process.cwd(),sourcefile:'readonly-old-refined-fixture.ts'},bundle:true,platform:'node',format:'esm',write:false,
    plugins:old?[{name:'pinned-old-water-and-refined-deposition',setup(b){
      b.onLoad({filter:/[\\/]water\.ts$/},()=>({contents:oldWater,loader:'ts'}));
      b.onLoad({filter:/[\\/]refinement-surface\.ts$/},()=>({contents:oldRefined,loader:'ts'}));
      b.onLoad({filter:/[\\/]thermal-runtime\.ts$/},()=>({contents:oldRuntime,loader:'ts'}));
    }}]:[]});
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const old=await load(true),current=await load(false),rt=old.fixture(),w=rt.water,r=rt.refinedSurface,m=rt.model;
// Prepare a finite cold-column initial condition. Redistribute moisture from
// ocean to vapor, then define the new initial enthalpy before any integration.
const inventory=w.diagnostics().totalMm;
r.landK.fill(260);r.seaK.fill(260);m.temperatureK.fill(260);
w.atmosphereKgM2.fill(20);r.aggregate();
w.oceanGlobalKgM2+=inventory-w.diagnostics().totalMm;
rt.environment.initialEnthalpy=rt.environment.enthalpy()-m.radiationJm2;
assert.ok(w.oceanGlobalKgM2>0);
assert.ok(Math.abs(w.diagnostics().totalMm-inventory)<1e-8);
rt.sync(old.DEFAULT_PLANET,old.DEFAULT_ORBIT,m.timeS+m.stepS,null);
assert.equal(m.steps,1);
assert.ok(Math.abs(w.diagnostics().totalMm-inventory)<1e-7);
assert.ok(Math.abs(rt.environment.diagnostics().energyResidualJm2)<.005);
if(remap)rt.enableRefinement('high');
const saved=rt.snapshot();
assert.equal('landPrecipitationKgM2S' in saved.state.water,false);
const excess=Math.max(...w.snowfallKgM2S.map((snow,k)=>snow-w.precipitationKgM2S[k]*w.land[k]));
assert.ok(excess>1e-8,'Fixture must exercise old terrain-weighted land deposition');
console.log(JSON.stringify({revision,remap,oldWaterSha256:sha(oldWater),oldRefinedSha256:sha(oldRefined),oldRuntimeSha256:sha(oldRuntime),steps:m.steps,oldSnowAboveUniformKgM2S:excess,waterResidualMm:rt.water.diagnostics().totalMm-inventory,enthalpyResidualJm2:rt.environment.diagnostics().energyResidualJm2}));
try {
  const a=current.ThermalRuntime.fromSnapshot(saved,current.DEFAULT_PLANET,current.DEFAULT_ORBIT);
  console.log('First restore succeeded');
  const nextSaved=a.snapshot();
  assert.equal(a.water.landPrecipitationKnown,false,'Old refined land deposition must remain explicitly unknown');
  assert.equal('landPrecipitationKgM2S' in nextSaved.state.water,false,'Do not persist estimated old deposition as actual');
  for(let k=0;k<a.grid.count;k++) {
    const estimate=a.water.landPrecipitationKgM2S[k],snow=a.water.snowfallKgM2S?.[k]??0,total=a.water.precipitationKgM2S[k];
    assert.ok(Number.isFinite(estimate)&&estimate>=snow-1e-12&&estimate<=total+1e-12,'Unknown internal estimate must respect recorded snow and total');
  }
  const b=current.ThermalRuntime.fromSnapshot(nextSaved,current.DEFAULT_PLANET,current.DEFAULT_ORBIT);
  assert.deepEqual(b.snapshot(),nextSaved);
  const rollback=current.ThermalRuntime.fromSnapshot(nextSaved,current.DEFAULT_PLANET,current.DEFAULT_ORBIT),shownTime=rollback.model.timeS;
  rollback.sync(current.DEFAULT_PLANET,current.DEFAULT_ORBIT,shownTime+rollback.model.stepS,shownTime);
  rollback.sync(current.DEFAULT_PLANET,current.DEFAULT_ORBIT,shownTime,shownTime);
  assert.equal(rollback.water.landPrecipitationKnown,false,'Presented-frame rollback must retain the unknown old allocation');
  assert.deepEqual(rollback.snapshot(),nextSaved,'Rollback must restore the complete old unknown snapshot');
  const target=a.model.timeS+a.model.stepS;
  a.sync(current.DEFAULT_PLANET,current.DEFAULT_ORBIT,target,null);
  b.sync(current.DEFAULT_PLANET,current.DEFAULT_ORBIT,target,null);
  assert.deepEqual(a.snapshot(),b.snapshot());
  assert.equal(a.water.landPrecipitationKnown,true,'An actual new step must replace the unknown estimate');
  assert.ok('landPrecipitationKgM2S' in a.snapshot().state.water);
  console.log('PASS: old refined load-save-load and next-step equality');
} catch(error) {
  console.error('FAIL: old refined load-save-load:',error.message);process.exitCode=1;
}
// A second diagnostic-only fixture exercises first enableRefinement. These
// recorded rates are not stocks and cannot alter the mass/energy inventory.
if(!remap){
const coarse=current.fixture(false),cw=coarse.water;
cw.precipitationKgM2S.fill(10);cw.landPrecipitationKgM2S.fill(8);cw.oceanPrecipitationKgM2S.fill(2);
coarse.enableRefinement('balanced');
const fine=coarse.refinedSurface,p=fine.partition,k=12;
let shownLand=0,shownSea=0;
for(let t=p.offset[k];t<p.offset[k+1];t++) {
  const area=p.land[t]+p.sea[t];
  shownLand+=fine.rain[t]*p.land[t]/area;shownSea+=fine.rain[t]*p.sea[t]/area;
}
console.log(JSON.stringify({recordedLand:cw.landPrecipitationKgM2S[k],shownLand,recordedSea:cw.oceanPrecipitationKgM2S[k],shownSea}));
if(Math.abs(shownLand-8)<1e-12&&Math.abs(shownSea-2)<1e-12)console.log('PASS: first refinement preserves recorded land/sea rain');
else {console.error('FAIL: first refinement changes recorded land/sea rain');process.exitCode=1;}
}
