import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder='docs/evidence/earth-lakes-freeze-temperate-20261011',build='build/earth-lakes-freeze-temperate';
const names=['before','transport','albedo','evap','after'];
const load=async path=>JSON.parse(await readFile(path,'utf8'));
const runs=await Promise.all(names.map(name=>load(`${build}/${name}.json`)));
const reference=await load('docs/evidence/earth-seaice-causal-20261011/nsidc-same-grid.json');
const n=reference.grid.width*reference.grid.height,weights=reference.supportM2;
const sum=a=>a.reduce((s,v)=>s+v,0),sha=b=>createHash('sha256').update(b).digest('hex');
assert(runs.every(r=>r.strictRoundTrip&&r.initialStockSha===runs[0].initialStockSha&&r.inputSha256===runs[0].inputSha256));
assert(runs.every(r=>r.records.at(-1).day>365&&r.records.at(-1).day<366));
assert(runs.every(r=>Math.abs(sum(r.calendarCoverageS)-sum(runs[0].calendarCoverageS))<1e-6));
assert(runs.every(r=>r.monthlyMeanMarineIceCover.length===12&&r.monthlyMeanMarineIceCover.every(c=>c.length===n)));
const seasons=m=>({JJA:sum([m[5],m[6],m[7]]),DJF:sum([m[11],m[0],m[1]])});
const extrema=a=>({min:Math.min(...a),max:Math.max(...a),minMonth:a.indexOf(Math.min(...a))+1,maxMonth:a.indexOf(Math.max(...a))+1});
const hemi=h=>Array.from({length:n},(_,k)=>k).filter(k=>h==='north'?k<n/2:k>=n/2);
const polar=(c,h)=>{const ks=hemi(h);return {extentMillionKm2:sum(ks.map(k=>c[k]>=.15?weights[k]/1e12:0)),areaMillionKm2:sum(ks.map(k=>c[k]*weights[k]/1e12))};};
const obs=reference.concentration.map(c=>Object.fromEntries(['north','south'].map(h=>[h,polar(c,h)])));
const gpcc=runs[0].records.at(-1).regions.map((r,i)=>({name:r.name,bounds:r.bounds,observedAnnualMm:r.observedAnnualMm,observedSeasons:seasons(r.observedMonthlyMm),runs:Object.fromEntries(runs.map(a=>{const v=a.records.at(-1).regions[i];return [a.arm,{annualMm:v.modelAnnualMm,biasPercent:100*(v.modelAnnualMm/r.observedAnnualMm-1),monthlyMm:v.monthlyMm,seasons:seasons(v.monthlyMm)}];}))}));
const seaIce=runs.map(r=>({arm:r.arm,hemispheres:Object.fromEntries(['north','south'].map(h=>{
 const ks=hemi(h),monthly=r.monthlyMeanMarineIceCover.map((c,j)=>({month:j+1,...polar(c,h),observed:obs[j][h],concentrationMAE:sum(ks.map(k=>weights[k]*Math.abs(c[k]-reference.concentration[j][k])))/sum(ks.map(k=>weights[k]))}));
 return [h,{monthly,extent:extrema(monthly.map(v=>v.extentMillionKm2)),extentMonthlyMAEMillionKm2:sum(monthly.map(v=>Math.abs(v.extentMillionKm2-v.observed.extentMillionKm2)))/12,meanConcentrationMAE:sum(monthly.map(v=>v.concentrationMAE))/12}];
}))}));
const budgetMax=Object.fromEntries(['waterResidualMm','enthalpyResidualJm2','maxCellVaporResidualMm','routingResidualM3'].map(key=>[key,Math.max(...runs.flatMap(r=>r.records.map(v=>Math.abs(v.budget[key]))))]));
const lake=await load(`${build}/lake.json`);
const acceptance={formalSha256:runs[0].inputSha256,initialStockSha256:runs[0].initialStockSha,sameInitialStocks:true,strictContinuation:true,integrationDays:runs[0].records.at(-1).day,calendarCoverageS:runs[0].calendarCoverageS,
 method:'Five real full-orbit Earth integrations, 1800 s steps, identical initial air/land/sea temperatures and all finite physical water stocks, complete mesh routing. Formal legacy control versus existing shared moisture/conductive/under-ice experiment; a two-by-two factorial at that experiment for surface albedo and cold open seawater evaporation. March 20 epoch mapped to Gregorian monthly intervals, exactly one physical orbital year of observed fields. Initial data are never regenerated or sought to another season.',
 observations:{gpcc:runs[0].observations,nsidc:{product:reference.product,doi:reference.doi,variable:reference.variable,yearsPerMonth:reference.yearsPerMonth,commonMillionKm2:reference.commonMillionKm2,inputPath:'docs/evidence/earth-seaice-causal-20261011/nsidc-same-grid.json'}},
 status:{lake:'Finite historical initial inventory and shared hydraulic/render storage closure passed. Coarse bed and shoreline are not current observed lake geometry.',physicalBudgets:'Passed',temperateRain:'Mixed: shared moisture improves eastern North America and East Asia substantially, but dries Europe and West Siberia relative to the legacy control. GPCC regional realism remains failed. The new cold seawater closure adds modest rainfall and can worsen sea ice.',seaIce:'Failed: extent and seasonal coverage remain too large. No ice-area threshold or finite stock was tuned to hide this.'},
 limitations:['One transient year from the authored stocks, not a converged climate.','Model sea-ice concentration is still mass-derived using the existing 0.5 m cover rule; concentration and thickness are not independent states.','NSIDC common valid marine support excludes holes, lakes and shelves; common-grid extent is not the native complete hemispheric index.','Effective column emissivity and albedo are not a full atmosphere/cloud radiation closure. The new flags cannot repair that omission.','Lake initial water is a redistribution from the finite ocean donor; lake and climate ablations are separate. No complete freshwater lake heat/ice model yet.','Annual real-world comparisons use the classic surface grid; refined coast physics was separately covered by regression and energy checks.','GPCC comparisons share valid land support and measure actual land precipitation; they do not validate narrow mountain rain shadows or storm tracks.'],
 budgetMax,lake,seaIce,gpcc,monthlyObservedSeaIce:obs};
