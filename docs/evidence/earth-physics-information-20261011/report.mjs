import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir='docs/evidence/earth-physics-information-20261011',a=JSON.parse(await readFile(dir+'/acceptance.json','utf8')),v=JSON.parse(await readFile(dir+'/verification.json','utf8'));
const f=(x,n=2)=>Number(x).toFixed(n),e=x=>x.toExponential(3);
const fence=String.fromCharCode(96).repeat(3);
const names={'Amazon':'亚马孙','Congo':'刚果','India':'印度','Himalaya foreland':'喜马拉雅山前','Tibet':'青藏高原','Australia interior':'澳洲内陆','Australia north':'澳洲北部','Australia east':'澳洲东部','Australia southwest':'澳洲西南'};
const rainTable=a.gpcc.map(r=>`| ${names[r.name]} | ${f(r.observed)} | ${f(r.flat)} | ${f(r.relief)} | ${f(r.deltaMm)} | ${r.reliefAbsoluteError<r.flatAbsoluteError?'减小':'增大'} |`).join('\n');
const sw=a.gpcc.find(r=>r.name==='Australia southwest');
const caseTable=a.localCases.map(r=>`| ${names[r.name]} | ${f(r.relief.low.heightM,0)} / ${f(r.relief.high.heightM,0)} | ${f(r.flat.low.landC)} / ${f(r.flat.high.landC)} | ${f(r.relief.low.landC)} / ${f(r.relief.high.landC)} | ${f(r.flat.low.snowMm)} / ${f(r.flat.high.snowMm)} | ${f(r.relief.low.snowMm)} / ${f(r.relief.high.snowMm)} |`).join('\n');
const nsTable=a.seaice.flatMap(r=>['north','south'].map(h=>`| ${r.label==='flat'?'抹平起伏':'保留起伏'} | ${h==='north'?'北半球':'南半球'} | ${f(r.errors[h].meanAbsoluteAreaMillionKm2,4)} | ${f(r.errors[h].meanAbsoluteExtentMillionKm2,4)} |`)).join('\n');
const report=`# 基本物理与新增地理信息的有效性复核

本轮结论：守恒、有限库存和关键通量方向的检查通过；更细的地形确实改变局地热力、积雪和山地降水，但没有一致降低区域降水误差，也没有纠正澳洲西南的季节反转。现有海洋热力/环流接口不接收海底深浅。继续补充土壤、植被与混合层物性有明确的作用路径，但须先实现相应过程并逐字段对照，不能把数据增多等同于仿真真实性改善。

正式默认和 Earth 文件保持不变。本轮新增的是审计、积分探针、验收和信息接入约束，未改动生产方程、正式参数或源库存。WebGL 截图仍待先前的环境恢复；这里没有把数值结果当作前后截图。

## 1. 基本物理检查与仍存在的简化

[独立物理探针](physics-check.ts)调用实际热力、水量、相变、环流和海冰代码：${a.physicsGroupsPassed} 组断言通过，包含 36 组海冰表面条件；[现有相关回归](../../../build/earth-physics-information/focused-tests.log) ${a.focusedTestsPassed}/${a.focusedTestsPassed} 通过。关键检查是共享边热交换守恒且降低温度差、科氏项不做功、线性阻力耗散动能、冻结释放/融化消耗潜热、耗尽液态库存不造冰、闭合海流保持均匀温度且不造新温度极值、全球短波满足球面 S/4，以及海冰吸收短波分配保持总能量。36 组冰面条件的最大能量算术误差为 2.244e−6 J/m²，皮温闭合残差为 4.843e−11 W/m²。

这些结果支持“所检查的基本守恒与方向正确”，不能证明完整大气/海洋物理或气候观测一致。仍有明确结构限制：

- 海冰浓度由质量按 0.5 m 厚度换算。实测代码探针中，浓度 0.10/0.25/0.75/1.00 对应的推导冰厚都为 0.5 m；部分覆盖阶段增加冰量会扩大覆盖，不能独立表达底部增厚。面积与体积应分别演化，[MITgcm 海冰文档](https://mitgcm.readthedocs.io/en/latest/phys_pkgs/seaice.html)提供了这一基本状态区分。该结构问题尚未在本轮修复，不能用细化 DEM 或调阈值消除。
- 海洋仍是统一 10 m 混合层和规定闭合涡旋，缺独立深层热库存、盐度分层和垂向卷入；海底深度不能替代季节混合层深度。
- 空气与表面长波为有效辐射分配近似，没有完整的上下行长波交换；积雪保温、冰内热容量和漂移也未完整表示。预算闭合不等于这些缺失过程已经具备。
- 确认内湖已进入有限地形水路由，但湖水热力和规定海流湿支撑仍保留共享水面近似；不能称为完整淡水湖模型。

## 2. 同库存真实积分方法

两组都使用完整 215348 个地形三角形、1152 个空气/水汽格和同一个 8922 片的 balanced 表面分区。相同参数：真实地形水路由、冰川、动态低层环流，实验 moisture=transport、airRadiationFraction=0.5、conductiveSeaIce=true、underIceOcean=true。正式 classic/legacy 场景不动。

唯一干预：flat 将每个父格内的陆地高程抹平到其原有面积加权均值；relief 保留格内地形起伏。海岸、细分面积、父格平均地形、原始水路由和空气网格均相同。先把两组细分陆地/海洋温度都设为各自父格的原始温度，因此初始细分温度及所有水库存也逐值相同，没有借新增地形重生成初始气候。

粗库存 SHA：${a.initialStocksSha256}；粗+细分库存 SHA：${a.fineInventorySha}。两组分区几何和运行 bundle 的 SHA 完全相同；实际高度字段 SHA 不同。

实际固定步长 1800 s 连续积分到 ${f(a.integrationDays,8)} 天；完整轨道年为 ${f(a.physicalYearDays,8)} 天。最后一个物理步照常执行，观测通量记录只截取到整轨道年，因此每个月都有完整覆盖。没有季节跳转、库存重置或合成温度强迫。只有一个暂态年，不声称已达到多年气候平衡。

记录检查点的最大独立残差：水量 ${e(a.budgetMax.waterResidualMm)} mm，焓 ${e(a.budgetMax.enthalpyResidualJm2)} J/m²，逐格水汽 ${e(a.budgetMax.maxCellVaporResidualMm)} mm。年末所有细分水库非负、温度有限且为正，两个运行快照经数组规范化后，严格文件解码和预算检查均通过。relief 附回原地形后的下一步逐值一致；flat 是证据专用的地形覆盖，不能附回原地形后冒充正常来源一致的续算文件。

## 3. 更细陆地起伏的实际收益与限制

GPCC v2022 1991–2020 normals 2.5°，模型和观测取同一有效陆地交集；下表为首个完整轨道年的实际陆地沉降雨量，单位 mm。一个暂态模拟年与气候正常值的比较用于这次消融诊断，不能替代气候平衡验收。

| 区域 | GPCC | 抹平起伏 | 保留起伏 | 保留−抹平 | 年量绝对误差 |
|---|---:|---:|---:|---:|---|
${rainTable}

澳洲西南的 JJA/DJF：观测 ${f(sw.observedSeasons.JJA)}/${f(sw.observedSeasons.DJF)} mm；抹平 ${f(sw.flatSeasons.JJA)}/${f(sw.flatSeasons.DJF)}；保留 ${f(sw.reliefSeasons.JJA)}/${f(sw.reliefSeasons.DJF)}。两组仍然夏季多雨、冬季少雨，季节反转没有被地形细化纠正。

同一父格内选原地形高低差最大的两个陆地片，比较年末局地状态（温度 °C，雪水当量 mm）：

| 区域 | 原地形低/高点 m | 抹平温度低/高 | 保留温度低/高 | 抹平积雪低/高 | 保留积雪低/高 |
|---|---:|---:|---:|---:|---:|
${caseTable}

这些变化说明格内地形进入了局地递减率、辐射、积雪与降水分配及后续反馈。它没有给大气增加独立格点：粗环流和跨格雨出仍使用相同父格高程，无法凭局地雨量分配权重重新解析山脉两侧的空气和水汽输送。本次实验只检验已有地形细节的作用；未检验更高分辨率原始 DEM、全新土壤/植被数据或空气网格加密的净收益。

## 4. NSIDC 同网格辅助检查

复用上轮逐源字节及重映射独立核实的 G02202 v02r00 NASA Team 1981–2010 月平均浓度，固定有效海洋支撑北 ${f(a.nsidc.commonMillionKm2.north,6)} / 南 ${f(a.nsidc.commonMillionKm2.south,6)} 百万 km²，扣除确认内湖和固定冰架。

本轮先将实际细分海冰的质量浓度代理按海洋面积平均到父格，再当作均匀父格浓度使用相同 NSIDC 有效支撑；不是逐细分片观测交集。双方先取月平均，再在相同粗格上使用 15% 范围阈值。下表单位为百万 km²、12 个月绝对误差的平均值：

| 干预 | 半球 | 冰面积 MAE | 15% 范围 MAE |
|---|---|---:|---:|
${nsTable}

本轮仍不宣布海冰季节范围通过。该项用于检查只增加陆地起伏是否明显改变冰覆盖失真；它没有引入独立海冰浓度状态，也没有验证多年海冰平衡。

## 5. 陆海信息下一步应怎样增加

保持海岸不变，将海底负高程幅值扩大，在实际 Earth 地形采样及一个独立小网格探针中，热力/环流输入均逐值不变。源码接口只保留海陆符号和陆地高度，海洋热容仍是统一混合层参数。因此，单独增加海底细节在这条计算路径中没有收益；这不等于改变内湖床高程、水位或海岸也没有影响。

更值得接入的是土壤有效深度、储水/入渗/排水物性，植被覆盖、叶面积、根深与粗糙度，以及海洋混合层和深层热量信息。[CTSM 表面输入文档](https://escomp.github.io/CTSM/tech_note/Ecosystem/CLM50_Tech_Note_Ecosystem.html)说明这些属性分别影响光学、水分吸收及热量/水汽/动量交换；当前代码尚未接入相应的实测字段，因此“导入更多文件”本身不会产生这些过程。[MITgcm 海洋示例](https://mitgcm.readthedocs.io/en/latest/examples/global_oce_latlon/global_oce_latlon.html)也将海底几何、垂向离散和热盐水文分开。

[信息接入约束](INFORMATION-CONTRACT.md)给出有单位字段、守恒重映射、缺测回退和逐因素验收的具体要求。顺序是海冰面积/厚度闭合、陆地有效物性、海洋守恒垂向热交换，然后单独验证空气网格加密。海底深度和热力混合层不能混为同一个热容参数。

## 复现与绑定

在仓库根目录运行：

${fence}powershell
node node_modules/esbuild/bin/esbuild docs/evidence/earth-physics-information-20261011/integrate.ts --bundle --platform=node --format=esm --outfile=build/earth-physics-information/integrate.mjs
$env:INFO_ARM='flat'
node build/earth-physics-information/integrate.mjs
$env:INFO_ARM='relief'
node build/earth-physics-information/integrate.mjs
node node_modules/esbuild/bin/esbuild docs/evidence/earth-physics-information-20261011/physics-check.ts --bundle --platform=node --format=esm --outfile=build/earth-physics-information/physics-check.mjs
node build/earth-physics-information/physics-check.mjs
npm test
node --test build/tests/environment.test.mjs build/tests/thermal.test.mjs build/tests/water.test.mjs build/tests/circulation.test.mjs build/tests/refinement.test.mjs build/tests/moisture.test.mjs > build/earth-physics-information/focused-tests.log 2>&1
node node_modules/esbuild/bin/esbuild docs/evidence/earth-physics-information-20261011/verify.ts --bundle --platform=node --format=esm --outfile=build/earth-physics-information/verify.mjs
node build/earth-physics-information/verify.mjs
node docs/evidence/earth-physics-information-20261011/analyze.mjs
node docs/evidence/earth-physics-information-20261011/report.mjs
${fence}

[验收数组与源哈希](acceptance.json)、[物理检查](physics-check.json)、[严格文件解码](verification.json)、[抹平组](flat.json)、[保留组](relief.json)。正式 Earth SHA：${a.formalSha256}。原始 NSIDC/GPCC 来源与输入文件保留在前述已核实的证据目录，验收 JSON 绑定其重映射数据 SHA。本轮验证脚本没有放宽生产解码、来源或预算阈值。
`;
await writeFile(dir+'/REPORT.md',report);
const paths=['REPORT.md','INFORMATION-CONTRACT.md','acceptance.json','verification.json','verify.ts','report.mjs'];
const bindings=await Promise.all(paths.map(async file=>({path:dir+'/'+file,sha256:createHash('sha256').update(await readFile(dir+'/'+file)).digest('hex')})));
for(const path of ['build/earth-physics-information/verify.mjs',...v.records.map(r=>r.canonicalFile)])bindings.push({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});
await writeFile(dir+'/manifest.json',JSON.stringify({generatedAtUtc:new Date().toISOString(),bindings:[...a.bindings,...bindings]},null,2)+'\n');
console.log(JSON.stringify({report:dir+'/REPORT.md',verification:v.records.map(r=>({label:r.label,strict:r.strictRuntimeFileDecode,fullTerrainContinuation:r.fullTerrainContinuation})),gpccRegionsImproved:a.gpcc.filter(r=>r.reliefAbsoluteError<r.flatAbsoluteError).map(r=>r.name)}));
