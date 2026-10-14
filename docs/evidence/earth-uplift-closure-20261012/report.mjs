import fs from 'node:fs/promises';
const folder='docs/evidence/earth-uplift-closure-20261012';
const c=JSON.parse(await fs.readFile(`${folder}/comparison.json`,'utf8')),causes=JSON.parse(await fs.readFile(`${folder}/full-causes.json`,'utf8'));
const [before,cold,split]=c.full,fmt=(x,d=2)=>x.toFixed(d),row=(j,name)=>j.gpcc.find(r=>r.name===name),ice=(j,h)=>j.ice[h].extentMAE;
const areaRows=before.gpcc.map((r,k)=>`| ${r.name} | ${fmt(r.observedAnnualMm)} | ${fmt(r.modelAnnualMm)} | ${fmt(cold.gpcc[k].modelAnnualMm)} | ${fmt(split.gpcc[k].modelAnnualMm)} |`).join('\n');
const seasons=['Australia southwest','Australia north','India','Himalaya foreland','Tibet'].map(name=>{const a=row(before,name),b=row(cold,name),d=row(split,name);return `| ${name} | ${fmt(a.observedDJFMm)} / ${fmt(a.observedJJAMm)} | ${fmt(a.DJFMm)} / ${fmt(a.JJAMm)} | ${fmt(b.DJFMm)} / ${fmt(b.JJAMm)} | ${fmt(d.DJFMm)} / ${fmt(d.JJAMm)} |`;}).join('\n');
const budgets=c.full.map(j=>`| ${j.label} | ${j.budget.waterMax.toExponential(3)} | ${j.budget.heatMax.toExponential(3)} | ${j.budget.vaporMax.toExponential(3)} | ${fmt(j.budget.routingMax,3)} | ${j.snowResidualMax.toExponential(3)} |`).join('\n');
const sw=causes.find(j=>j.label==='control').rows.find(r=>r.name==='Australia southwest');
const snowRows=['initial','snowfall','melt','compaction','final'].map(k=>`| ${k} | ${fmt(before.snowLedger[k],4)} | ${fmt(cold.snowLedger[k],4)} | ${fmt(split.snowLedger[k],4)} |`).join('\n');
const screening=c.screening.filter(j=>!j.label.endsWith('900')).map(j=>`| ${j.label} | ${fmt(j.snowLedger.final,3)} | ${fmt(j.temperateAnnualMAEMm,1)} | ${fmt(row(j,'Himalaya foreland').modelAnnualMm,1)} | ${fmt(row(j,'Australia southwest').modelAnnualMm,1)} |`).join('\n');
const text=`# 水汽输送与抬升闭合：本轮结果

**补齐冷锋驻留暖气团抬升，并提供扩散/机械抬升分离对照；完整年度预算与恢复检查通过，GPCC 区域整体验收仍未通过。正式默认未变。** 本轮适合保留的最小修复是 coldFront；分离地形抬升的 eddyCold 只作为因果诊断，未替换上轮预览或进入正式默认。

## 查明的原因

**喜马拉雅过湿由扩散雨出主导。** 控制组前缘年雨 ${fmt(row(before,'Himalaya foreland').modelAnnualMm)} mm，其中 ${fmt(row(before,'Himalaya foreland').annualMechanismsMm.orographic)} mm 来自扩散路径的地形雨，真实平流地形雨为 0；剩余仅约 3.71 mm 锋面雨。无风、等温、未饱和的均匀水汽在旧闭合中也会在山坡产生雨，已用先失败后通过的回归测试验证。混合系数同时调水平供水和机械雨出，没有独立的垂直涡旋运动约束。分离后前缘降至 ${fmt(row(split,'Himalaya foreland').modelAnnualMm)} mm，而 GPCC 为 ${fmt(row(before,'Himalaya foreland').observedAnnualMm)} mm，转为过干；西藏也明显过干。它证明了来源问题，同时暴露真实迎坡供水不足，不能把去掉过量雨当作雨影整体正确。

**陆地积雪扩大主要是冷区降雪输入增加，未发现雪量重复入账或融雪质量丢失。** 同初值的粗路由 mix1/control 对照，全球年降雪从 2.552 增至 10.791 mm 水当量，融雪也从 11.378 增至 15.017 mm，但增加幅度不足以抵消降雪；年末雪从 1.391 增至 5.967 mm。加拿大 50–65°N 雪带按陆地面积的降雪 18.49→112.49 mm，融雪 150.74→178.39 mm，年末 8.25→74.50 mm；西伯利亚同纬带降雪 5.91→68.77 mm，年末 1.71→40.62 mm。这些是机制筛查，不冒充完整地形或观测雪覆盖验收。完整地形分离抬升后，更多水汽进入冷的温带锋面，加拿大/西伯利亚年末雪反而增加；全球年末雪未改善。没有调整 30 mm 雪覆盖、反照率、融化温度或强制融雪。

**西南澳冬季有西风，但模型仍给出较干、发散的低层空气，而且漏了冷锋对暖湿驻留空气的抬升。** 控制组 JJA 东向风 ${fmt(sw.seasons.JJA.windEastMps)} m/s，真实平均 RH ${fmt(sw.seasons.JJA.relativeHumidity*100,1)}%，辐合率 ${fmt(sw.seasons.JJA.convergenceDay,3)} /day（负值为发散）；DJF 地面比气柱暖约 ${fmt(sw.seasons.DJF.landK-sw.seasons.DJF.airK)} K，对流贡献占全年约 87%。这使夏季对流主导、冬季抬升受抑。补齐冷锋将冬雨 ${fmt(row(before,'Australia southwest').JJAMm)}→${fmt(row(cold,'Australia southwest').JJAMm)} mm、夏雨 ${fmt(row(before,'Australia southwest').DJFMm)}→${fmt(row(cold,'Australia southwest').DJFMm)} mm，方向略改善但远未达到 GPCC 的冬雨 ${fmt(row(before,'Australia southwest').observedJJAMm)} mm。冬季风向正确并不等于水汽净输入和锋面降雨正确。

冷空气推进时排开暖湿空气的过程参考 [Met Office 锋面说明](https://weather.metoffice.gov.uk/learn-about/weather/atmosphere/weather-fronts)；西南澳冬雨还依赖高压脊移动与冷锋到达，见 [澳洲气象局](https://www.bom.gov.au/resources/learn-and-explore/climate-knowledge-centre/climate-factors/subtropical-ridge)。现模型没有垂直温湿廓线、CAPE/CIN、预报气压/干空气质量或锋面位置，因此单凭地面热和静态平均风仍不足以闭合冬雨。这里是模型机制诊断，不是由观测反推风速。

## 完整地形 GPCC 对照

单位 mm/真实轨道年。coldFront 仅补冷锋；eddyCold 在其基础上禁止湿度扩散直接制造地形雨，并保留有限涡旋锋面交换。温带四区等权绝对年偏差 ${fmt(before.temperateAnnualMAEMm)}→${fmt(cold.temperateAnnualMAEMm)}→${fmt(split.temperateAnnualMAEMm)} mm；分离闭合虽改善温带平均偏差，却使东亚过湿、西藏过干，不能作为全区通过。

| 区域 | GPCC | 控制组 | 仅补冷锋 | 分离抬升 + 冷锋 |
|---|---:|---:|---:|---:|
${areaRows}

## 季节排序

DJF / JJA 三个月累计 mm，采用同日历与有效陆地支持。

| 区域 | GPCC DJF / JJA | 控制组 | 仅补冷锋 | 分离抬升 + 冷锋 |
|---|---:|---:|---:|---:|
${seasons}

西南澳三个完整地形方案都仍为夏雨多、冬雨少，**季节验收失败**。印度分离方案年雨改善，但 JJA 仍向西、略向南，全年净水汽输送仍为输出；实际气柱水汽账不是按陆地面积的 GPCC 雨量，原数值与单位在 full-causes.json 中分别保留。不能把印度年雨改善称为海到陆供水闭合。

## 陆地积雪与 NSIDC 海冰分开核算

下表为实际末步库存账的全球平均水当量 mm；共同初始雪高于各组末值，“扩大”指相对小混合档增大，不能写成相对共同日零总库存持续增长。雪的空间覆盖也不能只用全球质量判断。

| 雪账项 | 控制组 | 仅补冷锋 | 分离抬升 + 冷锋 |
|---|---:|---:|---:|
${snowRows}

NSIDC 同网格海域全年逐月范围 MAE（百万 km²），北 ${fmt(ice(before,'north'),4)}→${fmt(ice(cold,'north'),4)}→${fmt(ice(split,'north'),4)}，南 ${fmt(ice(before,'south'),4)}→${fmt(ice(cold,'south'),4)}→${fmt(ice(split,'south'),4)}。冷锋路径对海冰基本没有影响；分离方案北略退化、南略改善，都不证明海冰季节覆盖接受。北半球夏末海冰不足、南半球冬季范围过大仍在。NSIDC 是海冰产品，不能据此宣称陆地积雪已观测验收。

## 预算、库存和时间步验证

三组完整地形共同库存哈希：

<code>${before.initialStockSha}</code>

输入 lake-day0 SHA256：

<code>${before.inputSha256}</code>

每组 ${before.auditCount} 次日预算检查；完整地形同一物理年、同初始有限湖泊水与显热/焓，存档恢复下一真实步完全一致。预算最大绝对残差如下。

| 组 | 全水 mm | 焓 J/m² | 单格水汽 mm | 路由分配 m³ | 雪账 mm |
|---|---:|---:|---:|---:|---:|
${budgets}

半步长为共同粗路由初值的真实全年对照；coldFront 年雨最大差 ${fmt(c.stepComparison[0].annualMaxDifferenceMm,3)} mm，eddyCold ${fmt(c.stepComparison[1].annualMaxDifferenceMm,3)} mm，月最大差分别 ${fmt(c.stepComparison[0].monthlyMaxDifferenceMm,3)} / ${fmt(c.stepComparison[1].monthlyMaxDifferenceMm,3)} mm。两步长的西南澳季节判定一致；没有宣称完整地形已跑 900 s，也没有把小时间步差异替代 GPCC 接受。

## 否决与保留的候选

consistent 将混合陆海高度修正统一为面积加权四次方辐射律，结果几乎不变，不是主因。buoyant 去掉绝对 290 K 对流门槛后，夏季西南澳更湿，冬雨仍缺，否决其作为改善档。advective 连涡旋锋面交换也去除，西南澳显著更湿、积雪更多，同样否决。所有完成的筛查都保存原始数值与预算，没有只挑正向指标。

| 粗路由试验 | 年末雪 mm（全球） | 温带年偏差 mm | 喜马拉雅 mm/年 | 西南澳 mm/年 |
|---|---:|---:|---:|---:|
${screening}

## 截图与复现

独立页面保留修复前、仅补冷锋、分离抬升和共同日零入口。真实 WebGL 年末截图使用相同时间、视角、地表图层、12× 起伏和关闭云层；形态不代替全年降水累计。文件列表与浏览器条件见 manifest.json / browser-verification.json。

![修复前：亚洲与澳洲](before-asia-year1.jpg)

![仅补冷锋：亚洲与澳洲](cold-front-asia-year1.jpg)

![分离抬升对照：亚洲与澳洲](closure-asia-year1.jpg)

![修复前：南北美洲](before-americas-year1.jpg)

![仅补冷锋：南北美洲](cold-front-americas-year1.jpg)

![分离抬升对照：南北美洲](closure-americas-year1.jpg)

运行 setup.mjs 构建，再按 profiles.json 选择 PARAM_PROFILE 运行 screen/full。analyze.mjs 汇总；CAUSE_STAGE=full 运行 causes.mjs 提取因果诊断；preview.mjs 生成独立页面；manifest.mjs 记录哈希。完整协议见 [protocol.md](protocol.md)。GPCC 和 NSIDC 缓存、支持、阈值与原区域均保持原样；这是一年瞬态对照，不是长期气候平衡。

正式 Earth 场景 SHA256 仍为 <code>${before.formalSha256}</code>。269 个 Node 测试、TypeScript 检查、WebGL 构建和 diff 空白检查通过。下一处需要修的是低层水汽输入、发散抑制与垂直稳定度共同决定的抬升；把地图再细化或继续增大全球混合，不能直接补齐这些缺失过程。
`;
await fs.writeFile(`${folder}/report.md`,text);
console.log(JSON.stringify({report:`${folder}/report.md`,regionalClimateAccepted:false}));
