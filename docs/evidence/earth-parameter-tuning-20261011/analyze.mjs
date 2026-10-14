import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder='docs/evidence/earth-parameter-tuning-20261011',build='build/earth-parameter-tuning';
const load=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const profiles=await load(`${folder}/profiles.json`);
const screens=[];
for(const label of Object.keys(profiles)){
  try{const r=await load(`${build}/screen-${label}.json`);assert(r.strictContinuation);screens.push(r);await fs.copyFile(`${build}/screen-${label}.json`,`${folder}/screen-${label}.json`);}
  catch(e){if(e.code!=='ENOENT')throw e;}
}
assert(screens.every(r=>r.initialStockSha===screens[0].initialStockSha));
const coarse1800=screens.find(r=>r.label==='moderate'),coarse900=screens.find(r=>r.label==='tuned900');
assert(coarse1800&&coarse900&&coarse900.dt===900);
const coarseStepConvergence={backend:'common coarse routing, not full-terrain time-step validation',sameInitialStockSha:coarse1800.initialStockSha,dtS:[coarse1800.dt,coarse900.dt],annualSurfaceMeanDifferenceC:coarse900.annualSurfaceMeanC-coarse1800.annualSurfaceMeanC,maxRegionalRainDifferencePercent:Math.max(...coarse1800.gpcc.map((v,i)=>100*Math.abs(coarse900.gpcc[i].modelAnnualMm/v.modelAnnualMm-1))),extentMaeDifferenceMillionKm2:Object.fromEntries(['north','south'].map(h=>[h,coarse900.hemispheres[h].extentMAE-coarse1800.hemispheres[h].extentMAE]))};
assert(Math.abs(coarseStepConvergence.annualSurfaceMeanDifferenceC)<.05&&coarseStepConvergence.maxRegionalRainDifferencePercent<1);
const runs=await Promise.all(['control','tuned'].map(p=>load(`${build}/full-${p}.json`)));
assert(runs.every(r=>r.strictContinuation&&r.initialStockSha===runs[0].initialStockSha&&r.inputSha256===runs[0].inputSha256));
assert(runs.every(r=>r.records.at(-1).day>365&&r.records.at(-1).day<366));
const formal=sha(await fs.readFile('scenes/earth-land-sea/earth-simulation.json'));
assert(runs.every(r=>r.formalSha256===formal));
assert(runs.every(r=>r.records.every(v=>Math.abs(v.budget.routingResidualM3)<10)));
const seaIce=['north','south'].map(h=>({hemisphere:h,control:runs[0].hemispheres[h],tuned:runs[1].hemispheres[h],extentMaeImprovementPercent:100*(1-runs[1].hemispheres[h].extentMAE/runs[0].hemispheres[h].extentMAE)}));
const gpcc=runs[0].gpcc.map((r,i)=>({name:r.name,bounds:r.bounds,fit:r.fit,observedAnnualMm:r.observedAnnualMm,control:r.modelAnnualMm,tuned:runs[1].gpcc[i].modelAnnualMm,controlMonthlyMm:r.monthlyMm,tunedMonthlyMm:runs[1].gpcc[i].monthlyMm,observedMonthlyMm:r.observedMonthlyMm,controlSnowCover:r.monthlySnowCover,tunedSnowCover:runs[1].gpcc[i].monthlySnowCover}));
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const fitMae=arm=>mean(gpcc.filter(r=>r.fit).map(r=>Math.abs(r[arm]-r.observedAnnualMm)));
const observations={gpcc:{path:'docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json',sha256:sha(await fs.readFile('docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json'))},nsidc:{path:'docs/evidence/earth-seaice-causal-20261011/nsidc-same-grid.json',sha256:sha(await fs.readFile('docs/evidence/earth-seaice-causal-20261011/nsidc-same-grid.json'))}};
const acceptance={formalDefaultsUnchanged:true,formalSha256:formal,sameInitialStocks:true,initialStockSha:runs[0].initialStockSha,inputSha256:runs[0].inputSha256,meshTriangles:runs[0].meshTriangles,parameters:profiles.tuned,strictContinuation:true,integrationDays:runs[0].records.at(-1).day,observations,seaIce,gpcc,temperateRegionMeanAbsoluteBiasMm:{control:fitMae('control'),tuned:fitMae('tuned')},budgetMax:Object.fromEntries(['waterMax','heatMax','vaporMax'].map(k=>[k,Math.max(...runs.map(r=>r.budgetMax[k]))])),routingResidualMaxM3:Math.max(...runs.flatMap(r=>r.records.map(v=>Math.abs(v.budget.routingResidualM3)))),coarseStepConvergence,screenCount:screens.length,limitations:['One transient orbital year, not climate equilibrium.','Ice concentration remains diagnosed from mass and the existing 0.5 m cover rule. No threshold changes.','Effective column radiation and coarse atmospheric transport are reduced physics; the parameters are sensitivity coefficients, not observed atmospheric composition.','Same-grid NASA Team monthly NSIDC fields, not native complete hemispheric index or merged CDR.','GPCC common valid land support cannot resolve narrow rain shadows or storm tracks.','Screening used a shared coarse water routing backend. Final acceptance used the full terrain and retained lake inventory.']};
await fs.writeFile(`${folder}/acceptance.json`,JSON.stringify(acceptance,null,2)+'\n');
for(const r of runs)await fs.copyFile(`${build}/full-${r.label}.json`,`${folder}/full-${r.label}.json`);
const table=gpcc.map(r=>`| ${r.name} | ${r.observedAnnualMm.toFixed(1)} | ${r.control.toFixed(1)} | ${r.tuned.toFixed(1)} |`).join('\n');
const screenTable=screens.map(r=>`| ${r.label} | ${r.hemispheres.north.extentMAE.toFixed(2)} | ${r.hemispheres.south.extentMAE.toFixed(2)} | ${r.annualSurfaceMeanC.toFixed(2)} | ${r.annualTropicalSeaMeanC.toFixed(2)} |`).join('\n');
const report=`# 冰封与温带降水参数对照（2026-10-11）

正式默认与 authored Earth 输入不变。候选配置只保存于独立实验与预览。所有正式验收从同一份含里海初值的完整状态出发；未重新生成温度、补水或跳转季节。

## 参数与方法

候选参数：${JSON.stringify(profiles.tuned)}。热容量、海洋有效深度、所有初始水库与温度均保持一致。公共物理基线启用既有共享水汽、0.5 气层辐射份额、导热海冰、冰下输送、独立陆海反照率和低温未结冰海水蒸发。基线与候选仅参数不同，因此不能把共同启用的机制收益归到此次调参。

全地形 ${runs[0].meshTriangles} 单元，步长 1800 s，实际积分 ${runs[0].records.at(-1).day.toFixed(6)} 天；月通量恰好裁到一个物理公转年。日历以 3 月 20 日为起点。记录实际陆地降水，GPCC 共享有效陆地支持；海冰使用既有 15% 阈值与同一 NSIDC 海域权重。每一臂均通过严格保存恢复及下一步完全一致检查。

库存/初始显热与焓 SHA256：${runs[0].initialStockSha}。

## 同网格结果

海冰月范围 MAE，单位百万 km²：

| 半球 | 对照 | 候选 | 减少 |
|---|---:|---:|---:|
${seaIce.map(r=>`| ${r.hemisphere} | ${r.control.extentMAE.toFixed(2)} | ${r.tuned.extentMAE.toFixed(2)} | ${r.extentMaeImprovementPercent.toFixed(1)}% |`).join('\n')}

陆地降水，单位 mm/年；前四区域用于温带筛选，其余区域检查副作用：

| 区域 | GPCC | 对照 | 候选 |
|---|---:|---:|---:|
${table}

四个温带区域等权年降水绝对偏差均值：${fitMae('control').toFixed(1)} → ${fitMae('tuned').toFixed(1)} mm/年。这不是全球或面积加权误差。

欧洲、北美东部与东亚更接近观测；西西伯利亚略更干。印度、喜马拉雅前缘、西藏、西南澳、刚果的年总量偏差缩小，北澳偏湿加重、亚马孙略更干。候选全球年均表温 ${runs[1].annualSurfaceMeanC.toFixed(2)} °C，±30° 湿面年均海温 ${runs[1].annualTropicalSeaMeanC.toFixed(2)} °C；这些是本模型的一年瞬态诊断，不是对观测海温的校准。

## 筛选与边界

各臂共同粗路由、同初始温度/水库/显热的一年真实积分，仅用于参数敏感性筛选；下表不是完整地形最终验收。

| 配置 | 北海冰范围 MAE | 南海冰范围 MAE | 全球年均表温 °C | ±30° 湿面年均海温 °C |
|---|---:|---:|---:|---:|
${screenTable}

diffusion=2 在 1800 s 步长下超过显式稳定限，加载前被拒绝，未纳入有效结果。更强水汽混合会让喜马拉雅前缘偏湿并恶化西南澳；过低的有效发射率使热带升温过多。增强海流的单项收益小，降低蒸发比例会进一步减雨。

预算最大残差：总水 ${acceptance.budgetMax.waterMax.toExponential(3)} mm；焓 ${acceptance.budgetMax.heatMax.toExponential(3)} J/m²；单元水汽 ${acceptance.budgetMax.vaporMax.toExponential(3)} mm。全部初始有限库存、潜热转移与实际外部辐射收支仍被计算。

900 s 粗模型同库存复验：年均表温差 ${coarseStepConvergence.annualSurfaceMeanDifferenceC.toFixed(5)} °C，11 个区域年雨量最大差 ${coarseStepConvergence.maxRegionalRainDifferencePercent.toFixed(3)}%。这是共同粗路由的步长检查，不能冒充完整地形 900 s 年度验收。完整地形两臂的水路由分区残差最大 ${acceptance.routingResidualMaxM3.toExponential(3)} m³。

${acceptance.limitations.map(v=>'- '+v).join('\n')}

数值变化是改善幅度，不能据此声称冰封或所有温带干旱已通过观测验收。西西伯利亚、印度、热带与澳洲的剩余偏差详见上述独立区域结果；积雪与海冰分别记录，截图白色不全是海冰。

## 实际 WebGL 对照

相同第 365.270833 天、太空视角、南北美洲中心、地球地表图层、12× 起伏、关闭云层；只改变参数后的真实积分状态。昼夜光照保留。图像仅作形态检查，降水改善以全年通量/GPCC 表为准。

![一年对照](control-year1-americas.jpg)

![一年候选](tuned-year1-americas.jpg)

来源：[GPCC v2022 normals](https://opendata.dwd.de/climate_environment/GPCC/gpcc_normals_v2022/)、[NSIDC G02202 v2](https://doi.org/10.7265/N55M63M1)。低层热量与水汽输送的物理动机见 [NASA ISCCP](https://isccp.giss.nasa.gov/role.html)；完整海冰热力学所需通量与面积状态参见 [MITgcm SEAICE](https://mitgcm.readthedocs.io/en/latest/phys_pkgs/seaice.html)。

复现：用 esbuild 将 screen.ts/full.ts 打包为 Node ESM，设置 PARAM_PROFILE 为 profiles.json 中的配置名运行。full.ts 读取 build/earth-lakes-freeze-temperate/lake-day0.json，须先运行上一轮 lake.ts。analyze.mjs 仅接纳完整年度且严格续算通过的结果；完整快照与可交互预览位于忽略目录 build/earth-parameter-tuning。
`;
await fs.writeFile(`${folder}/report.md`,report);
console.log(JSON.stringify({seaIce:seaIce.map(r=>({hemisphere:r.hemisphere,control:r.control.extentMAE,tuned:r.tuned.extentMAE,improvementPercent:r.extentMaeImprovementPercent})),temperateMeanAbsoluteBiasMm:acceptance.temperateRegionMeanAbsoluteBiasMm,budgetMax:acceptance.budgetMax,gpcc:gpcc.map(r=>({name:r.name,observed:r.observedAnnualMm,control:r.control,tuned:r.tuned}))},null,2));
