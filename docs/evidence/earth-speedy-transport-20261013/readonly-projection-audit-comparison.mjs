// Compare only the two completed, same-clock, three-day V3 audits.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const evidence='docs/evidence/earth-speedy-transport-20261013';
const build='build/earth-speedy-transport';
const originalPath=`${build}/audit-all-corrections-split-reference.json`;
const projectedPath=`${build}/audit-all-corrections-split-reference-projected-initial.json`;
const statusPath=`${evidence}/audit-projected-initial-v3-native-status.json`;
const digest=b=>createHash('sha256').update(b).digest('hex');
const originalBuffer=await readFile(originalPath),projectedBuffer=await readFile(projectedPath);
const original=JSON.parse(originalBuffer),projected=JSON.parse(projectedBuffer);
const statusBuffer=await readFile(statusPath),status=JSON.parse(statusBuffer);
assert.equal(status.code,0);assert(status.sourceUnchanged);assert(status.inputsUnchanged);
assert.equal(status.configuration.PHYSICS_FIX,'all-corrections-split-reference');
assert.equal(status.configuration.SPEEDY_CASE,'audit-projected-initial-v3');
assert.equal(status.sourceBefore[`${evidence}/scalar-initial-projection.jl`],
 '572893f6eacdb9594160638b320e44fd5da6fd047dcec94ae58f19a5f3e3109c');
const peak=steps=>steps.reduce((a,b)=>Math.abs(b.discreteFluxResidual)>Math.abs(a.discreteFluxResidual)?b:a);
const records=[];
for(const mode of ['slab','seasonal']) {
 const a=original.find(x=>x.mode===mode),b=projected.find(x=>x.mode===mode);
 assert(a&&b);assert.equal(a.steps.length,145);assert.equal(b.steps.length,145);
 assert.equal(a.physicsFix,b.physicsFix);assert.equal(a.initialSHA,b.unprojectedStockSHA);
 assert.equal(b.initialSHA,b.projectedStockSHA);assert.notEqual(a.initialSHA,b.initialSHA);
 assert(b.projectionLedger.rows.every(x=>x.validCoefficientsBitwiseUnchanged));
 assert.equal(b.projectionLedger.deferredHistoryFields.length,0);
 const importWaterDeltaMm=b.projectionLedger.afterInventory.current.waterKgM2-b.projectionLedger.beforeInventory.current.waterKgM2;
 assert(Math.abs((b.initial.waterKgM2-a.initial.waterKgM2)-importWaterDeltaMm)<1e-12);
 const fields=['waterMm','evaporationMm','precipitationCounterMm','precipitationByActualDtMm','pressureWaterCorrectionMm','discreteFluxResidual','residualWithCounterMm'];
 const maxDifferences=Object.fromEntries(fields.map(k=>[k,{maxAbsolute:0,step:null,time:null,signedDifference:0}]));
 const stepDifferences=b.steps.map((x,i)=> {
  const y=a.steps[i];assert.equal(x.step,y.step);assert.equal(x.time,y.time);assert.equal(x.dt,y.dt);
  assert.equal(x.scalarAuxiliaryExactlyZero,true);
  for(const key of ['minTemperatureK','maxTemperatureK','maxWindMps'])assert(Number.isFinite(x[key]));
  assert(x.minTemperatureK>0);
  const changes=Object.fromEntries(fields.map(k=> {
   const delta=x[k]-y[k];assert(Number.isFinite(delta));
   if(Math.abs(delta)>maxDifferences[k].maxAbsolute)maxDifferences[k]={maxAbsolute:Math.abs(delta),step:x.step,time:x.time,signedDifference:delta};
   return [k,delta];
  }));
  return {step:x.step,time:x.time,changes};
 });
 const ap=peak(a.steps),bp=peak(b.steps);
 const one=x=>({initial:x.initial,final:x.final,peakResidualMm:x.maxDiscreteResidualMm,
  finalResidualMm:x.finalStep.discreteFluxResidual,stepsOverPointZeroFive:x.stepsOverOriginalPointZeroFive,
  finalEvaporationMm:x.finalStep.evaporationMm,finalPrecipitationCounterMm:x.finalStep.precipitationCounterMm,
  maxPhysicsResidualKgM2S:x.maxPhysicsResidualKgM2S});
 records.push({mode,original:one(a),projected:one(b),originalPeak:{step:ap.step,time:ap.time},projectedPeak:{step:bp.step,time:bp.time},
  importWaterDeltaMm,unprojectedStockSHA:a.initialSHA,projectedStockSHA:b.initialSHA,
  dryMassTargetPolicy:'register_mass! derives target from each case initial inventory; projected target is intentionally not forced to original target',
  originalDryMassTargetKgM2:a.initial.dryKgM2,projectedDryMassTargetKgM2:b.initial.dryKgM2,
  dryMassTargetDifferenceKgM2:b.initial.dryKgM2-a.initial.dryKgM2,
  importTotalMassDeltaKgM2:b.projectionLedger.afterInventory.current.totalKgM2-b.projectionLedger.beforeInventory.current.totalKgM2,
  projectedTemperatureRangeK:[Math.min(...b.steps.map(x=>x.minTemperatureK)),Math.max(...b.steps.map(x=>x.maxTemperatureK))],
  projectedMaximumWindMps:Math.max(...b.steps.map(x=>x.maxWindMps)),
  originalTemperatureComparison:'Unavailable: original audit did not serialize per-step temperature ranges; only its finite/positive assertions are known',
  allScalarAuxiliaryExactlyZero:true,maxDifferences,stepDifferences});
}
const result={scriptSHA:digest(await readFile(new URL(import.meta.url))),
 inputs:{[originalPath]:digest(originalBuffer),[projectedPath]:digest(projectedBuffer),[statusPath]:digest(statusBuffer)},
 sourceUnchanged:status.sourceUnchanged,inputsUnchanged:status.inputsUnchanged,records};
