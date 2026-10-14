import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const folder='docs/evidence/earth-balanced-settings-20261012',out='build/earth-balanced-settings',selected=process.argv[2]??'mix4';
const load=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length,sha=b=>createHash('sha256').update(b).digest('hex');
const profiles=await load(`${folder}/profiles.json`);
const full=Object.fromEntries(await Promise.all(['direct','mild','mix4','mix4cool'].map(async label=>[label,await load(`${out}/full-${label}.json`)])));
const screens=[];
for(const name of (await fs.readdir(out)).filter(n=>n.startsWith('screen-')&&n.endsWith('.json'))){const r=await load(`${out}/${name}`);screens.push(r);await fs.copyFile(`${out}/${name}`,`${folder}/${name}`);}
const candidate=full[selected],current=full.direct,mild=full.mild;
assert(candidate&&screens.every(r=>r.strictContinuation&&r.initialStockSha===screens[0].initialStockSha));
assert(Object.values(full).every(r=>r.strictContinuation&&r.initialStockSha===current.initialStockSha&&r.inputSha256===current.inputSha256&&r.records.at(-1).day===current.records.at(-1).day));
assert(Object.values(full).every(r=>r.numerics==='compensated-ocean-transfers'),'All final arms must use the same corrected accumulation');
const formalSha256=sha(await fs.readFile('scenes/earth-land-sea/earth-simulation.json'));assert(Object.values(full).every(r=>r.formalSha256===formalSha256));
for(const r of Object.values(full))assert.deepEqual(r.gpcc.map(v=>[v.name,v.bounds,v.observedMonthlyMm]),current.gpcc.map(v=>[v.name,v.bounds,v.observedMonthlyMm]));
const stats=j=>({temperateMeanAbsoluteBiasMm:mean(j.gpcc.filter(r=>r.fit).map(r=>Math.abs(r.modelAnnualMm-r.observedAnnualMm))),ice:Object.fromEntries(['north','south'].map(h=>[h,{extentMAE:j.hemispheres[h].extentMAE,areaMAE:j.hemispheres[h].areaMAE}]))});
const physicalIce=async path=>{const s=(await load(path)).runtime.state.water;return {seaIceGlobalMeanMm:mean(s.seaIceKgM2),snowGlobalMeanMm:mean(s.snowKgM2)};};
const frozen={direct:await physicalIce(`${out}/full-direct-day365.json`),mild:await physicalIce(`${out}/full-mild-day365.json`)};
for(const label of ['mix4','mix4cool'])frozen[label]=await physicalIce(`${out}/full-${label}-day365.json`);
const summaries=Object.fromEntries(Object.entries(full).map(([label,j])=>[label,{...stats(j),physicalIce:frozen[label],parameters:j.parameters,budgetMax:j.budgetMax,budgetAudit:j.budgetAudit??{cadence:'previous quarterly checkpoints'},reusedFrom:j.reusedFrom??null}]));
const evaluate=label=>{
 const j=full[label],s=summaries[label];
 return {
   hemispheres:['north','south'].map(h=>({hemisphere:h,pass:s.ice[h].extentMAE<summaries.direct.ice[h].extentMAE,reductionPercent:100*(1-s.ice[h].extentMAE/summaries.direct.ice[h].extentMAE)})),
   physicalSeaIceReductionPercent:100*(1-frozen[label].seaIceGlobalMeanMm/frozen.direct.seaIceGlobalMeanMm),
   temperate:{pass:s.temperateMeanAbsoluteBiasMm<Math.min(summaries.direct.temperateMeanAbsoluteBiasMm,summaries.mild.temperateMeanAbsoluteBiasMm),reductionPercent:100*(1-s.temperateMeanAbsoluteBiasMm/summaries.direct.temperateMeanAbsoluteBiasMm)},
   australia:j.gpcc.filter(r=>r.name.startsWith('Australia')).map(r=>{const b=mild.gpcc.find(v=>v.name===r.name);return {region:r.name,pass:Math.abs(r.modelAnnualMm-r.observedAnnualMm)<=Math.abs(b.modelAnnualMm-b.observedAnnualMm),observed:r.observedAnnualMm,mild:b.modelAnnualMm,direct:current.gpcc.find(v=>v.name===r.name).modelAnnualMm,candidate:r.modelAnnualMm};}),
 };
};
const verdicts=Object.fromEntries(['mix4','mix4cool'].map(label=>[label,evaluate(label)]));
for(const v of Object.values(verdicts))v.threeTargetsPass=v.hemispheres.every(h=>h.pass)&&v.physicalSeaIceReductionPercent>0&&v.temperate.pass&&v.australia.every(r=>r.pass);
const dt1800=screens.find(r=>r.label===selected),dt900=screens.find(r=>r.label===`${selected}dt900`);assert(dt1800&&dt900&&dt900.dt===900);
assert(dt1800.numerics==='compensated-ocean-transfers'&&dt900.numerics==='compensated-ocean-transfers');
const timeStepCheck={backend:'same coarse routing, not full-terrain dt900 validation',annualSurfaceMeanDifferenceC:dt900.annualSurfaceMeanC-dt1800.annualSurfaceMeanC,maxRegionalRainDifferencePercent:Math.max(...dt1800.gpcc.map((r,i)=>100*Math.abs(dt900.gpcc[i].modelAnnualMm/r.modelAnnualMm-1))),extentMaeDifference:Object.fromEntries(['north','south'].map(h=>[h,dt900.hemispheres[h].extentMAE-dt1800.hemispheres[h].extentMAE]))};
assert(Math.abs(timeStepCheck.annualSurfaceMeanDifferenceC)<.05&&timeStepCheck.maxRegionalRainDifferencePercent<1);
assert(candidate.budgetAudit.auditCount>=365&&candidate.budgetMax.routingMax<1);
const regions=current.gpcc.map((r,i)=>({name:r.name,bounds:r.bounds,fit:r.fit,observedAnnualMm:r.observedAnnualMm,observedMonthlyMm:r.observedMonthlyMm,values:Object.fromEntries(Object.entries(full).map(([label,j])=>[label,{annualMm:j.gpcc[i].modelAnnualMm,monthlyMm:j.gpcc[i].monthlyMm,monthlyMaeMm:mean(j.gpcc[i].monthlyMm.map((v,k)=>Math.abs(v-r.observedMonthlyMm[k]))),mechanismsMm:j.gpcc[i].annualMechanismsMm??null}]))}));
const acceptance={selected,formalDefaultsUnchanged:true,formalSha256,inputSha256:candidate.inputSha256,initialStockSha256:candidate.initialStockSha,strictContinuation:true,commonNumerics:'compensated-ocean-transfers (opt-in; absent from formal defaults)',meshTriangles:candidate.meshTriangles,dt:candidate.dt,integrationDays:candidate.records.at(-1).day,summaries,verdicts,timeStepCheck,regions,observationSupport:{gpcc:'v2022 normals 1991–2020, unchanged common valid land support',nsidc:'G02202 v2 NASA Team 1981–2010, unchanged common valid marine support, 15% extent threshold'},limitations:['One transient orbital year, not a converged climate.','Three-target improvement does not imply all-region GPCC/NSIDC acceptance.','Global moisture mixing substantially increases Himalayan foreland rain and reduces India/Amazon precipitation.','Coarse cell ice concentration is still diagnosed from physical mass and the unchanged 0.5 m coverage rule.']};
await fs.writeFile(`${folder}/acceptance.json`,JSON.stringify(acceptance,null,2)+'\n');
for(const label of Object.keys(full))await fs.copyFile(`${out}/full-${label}.json`,`${folder}/full-${label}.json`);
const v=verdicts[selected],num=(x,n=1)=>x.toFixed(n);
const screenRow=r=>`| ${r.label} | ${num(r.hemispheres.north.extentMAE,2)} | ${num(r.hemispheres.south.extentMAE,2)} | ${num(stats(r).temperateMeanAbsoluteBiasMm)} | ${num(r.gpcc[7].modelAnnualMm)} | ${num(r.gpcc[8].modelAnnualMm)} | ${num(r.gpcc[5].modelAnnualMm)} |`;
const seasonal=(values,months)=>months.reduce((s,k)=>s+values[k],0),australiaSeason=regions.filter(r=>r.name.startsWith('Australia')).map(r=>({region:r.name,observedDJF:seasonal(r.observedMonthlyMm,[11,0,1]),observedJJA:seasonal(r.observedMonthlyMm,[5,6,7]),modelDJF:seasonal(r.values[selected].monthlyMm,[11,0,1]),modelJJA:seasonal(r.values[selected].monthlyMm,[5,6,7]),mildMonthlyMAE:r.values.mild.monthlyMaeMm,directMonthlyMAE:r.values.direct.monthlyMaeMm,selectedMonthlyMAE:r.values[selected].monthlyMaeMm}));
acceptance.australiaSeason=australiaSeason;await fs.writeFile(`${folder}/acceptance.json`,JSON.stringify(acceptance,null,2)+'\n');
const report=`# 冰封、温带和澳洲的参数对照（2026-10-12）

选定独立实验档 ${selected}：${JSON.stringify(profiles[selected])}。蒸发比例仍为 0.50、海洋输送 0.30 m/s、热容量和全部初始库存不变；正式 Earth 存档及 DEFAULT 设置保持不变。${selected==='mix4'?'相对上轮仅增加水汽混合系数 100 万 → 400 万 m²/s，没有继续增强辐射增暖。':'在增加水汽混合的同时适当回调辐射增暖。'}

## 完整地形验收

${candidate.meshTriangles} 个地形单元，1800 s 固定步长，从同一含里海有限库存的 lake-day0 存档积分 ${num(candidate.records.at(-1).day,6)} 天。初始库存 SHA256：${candidate.initialStockSha}。两个候选和两个参照均已在本轮采用相同的补偿求和算法重新积分；最终结果没有把旧算法的参照混进来。严格恢复与下一步完全一致检查全部通过。

| 指标 | 0.595 温和档 | 0.575 上轮档 | 本轮选定档 |
|---|---:|---:|---:|
| 北半球 NSIDC 月范围 MAE（百万 km²） | ${num(summaries.mild.ice.north.extentMAE,2)} | ${num(summaries.direct.ice.north.extentMAE,2)} | ${num(summaries[selected].ice.north.extentMAE,2)} |
| 南半球 NSIDC 月范围 MAE（百万 km²） | ${num(summaries.mild.ice.south.extentMAE,2)} | ${num(summaries.direct.ice.south.extentMAE,2)} | ${num(summaries[selected].ice.south.extentMAE,2)} |
| 年末实际海冰质量（全球平均水当量 mm） | ${num(frozen.mild.seaIceGlobalMeanMm,2)} | ${num(frozen.direct.seaIceGlobalMeanMm,2)} | ${num(frozen[selected].seaIceGlobalMeanMm,2)} |
| 年末陆地积雪（全球平均水当量 mm） | ${num(frozen.mild.snowGlobalMeanMm,2)} | ${num(frozen.direct.snowGlobalMeanMm,2)} | ${num(frozen[selected].snowGlobalMeanMm,2)} |
| 四温带区域等权年雨量绝对偏差（mm/年） | ${num(summaries.mild.temperateMeanAbsoluteBiasMm)} | ${num(summaries.direct.temperateMeanAbsoluteBiasMm)} | ${num(summaries[selected].temperateMeanAbsoluteBiasMm)} |

相对 0.575 上轮档，南北海冰范围 MAE 分别下降 ${num(v.hemispheres[1].reductionPercent)}%、${num(v.hemispheres[0].reductionPercent)}%，实际海冰质量下降 ${num(v.physicalSeaIceReductionPercent)}%，四区平均降水绝对偏差下降 ${num(v.temperate.reductionPercent)}%。三项约束的完整地形结果：${v.threeTargetsPass?'通过':'未全部通过'}。这不是全球气候全面验收，也不是观测误差已经足够小。

这里的冰封指标专指 NSIDC 海域海冰；新增输送与冷地降水同时增加了陆地积雪，年末从约 1.45 增至约 6.00 mm 全球水当量，所以北美陆地白色面积并不缩小。北半球夏末海冰仍接近零，明显低于观测；不能把减少海冰质量等同于全年冰雪形态正确。

## 所有 GPCC 区域

单位 mm/年；观测支持、区域边界和四个温带区域权重均未改变。

| 区域 | GPCC | 温和档 | 上轮档 | 本轮选定档 |
|---|---:|---:|---:|---:|
${regions.map(r=>`| ${r.name} | ${num(r.observedAnnualMm)} | ${num(r.values.mild.annualMm)} | ${num(r.values.direct.annualMm)} | ${num(r.values[selected].annualMm)} |`).join('\n')}

澳洲逐区防退化：${v.australia.map(r=>`${r.region} ${r.pass?'通过':'失败'}`).join('；')}，参照采用偏湿更小的 0.595 温和档，而非只相对较湿的上轮档比较。年总量改善不能代表澳洲季节反转或山地雨影已验收。

| 澳洲区域 | GPCC DJF / JJA | 本轮 DJF / JJA | 温和档月 MAE | 上轮月 MAE | 本轮月 MAE |
|---|---:|---:|---:|---:|---:|
${australiaSeason.map(r=>`| ${r.region} | ${num(r.observedDJF)} / ${num(r.observedJJA)} | ${num(r.modelDJF)} / ${num(r.modelJJA)} | ${num(r.mildMonthlyMAE)} | ${num(r.directMonthlyMAE)} | ${num(r.selectedMonthlyMAE)} |`).join('\n')}

DJF/JJA 为三个月累计 mm，月 MAE 为 mm/月。季节比较独立公开，不把年总量接近当成季节相位正确。

西南澳季节相位仍错误：模型夏季 DJF 降水远多于冬季 JJA，而同区域 GPCC 冬季更湿。北澳夏季降水接近观测，但冬季仍偏湿。年偏差和月 MAE 下降都不能代替这一季节检查。

北美东部相对上轮融冰档更干，温带平均改善主要来自欧洲、西西伯利亚增雨与东亚湿偏差减少；平均量不能掩盖这一退化。印度和亚马孙供水退化，喜马拉雅前缘明显过湿。机制账本显示喜马拉雅前缘降水几乎全部来自迎风坡雨出，不能把它称为对流或锋面改善。完整积分的机制分量保存在 acceptance.json，均分割实际降水而非附加水源。因此本轮仅保留独立参数试验，不能作为全面改进的正式 Earth 配置。

## 预算和数值检查

选定档 ${candidate.budgetAudit.auditCount} 次每日检查，最大残差：总水 ${candidate.budgetMax.waterMax.toExponential(3)} mm；焓 ${candidate.budgetMax.heatMax.toExponential(3)} J/m²；逐格水汽 ${candidate.budgetMax.vaporMax.toExponential(3)} mm；地形水分区 ${candidate.budgetMax.routingMax.toExponential(3)} m³。每一项低于 protocol.md 的阈值；本轮四个最终完整积分均进行了每日检查。

最初两个 900 s 粗路由试验的水量累加误差达到约 1.24e-6 / 1.70e-6 mm，严格恢复拒绝，记录于 rejected-runs.json。真实沿海回流回归测试复现了同样的 sub-ulp 转移损失，修复只在 compensatedOceanTransfers=true 时启用补偿求和，补偿状态随存档保存。它记录浮点舍入而非补水，所有物理转移仍从有限供体扣除。正式默认不含该开关，旧存档形状与默认数值行为保留。新四臂均启用相同开关，以免把不同累加方式当成参数效果。

900 s 粗路由复核：年均表温差 ${num(timeStepCheck.annualSurfaceMeanDifferenceC,5)} °C、区域年雨量最大相对差 ${num(timeStepCheck.maxRegionalRainDifferencePercent,3)}%。明确未运行完整地形的 900 s 年度积分。新两臂的 strictContinuation 完全一致检查通过。

## 同库存粗路由筛选

此表用于筛选，不能替代完整地形或里海验收。每个粗路由试验初始库存哈希一致；粗路由库存与完整地形库存不可混用。

| 档位 | 北冰范围 MAE | 南冰范围 MAE | 温带四区偏差 | 西南澳雨 | 北澳雨 | 喜马拉雅前缘雨 |
|---|---:|---:|---:|---:|---:|---:|
${screens.filter(r=>r.dt===1800).map(screenRow).join('\n')}

减小蒸发虽能减少部分冷却，却使温带更干；单纯增加海洋输送不能同时改善北冰与澳洲；增加热输送的组合使澳洲更湿。提高全球水汽混合可将实际水汽重新分配到温带并改变凝结放热，但会加重喜马拉雅前缘的锋面与迎风坡降水。600 万档的印度、亚马孙和喜马拉雅副作用更大，所以完整验收优先选用较小的 400 万档。所有系数均属于简化模型敏感性试验，不宣称测量标定。

## 同日期、同视角截图

截图使用相同存档时刻、南北美洲中心、太空视角、12× 起伏、地表图层和关闭云层。保留真实晨昏；画面用于形态比较，降水看年度积分。

![上轮档](before-year1.jpg)

![本轮档](after-year1.jpg)

## 复现

profiles.json 记录全部参数，screen.ts/full.ts 由 esbuild 打包为 Node ESM；PARAM_PROFILE 指定试验，PARAM_DT 可指定 900。full.ts 读取同一 lake-day0.json，额外预算与机制账本不改物理演化。运行 analyze.mjs ${selected} 汇总原始积分结果，preview.mjs ${selected} 生成独立预览，manifest.mjs 记录输入、观测、源代码、快照和浏览器证据哈希。

观测沿用 [GPCC v2022](https://opendata.dwd.de/climate_environment/GPCC/gpcc_normals_v2022/) 和 [NSIDC G02202 v2](https://doi.org/10.7265/N55M63M1) 缓存及原共同有效支持。范围诊断的 15% 阈值、质量/0.5 m 规则、结冰温度和观测区域均不变。一年瞬态结果不代表长期收敛。
`;
await fs.writeFile(`${folder}/report.md`,report);
console.log(JSON.stringify({selected,verdict:verdicts[selected],timeStepCheck,summaries},null,2));
