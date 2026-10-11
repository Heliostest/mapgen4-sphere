import {readFile,writeFile} from 'node:fs/promises';
const folder='docs/evidence/earth-seaice-causal-20261011';
const a=JSON.parse(await readFile(`${folder}/acceptance.json`,'utf8'));
const f=JSON.parse(await readFile(`${folder}/factorial-analysis.json`,'utf8'));
const x=JSON.parse(await readFile(`${folder}/nsidc-index-crosscheck.json`,'utf8'));
const num=(v,d=2)=>v.toFixed(d),names=['双关','仅冰厚导热','仅冰下输送','双开，短波修复前','双开，短波修复后 1800s','双开，短波修复后 900s'];
const range=e=>`${num(e.min)}–${num(e.max)}`;
const daily=Object.values(f).slice(0,4).map((r,i)=>`| ${names[i]} | ${r.conductiveSeaIce?1:0} | ${r.underIceOcean?1:0} | ${num(r.iceGlobalMm)} | ${num(r.southDaily[0])}–${num(r.southDaily[1])} |`).join('\n');
const same=a.runs.map((r,i)=>`| ${names[i]} | ${range(r.hemispheres.north.extent)} | ${range(r.hemispheres.south.extent)} | ${range(r.hemispheres.south.area)} |`).join('\n');
const winter=a.southMidWinter.slice(0,5).map((r,i)=>`| ${names[i]} | ${num(r.fields.cover,3)} | ${num(r.fields.airK)} | ${num(r.fields.oceanK)} | ${num(r.fields.conductionUpWm2)} | ${num(r.fields.oceanAdvectionWm2,4)} |`).join('\n');
const gpcc=a.gpcc.map(r=>`| ${r.name} | ${num(r.oldBoth1800Mm,1)} | ${num(r.after1800Mm,1)} | ${num(r.after900Mm,1)} | ${num(r.observedAnnualMm,1)} | ${num(r.bias900Percent,1)}% |`).join('\n');
const quad=a.observation.quadratureConvergence.at(-1),qmax=h=>Math.max(...quad.hemispheres[h].extentDifferenceMillionKm2);
const south=a.gpcc.find(r=>r.name==='Australia southwest');
const body=`# 海冰导热 / 冰下输送的因果对照与同网格验收

**已拆分实验开关、排除输送掩膜混杂，并修正部分冰区的短波分配。南半球冬季扩大的增量主要随导热闭合出现，单独打开冰下输送未产生同等扩展。预算与代码验证通过，NSIDC 同网格季节覆盖仍失败；正式默认保持不变。** 本轮定位增量的来源，没有把整个海冰气候宣布修复。

## 可复核的代码修复

新增默认关闭的独立 \`underIceOcean\` 开关；导热与冰下输送可组成四组对照。保存 / 解码 / 严格恢复保留显式 true/false，旧存档只开启 \`conductiveSeaIce\` 时仍沿用旧的双开行为。面板及中文侧栏同步。

输送开关原先同时排除了内湖，混入了第二种干预。现在两组保留相同基础 wet 支撑，开关只移除冻结掩膜；无冰情况下的热通量、流速、下一步温度逐值相同。既有海流仍是闭合回路模型，这次没有声称修复了其内湖支持或海洋动量闭合。观测支撑独立排除确认内湖。

部分冰区原先把混合反照率得到的平均吸收短波同时用于开水与冰面，使开水接受的短波偏小。现按各自吸收率分配原有全柱总短波，经典 / refined 导热路径共用；总入射热没有增减。50% 冰、开水/冰反照率 0.30/0.65、300 W/m² 入射时，开水/冰的全柱吸收量为 105/52.5 W/m²，总计仍为 157.5 W/m²。旧方法为 78.75/78.75。独立单柱 100 W/m² 探针识别旧方法多出的约 6.13 W/m² 海洋冷却。相同反照率时旧、新解相同。

## 四组同初始库存的真实积分

完整 Earth 215,348 地形三角形、48×24 母格，严格恢复正式第零日物理库存后真实推进 365 实际日；未用 seek、气候重新生成或年度末态拼接。四组均保留此前实验 transport 与 airRadiationFraction=0.5，只改变两个海冰开关；它们不是正式 legacy 默认。短波修复前后均使用双开和同一 wet 掩膜，另有修复后 900s 的365日积分。

物理轨道年长 ${num(a.physicalYearDays,6)} 日，365日暂态积分少 ${num(a.missingOrbitalYearDays,6)} 日，缺口位于归一化3月。1–12月实际覆盖时长（日）为 ${a.runs[4].monthlyCoverageS.map(v=>num(v/86400,6)).join('、')}；各组秒数保留在验收JSON，没有补造缺口。月浓度均值除以各自实际覆盖时长，区域累计降水仍是实际365日量。

初始库存 SHA：\`${a.initialStocksSha256}\`。六组均相同，全部365日末态恢复后再推进一步，完整快照逐字段精确一致。正式 JSON SHA：\`${a.formalSha256}\`，仍为原正式文件；classic、legacy、默认环境配置保持原值，新开关未写入正式文件。

下表的每日范围是全 Earth 海洋支撑上的质量覆盖代理，包含第零日；排除陆地、确认内湖和固定导入冰架。它仅用于同模型因果比较，**不能与 NSIDC native extent 直接比较**。

| 组别，1800s | 导热 | 冰下输送 | 第365天全球海冰水当量 mm | 南半球每日范围代理最小–最大，百万 km² |
| --- | ---: | ---: | ---: | ---: |
${daily}

导热开关使全域南冬最大范围增加约 20.42 百万 km²；只有输送时变化约 −0.13 百万 km²。第365天库存却从约 996.93 mm 降到 268.04 mm（共用第零日库存为 ${num(a.runs[0].iceInitialGlobalMm)} mm），说明“库存减少”和“覆盖合理”并不等价。短波修复后库存为 ${num(a.runs[4].iceDay365GlobalMm)} mm，范围的冬季异常仍存在。

八月 40–55°S 带，按模型海洋支撑加权的真实月均字段如下。导热 / 海流通量均为全柱 W/m²；海流列是带平均**有符号净热收支**，不代表局部或 gross 输送强度。

| 组别 | 覆盖代理 | 空气 K | 海洋 K | 向上导热 W/m² | 海流净加热 W/m² |
| --- | ---: | ---: | ---: | ---: | ---: |
${winter}

导热组空气比双关低约 9.6 K，海洋保持冻结边界，部分冰区的净冻结被现有质量→覆盖关系放大。输送不足以抵消该带的净损失；短波修复使覆盖略降，但冬季缺乏日照时它不会消除主反馈。**对照确定了启用导热的增量影响；尚未把空气强迫、初始偏差和覆盖闭合逐项干预隔离，不能据此断言导热公式本身错误，或把全部偏差归于一个系数。**

现有表示仅有质量 M：部分覆盖时 A=M/(917×0.5m)，再用于 h=M/(917×A)，于是 h 固定为 0.5m。冰底结冰无法在固定浓度下增厚，而会自动扩展面积。冻融通量与导热的焓账相符，没有发现重复扣热；但覆盖需要独立状态，并区分冰底增厚与开水结冰。共用的辐射强迫、海雪、下行长波、漂移及冰应力也仍是模型限制。把 0.5m 或 15% 阈值调到观测值不能修复这条结构关系。

![南冬反馈剖面](south-winter-cause.png)

## NSIDC 同网格、同海洋支撑验收

G02135 主站 / 官方镜像连接重置，NCEI 原站 NetCDF 超时；转用 [NOAA 官方开放数据镜像](https://registry.opendata.aws/noaa-cdr-oceanic/) 的 ncei_data 档案。实际读取的是 **[NOAA/NSIDC G02202 v2](https://nsidc.org/data/g02202/versions/2)** 的 \`goddard_nt_seaice_conc_monthly\`，不是 merged CDR，也不是 G02135。两半球 1981–2010 共720月文件下载完整，各月均30个有效年；URL、字节数和 SHA 保存在 [输入清单](nsidc-inputs.json)。此版本是固定历史档案，不能把它称为当前最新版。

Meier, W. N., Fetterer, F., Savoie, M., Mallory, S., Duerr, R. & Stroeve, J. (2013), NOAA/NSIDC Climate Data Record of Passive Microwave Sea Ice Concentration, Version 2. DOI: [10.7265/N55M63M1](https://doi.org/10.7265/N55M63M1). Subset: NASA Team monthly concentration, both hemispheres, 1981–2010; accessed 2026-10-11. See also Peng et al. (2013), [10.5194/essd-5-311-2013](https://doi.org/10.5194/essd-5-311-2013).

逐像素核对已缓存136份 G02135 北半球1–6月数据，坐标 / 像素中心一致，浓度 MAE 为 ${num(x.rawMeanAbsoluteDifferenceFraction*100,3)} 个百分点，**并非完全相同**。此检查不包含南极或完整四季，不能据它推断所有产品等价。两产品未混用于验收，详见 [交叉检查](nsidc-index-crosscheck.json)。

按 NetCDF 坐标重建25km栅格，使用 Hughes 1980 EPSG:3411/3412；保留0–100%有效值，排除极点洞、陆地、海岸及缺测代码。对所有年份和月份使用固定有效像素交集，不填补极点洞。地形 marine 三角形排除确认内湖 / 固定冰架，按母格实际 marine 面积归一化，球面三角形1/4/16分割重心求积。母格少量海面但无 marine 三角形的北半球 ${num(a.observation.unrepresentedMarineMillionKm2.north,6)} 百万 km² 明确排除，南半球为0。面积单位、每格权重闭合、有效覆盖和浓度界限均断言检查。

最终共同有效面积北/南为 ${num(a.observation.commonMillionKm2.north)}/${num(a.observation.commonMillionKm2.south)} 百万 km²。模型真实浓度代理先形成月时间均值，观测先形成固定年代月均浓度，再分别在完全相同权重的母格上施加15%阈值；area 则积分浓度。**粗格范围会受聚合影响，下表不是 native NSIDC extent CSV，25.07不能替代卫星原分辨率的南冬范围。** NSIDC 栅格边界还裁掉了部分过低纬模型冰区，因此同时保留上面的全域模型诊断。

4→16求积的支撑 L1 差为 ${num(quad.supportDifferenceMillionKm2,3)} 百万 km²，北/南逐月 extent 最大差 ${num(qmax('north'),3)}/${num(qmax('south'),3)} 百万 km²；逐半球每月面积 / 范围差保留在原始JSON。这是当前求积误差检查，不是精确矢量裁剪或无限分辨率收敛证明。

| 同网格月量 | 北半球 extent 最小–最大 | 南半球 extent 最小–最大 | 南半球 area 最小–最大 |
| --- | ---: | ---: | ---: |
| NSIDC 固定年代 | ${range(a.observation.extent.north)} | ${range(a.observation.extent.south)} | ${range(a.observation.area.south)} |
${same}

单位百万 km²。候选南冬 extent ${num(a.runs[4].hemispheres.south.extent.max)} 对观测 ${num(a.observation.extent.south.max)}，夏季最低 ${num(a.runs[4].hemispheres.south.extent.min)} 对 ${num(a.observation.extent.south.min)}，**同网格验收仍失败**。冰架 / 陆地掩膜或聚合差异不能解释同支撑内的巨大剩余差。候选北方夏季最小值下降，但冬季也明显过宽。南冬候选达到平台，多个相邻月份并列峰值，不能把自动选出的首个峰月当唯一季相。

初始南方同支撑范围已很大；所有组共用该库存，本轮未通过改初态制造改善。这是从相同库存起跑的一年暂态，不是稳定气候；不能由此宣称连续重复年库存漂移已解决。

![同网格季节验收](same-grid-seasonality.png)

## 预算、时间减步和区域回归

六组全部存档的独立预算最大绝对残差：水量 **${a.budgetMax.waterResidualMm.toExponential(3)} mm**，焓 **${a.budgetMax.enthalpyResidualJm2.toExponential(3)} J/m²**，单格水汽 **${a.budgetMax.maxCellVaporResidualMm.toExponential(3)} mm**；冰表平衡残差最大 ${a.maxSkinBalanceResidualWm2.toExponential(3)} W/m²。采用真实显热、蒸发 / 冻融潜热、库存和累计外部辐射，预算正确单独判定。

1800→900s 的北/南逐月 area 最大差 ${num(a.temporalConvergence.north.maxMonthlyAreaDifferenceMillionKm2,4)}/${num(a.temporalConvergence.south.maxMonthlyAreaDifferenceMillionKm2,4)} 百万 km²，extent 最大差 ${num(a.temporalConvergence.north.maxMonthlyExtentDifferenceMillionKm2,4)}/${num(a.temporalConvergence.south.maxMonthlyExtentDifferenceMillionKm2,4)}；阈值会放大边界格变化。南2月短波修复的1800s范围减小0.428738百万km²，900s却增加相同数值；小幅 extent 改善尚未证明稳定。这里只完成两个步长的敏感性检查，不宣称收敛阶或覆盖已收敛。错误的冬季峰值没有随减步消失。

GPCC 沿用 DWD v2022、1991–2020正常值及此前相同有效陆地交集。下面为实际365日区域沉降量 mm，旧双开与短波修复用相同支撑；不是只比渲染色阶。

| 区域 | 旧双开1800s | 修复1800s | 修复900s | GPCC | 900s偏差 |
| --- | ---: | ---: | ---: | ---: | ---: |
${gpcc}

印度供水偏低、青藏过干和澳洲季节反转仍是未完成的区域验收。西南澳 JJA/DJF 为 ${num(south.modelSeasons.JJA)}/${num(south.modelSeasons.DJF)} mm，GPCC为 ${num(south.observedSeasons.JJA)}/${num(south.observedSeasons.DJF)}；不能用海冰库存改善替代这些验收。

代码验证：251/251测试、类型检查、构建、正式Earth场景verify及diff检查通过。独立只读复核的热闭合112边界组合与无冰输送相同检查见 [REVIEW.md](REVIEW.md)。新短波修复不改关开关的正式路径。

原冻结 harness 的 \`waterLatentWm2\` 实为最后一次 phase 调用覆盖后的热量，不能当作完整蒸发潜热。本轮分析排除此字段，新 harness 名为 \`lastPhaseHeatWm2\`；实际净冻融独立累计两次 phase。预算直接由真实库存 / 焓计算，不依赖这个误名字段。

## 证据和下一处结构修复

当前下一处应修的是独立浓度 / 冰厚状态和冰底增厚与开水结冰的分离，再隔离空气辐射强迫和初始库存覆盖偏差；仍需同库存真实多年度积分。已取得的反例足以拒绝提升正式默认，无需用阈值调参追平观测。

[acceptance.json](acceptance.json) 保留逐月观测 / 模型量、四组条件效应及交互、减步、预算和GPCC；[factorial-analysis.json](factorial-analysis.json) 保留纬带字段，[manifest.json](manifest.json) 绑定源代码 / 实验bundle / 初始库存 / 存档SHA。原始混杂组及中止探针保留，但已从主验收排除；不得将其与新组混配。

复现：从仓库根打包 integrate.ts，P1_LABEL/P1_DT/P1_ICE/P1_UNDER 指定组别，P1_DAYS默认24,90,180,270,365。冻结修复前bundle位于忽略目录 build/earth-seaice-causal，prepare-fair.mjs只替换旧bundle的输送基础掩膜；修复前后bundleSHA见manifest。export-mask.ts生成全地形海洋支撑；download-ncei.mjs从官方镜像取得固定历史数据，remap-nsidc.py映射，check-index.py核对产品差异，analyze-factorial.mjs/analyze.mjs/report.mjs/plot.py生成证据。Python库安装在隔离的build目录。

本轮图是数值验收图，不能冒充 WebGL 截图。此前 WebGL2 初始化阻塞未收到恢复通知，保持用户“先继续数值验收”的选择；未重启浏览器或访问内部GPU页面。恢复后按manifest绑定的同日库存、视角补图。
`;
await writeFile(`${folder}/REPORT.md`,body);console.log('wrote REPORT.md');