const resultPath=`${build}/readonly-projection-audit-comparison.json`;
await writeFile(resultPath,JSON.stringify(result,null,2)+'\n');
const fmt=x=>Number(x).toPrecision(10);
const lines=[
 '# V3 三天独立初态投影对照', '',
 '使用相同 all-corrections-split-reference 模型配置、原 2001 输入和原生启动过程；在导入后、启动前调用一次冻结 scalar-initial-projection helper。两模式各 145 步、相同时钟；之后每步仅断言辅助行零，无重复投影。保留原审计 register_mass!(v,m) 的语义：各自初态 dry 库存成为各自质量约束 target，投影后 target 因而略变。这是派生初态效应的一部分，不能称所有控制量完全相同。原 V3 raw 初态入口、审计和长期试验均未更改。', '',
 '| 模式 | 原残差峰 mm | 投影后峰 mm | 原第145步残差 mm | 投影后第145步残差 mm | 原/新 >0.05 mm 步数 |',
 '| --- | ---: | ---: | ---: | ---: | ---: |',
 ...records.map(r=>`| ${r.mode} | ${fmt(r.original.peakResidualMm)} | ${fmt(r.projected.peakResidualMm)} | ${fmt(r.original.finalResidualMm)} | ${fmt(r.projected.finalResidualMm)} | ${r.original.stepsOverPointZeroFive}/${r.projected.stepsOverPointZeroFive} |`), '',
 '残差采用既有 Leapfrog/RAW 离散通量账，保留所有原数值系数。初态投影的大气水变化单列为导入差额，初始库存从投影后状态起算，没有把它加入降水或蒸发。', '',
 ...records.flatMap(r=>[
  `**${r.mode}**：原/新峰所在时刻 ${r.originalPeak.time}（第${r.originalPeak.step}步） / ${r.projectedPeak.time}（第${r.projectedPeak.step}步）。`, '',
  `导入 ΔW=${fmt(r.importWaterDeltaMm)} mm，ΔM=${fmt(r.importTotalMassDeltaKgM2)} kg/m²。逐步同钟水库存最大差 ${fmt(r.maxDifferences.waterMm.maxAbsolute)} mm；累计蒸发最大差 ${fmt(r.maxDifferences.evaporationMm.maxAbsolute)} mm；累计降水计数最大差 ${fmt(r.maxDifferences.precipitationCounterMm.maxAbsolute)} mm；离散残差最大差 ${fmt(r.maxDifferences.discreteFluxResidual.maxAbsolute)} mm。`, '',
  `原 dry-mass target ${fmt(r.originalDryMassTargetKgM2)} kg/m²；投影后 target ${fmt(r.projectedDryMassTargetKgM2)} kg/m²；差 ${fmt(r.dryMassTargetDifferenceKgM2)} kg/m²。没有把新 target 强制改回旧 target，也没有另作首次约束来隐藏这项差额。`, '',
  `投影试验逐步温度范围 ${fmt(r.projectedTemperatureRangeK[0])}–${fmt(r.projectedTemperatureRangeK[1])} K，最大风速 ${fmt(r.projectedMaximumWindMps)} m/s；全程标量辅助行精确零，最大参数化水残差 ${fmt(r.projected.maxPhysicsResidualKgM2S)} kg/m²/s。`, '',
  `原 stock SHA：\`${r.unprojectedStockSHA}\`；投影 stock SHA：\`${r.projectedStockSHA}\`。`, ''
 ]),
 '原三天 audit 未保存逐步温度范围，不能从该 JSON 虚构新旧温度差；只能给出原运行通过有限/正温断言，以及本次新增的绝对范围。', '',
 '本试验验证辅助行导入修复在完整短积分中持续有效，不能证明季风、全年气候或长期稳定性已修复；残差峰及所有越线步数如实保留。', '',
 '## 绑定', '',
 ...Object.entries(result.inputs).map(([p,sha])=>`- \`${p}\`：\`${sha}\``),
 `- 比较脚本 SHA：\`${result.scriptSHA}\``,
 `- 全部逐步差异：\`${resultPath}\``,
 '- run-v3-julia 报告 code=0、sourceUnchanged=true、inputsUnchanged=true；源代码和原始初态/SST/环境均已哈希绑定。', ''
];
await writeFile(`${evidence}/scalar-initial-projection-audit.md`,lines.join('\n'));
console.log(JSON.stringify(records.map(({stepDifferences,...r})=>r),null,2));