await writeFile(`${folder}/acceptance.json`,JSON.stringify(acceptance,null,2)+'\n');
for(const name of names)await copyFile(`${build}/${name}.json`,`${folder}/${name}.json`);
await copyFile(`${build}/lake.json`,`${folder}/lake.json`);
const table=gpcc.map(r=>`| ${r.name} | ${r.observedAnnualMm.toFixed(1)} | ${r.runs.before.annualMm.toFixed(1)} | ${r.runs.transport.annualMm.toFixed(1)} | ${r.runs.albedo.annualMm.toFixed(1)} | ${r.runs.evap.annualMm.toFixed(1)} | ${r.runs.after.annualMm.toFixed(1)} |`).join('\n');
const iceTable=seaIce.map(r=>`| ${r.arm} | ${r.hemispheres.north.extentMonthlyMAEMillionKm2.toFixed(2)} | ${r.hemispheres.south.extentMonthlyMAEMillionKm2.toFixed(2)} |`).join('\n');
const report=`# 湖泊、冰封带与温带干旱：修复与验收（2026-10-11）

里海的空湖盆和湖岸/水力水位不一致已修复。冰封带和温带降水仍未通过观测验收；本轮没有把它们写成已解决。正式默认、地球源文件及其初始库存未改，新闭合项可分别启用。

## 已修的机制

1. 里海原有 166 个内陆湖地形单元，但水库体积为零。新增显式历史水位初始化，按同一三角形地形储水积分计算体积，从有限海洋库存扣除。候选初始水位为 -28 m，体积 ${(lake.seeded.volumeM3/1e9).toFixed(1)} km³。该水位来自 2017 年历史值，并非 2026 年岸线。物理路由与可见湖岸共用储水关系，避免同一水面因不同湖底倾斜产生假水流。
2. 混合海岸的陆地积雪原本会提高邻接海水的反照率。实验项 separateSurfaceAlbedo 让陆地和海水分别吸收阳光，粗网格与细化表面均实现，并保留实际辐射预算。
3. 海水低于 0 °C 时原有淡水温度闸门把蒸发压为零。实验项 liquidOceanEvaporation 允许未结冰的低温海水蒸发，仍扣除有限水和汽化潜热。湖泊保持淡水温度约束。
4. 开关可在当前状态迁移，保持水、温度、时间和预算起点，完整保存后可逐步精确续算。

## 对照口径

所有气候臂从相同库存出发，SHA256 ${runs[0].initialStockSha}。真实推进 ${runs[0].records.at(-1).day.toFixed(6)} 天，月统计恰好覆盖一个物理轨道年；全程 1800 s 步长、完整地形路由，未重新生成气候、未跳转季节。

- before：正式旧水汽运行方式。
- transport：已有共享水汽、独立气/陆/海温度、导热海冰和冰下输送对照。
- albedo / evap / after：在 transport 上分别打开陆海反照率、低温海水蒸发、两项同时打开。

湖泊水位初始化另做 0、2、24 天真实积分，因此湖泊前后局部库存不同，但全球总水不变；没有把湖泊初始水分配混进相同库存气候对照。

## GPCC 区域结果

单位 mm/年。相同 GPCC 有效陆地面积支持，记录真实落到陆地的降水。观测为 GPCC v2022 1991–2020 normals。

| 区域 | GPCC | before | transport | albedo | evap | after |
|---|---:|---:|---:|---:|---:|---:|
${table}

已有共享水汽显著改善了北美东部和东亚的旧运行时断雨，但欧洲与西西伯利亚比正式旧运行方式更干，仍明显低于观测。新海水蒸发只带来有限增量，澳洲西南并非各臂都改善，不能据此宣称温带问题已解决。

## NSIDC 同网格海冰结果

同一缓存 G02202 v2 月浓度气候态、同一有效海域面积权重、同一 15% 阈值。以下为月范围平均绝对误差，单位百万 km²。

| 臂 | 北半球 MAE | 南半球 MAE |
|---|---:|---:|
${iceTable}

开放海水蒸发增加了潜热损失，供水改善同时让部分海冰扩大。海冰质量仍用原有 0.5 m 标度诊断覆盖率，缺少独立浓度与厚度演化；辐射仍是有效整柱闭合。它们是下一步结构性修复对象，不能靠改显示颜色或覆盖阈值掩盖。

## 预算与可恢复性

气候臂检查点最大总水残差 ${budgetMax.waterResidualMm.toExponential(3)} mm，焓残差 ${budgetMax.enthalpyResidualJm2.toExponential(3)} J/m²，每单元水汽残差 ${budgetMax.maxCellVaporResidualMm.toExponential(3)} mm。五臂都通过严格保存恢复及下一步逐字段一致性。

湖泊 24 天总水残差 ${Math.abs(lake.records.at(-1).budget.water).toExponential(3)} mm，焓残差 ${Math.abs(lake.records.at(-1).budget.enthalpy).toExponential(3)} J/m²；水位随真实收支变化，不自动补水。湿三角形面积并不等同于精确岸线面积。

257 项 Node 回归、类型检查和构建通过；浏览器控制器与 WebGL 验证记录见 browser-checks.json。截图为真实 WebGL、同一天/相机/显示设置；湖泊截图仅证明初始水面恢复，不证明气候已收敛。

![湖泊修复前](lake-before-day0.png)

![湖泊修复后](lake-after-day0.png)

## 复现与边界

用 esbuild 把本目录 integrate.ts 打包为 Node ESM，依次设置 EARTH_ARM=before/transport/albedo/evap/after 后运行；lake.ts 独立产生 lake-day0/2/24.json。运行 analyze.mjs 复算同网格验收，preview.mjs 从正式页面生成忽略目录下的独立预览。

正式输入 SHA256：${runs[0].inputSha256}。全部预算、月字段、观测绑定及边界说明保存在 acceptance.json 和 manifest.json。本轮结果是守恒的机制修复与可检查的实验，仍缺少独立海冰面积、完整湖泊热力和更完整的辐射/风暴降水过程。

来源：[历史里海水位研究](https://doi.org/10.1051/e3sconf/202128801064)、[GPCC normals v2022](https://opendata.dwd.de/climate_environment/GPCC/gpcc_normals_v2022/)、[NSIDC G02202 v2](https://doi.org/${reference.doi})。NSIDC 复用前轮已经缓存并同网格化的历史 NASA Team 月浓度字段，与合并后的官方 CDR 并非同一变量；版本、无效区和面积支持详见 acceptance.json。历史水位并非当前观测，粗网格岸线仍需改进。
`;
await writeFile(`${folder}/report.md`,report);
const paths=['lake-storage.ts','terrain-water.ts','terrain-water-view.ts','thermal.ts','environment.ts','water.ts','refinement-surface.ts','thermal-runtime.ts','runtime-state.ts','environment-panel.ts','water-panel.ts','tests/terrain-water.test.ts','tests/environment.test.ts','tests/refinement.test.ts','tests/simulation.test.ts','tests/live-planet.ts','scenes/earth-land-sea/lake-initial-levels.json','scenes/earth-land-sea/earth-simulation.json','docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json','docs/evidence/earth-seaice-causal-20261011/nsidc-same-grid.json',...['integrate.ts','lake.ts','preview.mjs','analyze.mjs','acceptance.json','report.md','lake.json','browser-checks.json','lake-before-day0.png','lake-after-day0.png',...names.map(n=>n+'.json')].map(n=>`${folder}/${n}`)];
const bindings=await Promise.all(paths.map(async path=>({path,sha256:sha(await readFile(path))})));
await writeFile(`${folder}/manifest.json`,JSON.stringify({generatedAtUtc:new Date().toISOString(),bindings,runs:runs.map(r=>({arm:r.arm,bundleSha256:r.bundleSha256,initialStockSha256:r.initialStockSha,strictRoundTrip:r.strictRoundTrip})),excluded:'Interrupted pre-optimization runs and the old clock-export failure are excluded. Accepted arms completed the full physical year and strict next-step continuation.',formalDefaultsUnchanged:true},null,2)+'\n');
console.log(JSON.stringify({budgetMax,gpcc:gpcc.map(r=>({name:r.name,gpcc:r.observedAnnualMm,before:r.runs.before.annualMm,transport:r.runs.transport.annualMm,after:r.runs.after.annualMm})),seaIce:seaIce.map(r=>({arm:r.arm,northMAE:r.hemispheres.north.extentMonthlyMAEMillionKm2,southMAE:r.hemispheres.south.extentMonthlyMAEMillionKm2}))},null,2));
