import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const folder='docs/evidence/earth-direct-settings-20261011',build='build/earth-direct-settings';
const load=async p=>JSON.parse(await fs.readFile(p,'utf8')),mean=a=>a.reduce((s,v)=>s+v,0)/a.length,sha=b=>createHash('sha256').update(b).digest('hex');
const profiles=await load(`${folder}/profiles.json`),screens=[];
for(const label of Object.keys(profiles)){
  try{const r=await load(`${build}/screen-${label}.json`);assert(r.strictContinuation);screens.push(r);await fs.copyFile(`${build}/screen-${label}.json`,`${folder}/screen-${label}.json`);}
  catch(e){if(e.code!=='ENOENT')throw e;}
}
assert(screens.every(r=>r.initialStockSha===screens[0].initialStockSha));
const current=await load(`${build}/full-current.json`),direct=await load(`${build}/full-direct0575.json`);
assert(current.strictContinuation&&direct.strictContinuation&&current.initialStockSha===direct.initialStockSha&&current.inputSha256===direct.inputSha256);
assert(direct.records.at(-1).day===current.records.at(-1).day&&direct.records.at(-1).day>365);
const formalSha256=sha(await fs.readFile('scenes/earth-land-sea/earth-simulation.json'));assert(direct.formalSha256===formalSha256&&current.formalSha256===formalSha256);
const regions=current.gpcc.map((r,i)=>({name:r.name,bounds:r.bounds,fit:r.fit,observed:r.observedAnnualMm,current:r.modelAnnualMm,direct:direct.gpcc[i].modelAnnualMm,currentMonthly:r.monthlyMm,directMonthly:direct.gpcc[i].monthlyMm,observedMonthly:r.observedMonthlyMm}));
const regionMae=key=>mean(regions.filter(r=>r.fit).map(r=>Math.abs(r[key]-r.observed)));
const ice=['north','south'].map(h=>({hemisphere:h,current:current.hemispheres[h],direct:direct.hemispheres[h],extentMaeReductionPercent:100*(1-direct.hemispheres[h].extentMAE/current.hemispheres[h].extentMAE),areaMaeReductionPercent:100*(1-direct.hemispheres[h].areaMAE/current.hemispheres[h].areaMAE)}));
const dt1800=screens.find(r=>r.label==='direct0575'),dt900=screens.find(r=>r.label==='direct0575dt900');assert(dt1800&&dt900&&dt900.dt===900);
const coarseTimeStepCheck={backend:'common coarse water routing, not full-terrain annual dt validation',annualSurfaceMeanDifferenceC:dt900.annualSurfaceMeanC-dt1800.annualSurfaceMeanC,maxRegionPrecipDifferencePercent:Math.max(...dt1800.gpcc.map((v,i)=>100*Math.abs(dt900.gpcc[i].modelAnnualMm/v.modelAnnualMm-1)))};
assert(Math.abs(coarseTimeStepCheck.annualSurfaceMeanDifferenceC)<.05&&coarseTimeStepCheck.maxRegionPrecipDifferencePercent<1);
const budgetMax=Object.fromEntries(['waterMax','heatMax','vaporMax'].map(k=>[k,Math.max(current.budgetMax[k],direct.budgetMax[k])]));
const snapshot=async p=>{const j=await load(p),a=j.runtime.state.water;return {seaIceGlobalMeanMm:mean(a.seaIceKgM2),snowGlobalMeanMm:mean(a.snowKgM2)};};
const physicalIce={current:await snapshot('build/earth-parameter-tuning/full-tuned-day365.json'),direct:await snapshot(`${build}/full-direct0575-day365.json`)};
const acceptance={formalDefaultsUnchanged:true,formalSha256,sameInitialWaterHeatAndTemperature:true,initialStockSha256:direct.initialStockSha,inputSha256:direct.inputSha256,strictContinuation:true,meshTriangles:direct.meshTriangles,dt:direct.dt,integrationDays:direct.records.at(-1).day,currentParameters:profiles.current,directParameters:profiles.direct0575,ice,physicalIce,regions,temperateRegionalMeanAbsoluteBiasMm:{current:regionMae('current'),direct:regionMae('direct')},budgetMax,coarseTimeStepCheck,baselineReusedFrom:current.reusedFrom,screenCount:screens.length,observationSupport:{gpcc:'GPCC v2022 1991–2020 normals, common valid land support, actual annual land precipitation',nsidc:'Cached G02202 v2 NASA Team monthly concentration 1981–2010, common valid marine support, fixed 15% threshold and existing 0.5 m cover diagnostic'},limitations:['One transient physical orbital year, not a converged climate.','Global coefficients do not independently control temperate storms and regional monsoons.','The stronger melting profile is a tradeoff; it is not a uniformly better Earth calibration.','No independent ice concentration/thickness or full downwelling atmospheric radiation closure.']};
await fs.writeFile(`${folder}/acceptance.json`,JSON.stringify(acceptance,null,2)+'\n');
await fs.copyFile(`${build}/full-current.json`,`${folder}/full-current.json`);await fs.copyFile(`${build}/full-direct0575.json`,`${folder}/full-direct0575.json`);
const row=r=>`| ${r.name} | ${r.observed.toFixed(1)} | ${r.current.toFixed(1)} | ${r.direct.toFixed(1)} |`;
const screening=screens.filter(r=>r.dt===1800).map(r=>`| ${r.label} | ${r.hemispheres.north.extentMAE.toFixed(2)} | ${r.hemispheres.south.extentMAE.toFixed(2)} | ${r.gpcc[0].modelAnnualMm.toFixed(0)} | ${r.gpcc[3].modelAnnualMm.toFixed(0)} | ${r.gpcc[7].modelAnnualMm.toFixed(0)} | ${r.gpcc[8].modelAnnualMm.toFixed(0)} |`);
const report=`# 更直接的数值设置对照（2026-10-11）

采用第二个融冰实验档：仅把有效发射率从 0.595 改为 0.575，热输送仍为 0.80，蒸发比例仍为 0.50。初始水库、热容量、温度和焓完全相同；里海初值保留。正式 Earth 文件与默认设置不变。

这个设置改变实际长波能量收支，随后通过真实相变融冰；不改结冰温度、冰量或覆盖/显示阈值。它是简化模型的有效辐射系数，不是测得的温室气体浓度。候选也不是观测全面验收通过的配置。

## 完整地形年度对照

${direct.meshTriangles} 地形单元、1800 s 步长；从相同初值真实积分 ${direct.records.at(-1).day.toFixed(6)} 天。温和档复用上一轮已完成的独立年度积分，其输入、库存和模型算法未变。两臂严格保存恢复与下一步完全一致检查通过。

库存（包括初始温度、全部有限水库、显热和焓）SHA256：${direct.initialStockSha}。

同一 NSIDC 海域权重与 15% 阈值，月海冰范围 MAE 单位百万 km²：

| 半球 | 0.595 温和档 | 0.575 融冰档 | 误差减少 |
|---|---:|---:|---:|
${ice.map(r=>`| ${r.hemisphere} | ${r.current.extentMAE.toFixed(2)} | ${r.direct.extentMAE.toFixed(2)} | ${r.extentMaeReductionPercent.toFixed(1)}% |`).join('\n')}

年末全球面积平均实际海冰质量（水当量） ${physicalIce.current.seaIceGlobalMeanMm.toFixed(2)} → ${physicalIce.direct.seaIceGlobalMeanMm.toFixed(2)} mm，积雪 ${physicalIce.current.snowGlobalMeanMm.toFixed(2)} → ${physicalIce.direct.snowGlobalMeanMm.toFixed(2)} mm。海冰覆盖仍由既有质量/0.5 m 规则诊断。

实际陆地降水与同支持 GPCC，单位 mm/年：

| 区域 | GPCC | 温和档 | 融冰档 |
|---|---:|---:|---:|
${regions.map(row).join('\n')}

前四温带区域等权绝对偏差均值 ${regionMae('current').toFixed(1)} → ${regionMae('direct').toFixed(1)} mm/年。副作用和剩余偏差应逐区读取；面积加权全球精度、狭窄山地雨影与季风不能用该均值代替。

完整地形下，欧洲、北美东部和西西伯利亚降水增加、干旱偏差缩小；东亚原本已略湿，进一步增雨会加重偏差。印度、西藏和亚马孙年总量更接近 GPCC；澳洲、喜马拉雅前缘和刚果偏湿加重。该强档适合检查进一步融冰，温和档在这些偏湿区域更接近观测。冰封绝对范围仍过大，两档都没有通过全面气候观测验收。

融冰档全球年均表温 ${direct.annualSurfaceMeanC.toFixed(2)} °C，±30° 湿面海温 ${direct.annualTropicalSeaMeanC.toFixed(2)} °C，均为本模型一年瞬态诊断。

## 单项设置与失败方向

以下都是同水/温度/显热初值的粗路由年度真实积分，用于敏感性筛选，不是全部配置的完整地形验收。前一轮温和档的 coarse 结果作为本轮 current 对照复用。

| 配置 | 北冰范围 MAE | 南冰范围 MAE | 欧洲雨 | 西西伯利亚雨 | 西南澳雨 | 北澳雨 |
|---|---:|---:|---:|---:|---:|---:|
${screening.join('\n')}

- 增大蒸发比例能明显增雨，但蒸发冷却会加重结冰，澳洲更湿。
- 增大气层长波散热份额能暖地表、减少海冰，但也加重西南澳偏湿；这不是短波吸收份额。
- 土壤容量 150 → 250 mm 对年降水影响很小，不能当作降水旋钮。
- 风带强度 10 → 13/16 的收益小，北澳继续偏湿。增加上限的实验仅重新表达模板偏差记忆，保留每个初始实际风速；不重新生成气候。10 → 8 无法保持现有初始风速上限，拒绝纳入同状态对照。
- 关闭动态环流会改善欧洲/西西伯利亚，却使印度、东亚、北美东部和西南澳明显少雨，因此不采用。
- 0.58 单项在这个粗网格上并非两半球范围误差都改善；选择 0.575 作为显式第二档进行完整地形对照。

完整对照预算最大残差：总水 ${budgetMax.waterMax.toExponential(3)} mm；焓 ${budgetMax.heatMax.toExponential(3)} J/m²；单元水汽 ${budgetMax.vaporMax.toExponential(3)} mm。900 s 粗路由复验：年均表温差 ${coarseTimeStepCheck.annualSurfaceMeanDifferenceC.toFixed(5)} °C，区域年雨量最大差 ${coarseTimeStepCheck.maxRegionPrecipDifferencePercent.toFixed(3)}%。此步长检查不冒充完整地形 900 s 年度积分。

## 真实画面对照

相同第 365.270833 天、南北美洲中心、太空视角、12× 起伏、地球地表、关闭云层、保留真实昼夜。截图只用于形态检查；降水改善看全年积分。

![温和档](current-year1.jpg)

![进一步融冰](direct-year1.jpg)

## 复现与边界

screen.ts/full.ts 使用 esbuild 打包为 Node ESM，PARAM_PROFILE 指定 profiles.json 中的配置名；PARAM_DT 可设 900。full.ts 读取上一轮 lake-day0.json。运行 analyze.mjs 归档完整、严格续算通过的结果；preview.mjs 生成忽略目录下独立交互场景。完整初值与年末快照均保留，场景上方可返回温和档或从初值推进。

${acceptance.limitations.map(v=>'- '+v).join('\n')}

观测：[GPCC v2022](https://opendata.dwd.de/climate_environment/GPCC/gpcc_normals_v2022/)、[NSIDC G02202 v2](https://doi.org/10.7265/N55M63M1)。缓存和支持定义沿用上一轮，不重新挑选区域来排除副作用。
`;
await fs.writeFile(`${folder}/report.md`,report);
console.log(JSON.stringify({ice:ice.map(r=>({hemisphere:r.hemisphere,current:r.current.extentMAE,direct:r.direct.extentMAE,reductionPercent:r.extentMaeReductionPercent})),rainBias:acceptance.temperateRegionalMeanAbsoluteBiasMm,budgetMax,coarseTimeStepCheck,regions:regions.map(r=>({name:r.name,observed:r.observed,current:r.current,direct:r.direct})),physicalIce},null,2));
