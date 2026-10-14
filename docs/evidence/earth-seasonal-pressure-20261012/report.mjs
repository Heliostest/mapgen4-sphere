import fs from 'node:fs/promises';
const folder='docs/evidence/earth-seasonal-pressure-20261012';
const c=JSON.parse(await fs.readFile(folder+'/comparison.json','utf8'));
const causes=JSON.parse(await fs.readFile(folder+'/full-causes.json','utf8'));
const order=['control','balanced','boundaryMix1'],full=order.map(l=>c.full.find(j=>j.label===l));
const fmt=(v,n=1)=>Number(v).toFixed(n),row=(j,name)=>j.gpcc.find(r=>r.name===name);
const names={control:'控制（上轮冷锋档）',balanced:'海陆热压',boundaryMix1:'边界层热压 + K=100万'};
const table=(head,rows)=>'| '+head.join(' | ')+' |\n| '+head.map(()=>'---').join(' | ')+' |\n'+rows.map(r=>'| '+r.join(' | ')+' |').join('\n');
const regionTable=table(['GPCC 区域 / 年雨 mm','观测',...order.map(l=>names[l])],full[0].gpcc.map(r=>[r.name,fmt(r.observedAnnualMm),...full.map(j=>fmt(row(j,r.name).modelAnnualMm))]));
const seasonTable=table(['西南澳 / mm','观测',...order.map(l=>names[l])],[['DJF（南半球夏）',fmt(row(full[0],'Australia southwest').observedDJFMm),...full.map(j=>fmt(row(j,'Australia southwest').DJFMm))],['JJA（南半球冬）',fmt(row(full[0],'Australia southwest').observedJJAMm),...full.map(j=>fmt(row(j,'Australia southwest').JJAMm))]]);
const metrics=table(['指标',...order.map(l=>names[l])],[['温带四区年雨 MAE / mm',...full.map(j=>fmt(j.temperateAnnualMAEMm))],...['north','south'].flatMap(h=>['extent','area'].map(k=>[(h==='north'?'北':'南')+'半球海冰'+(k==='extent'?'范围':'面积')+' MAE / 百万 km²',...full.map(j=>fmt(j.ice[h][k+'MAE'],3))])),...['final','snowfall','melt','compaction'].map(k=>[({final:'期末雪库存',snowfall:'累计降雪',melt:'累计融雪',compaction:'累计压实'})[k]+' / 全球平均 mm',...full.map(j=>fmt(j.snowLedger[k],4))])]);
const driverRows=[];
for(const p of causes)for(const name of ['India','Himalaya foreland','Australia southwest','Australia north'])for(const s of ['DJF','JJA']){
 const r=p.rows.find(r=>r.name===name),d=r.seasons[s],t=r.seasonalTransport[s];
 driverRows.push([names[p.label],name,s,fmt(d.windEastMps,2),fmt(d.windNorthMps,2),fmt(d.convergenceDay,3),fmt(t.AdvectiveNet),fmt(t.DiffusiveNet),fmt(t.NetTransport)]);
}
const drivers=table(['档','区域','季节','向东 m/s','向北 m/s','辐合 / 日','平流净入 mm','扩散净入 mm','总净入 mm'],driverRows);
const screening=table(['粗网格档','期末雪 mm','温带 MAE mm','印度年雨','山前年雨','西藏年雨','西南澳 DJF / JJA','北澳年雨'],c.screening.map(j=>[j.label,fmt(j.snowLedger.final,3),fmt(j.temperateAnnualMAEMm),...['India','Himalaya foreland','Tibet'].map(n=>fmt(row(j,n).modelAnnualMm)),fmt(row(j,'Australia southwest').DJFMm)+' / '+fmt(row(j,'Australia southwest').JJAMm),fmt(row(j,'Australia north').modelAnnualMm)]));
const budget=table(['档','全水残差 mm','焓残差 J/m²','逐格水汽残差 mm','路由分配残差 m³','雪账残差 mm','日审计次数'],full.map(j=>[names[j.label],j.budget.waterMax.toExponential(3),j.budget.heatMax.toExponential(3),j.budget.vaporMax.toExponential(3),fmt(j.budget.routingMax,4),j.snowResidualMax.toExponential(3),j.auditCount]));
const text=`# 季节环流调整：同库存真实年度验收

完成压力势与实际风摩擦的实验实现、独立因果对照和完整地形积分。西南澳冬夏排序能够恢复，但没有候选同时通过印度、喜马拉雅/西藏、温带与澳洲验收。正式默认不改，原冷锋预览保留；两种新压力档仅用于对照。

## 实际改变

原局地热势截断冷异常，阻力耗散的是相对模板的偏差。可选方案保留海陆冷热差的符号，使摩擦作用于实际低层风；将未解析的大尺度海洋背景力明确写入。另测二次表面应力与静力层厚尺度。水汽面通量独立记录实际平流和扩散，恢复时清除未保存诊断，库存不新增。枚举、层厚、合法季节反转风的存档包络与运行时共享验证。

方程、对照变量及物理参考见 [protocol.md](protocol.md)。这是诊断气压势模型，没有干空气质量、垂直回流或动能预算；风向改变不能自动证明季风动力闭合。

## 完整地形 GPCC 验收

三个档从同一湖泊日零存档恢复：215348 地形三角形、48×24 大气格、有限陆海水/湖泊库存与相同温度、显热、焓和风记忆。dt=1800 s，积分真实轨道年；最终实际库存时间 365.270833 d，观测累计截到准确轨道年。GPCC v2022 1991–2020、原区域及共同有效陆地支持不变。一次初值年度不是经过多年平衡的气候态。

${regionTable}

${seasonTable}

边界层档印度年雨增加，喜马拉雅山前年雨靠近观测，但西藏降到 139.5 mm。山前 938 mm 中约 855.6 mm 仍来自扩散直接地形抬升；只是减弱了错误路径，雨影未通过结构性验收。该档叠加 K=100万，改善不能单独归于压力；单因素对照见粗网格表。

西南澳从 DJF 325.6 / JJA 4.9 mm 改为 111.8 / 138.0 mm，冬夏排序修正，振幅仍弱于观测 51.3 / 226.7 mm。北澳却从 1421.1 增至 2355.5 mm（观测 985.9）。欧洲、西西伯利亚改善，东美和东亚恶化，温带四区平均绝对偏差变大。新档不满足“不加重澳洲偏湿”。

## 积雪与 NSIDC

${metrics}

共同初始雪库存为 10.2457 全球平均 mm。海陆热压期末比控制多约 65%，来自降雪增加而非漏水；仍低于自身初始库存。边界层档期末雪库存基本相当。库存是质量，不能代替覆盖面积；NSIDC 海冰观测也不能验收陆地雪。

NSIDC G02202 v2 1981–2010、固定同网格海域支持、15% 范围阈值和 0.5 m 模型浓度规则不变。海陆热压南半球范围 MAE 改善，北半球退化且陆雪增加；边界层档南半球范围小幅改善，面积 MAE 反而增加。全球冰冻范围未通过验收。

## 真实供水与抬升

${drivers}

净入是同格气柱实际面通量的区域支持加权量，正值为净输入；不是海洋来源示踪，也不能直接替代每陆地面积降雨。平流+扩散只在同一观测日历内相加，库存闭合使用全部实际 ceil 步。

控制西南澳冬季平流净输出约 63.5 mm，边界层档转为净输入约 132.2 mm，冬季辐合由负转正，这是冬雨恢复的输送证据。印度夏季平流净输入从 235.3 降至 144.3 mm，总净入从 79.1 降至 61.2 mm；印度年雨增加不能被描述为海到陆平流供水已修好。地区平均偏西风也不能单独排除孟加拉湾支流；尚无 ERA5/NCEP 风场或海洋来源示踪验收。

北澳夏季过强热力辐合及其凝结闭合仍会造成湿偏。喜马拉雅扩散地形雨、陆气热差/海洋背景压强简化、缺少稳定度约束和垂直环流仍是限制。压力代理使用海洋主体温度，尚未以实际冷冰面与开阔水面面积加权替代，本轮未把这个未验证假设混入结果。下一轮宜固定已有证据的西南澳输送响应，逐项查稳定度和地形抬升。

## 全部粗网格因果对照

各档使用同库存真实一年，关闭地形路由，不能替代完整地形验收。signed / dragOnly 分别检查压力和摩擦，pressure 移除模板背景，balanced / boundary 明确保留背景，NoOro 仅去掉扩散直接地形抬升，Mix1 仅降 K。stress 与 layer 分开检查阻力和压力层厚；定义见 [profiles.json](profiles.json)。失败结果均保留。

${screening}

粗网格 1800→900 s 同库存时间收敛：${c.stepComparison.map(j=>j.label+' 最大区域年雨差 '+fmt(j.annualMaxDifferenceMm,3)+' mm、逐月差 '+fmt(j.monthlyMaxDifferenceMm,3)+' mm').join('；')}。两档西南澳冬雨排序均保留；没有进行完整地形半步验证。

## 预算、存档与复现

${budget}

各完整档 366 次每日审计通过。独立从 JSON 端点重读，水汽/雪逐元素等于积分账；JSON 再编码解码后下一步精确一致，见 [serialized-restore.json](serialized-restore.json)。278/278 测试、TypeScript、构建通过；独立实现审查无阻断问题，补齐纯扩散/纯平流/混合面通量的测试，见 [review.md](review.md)。水/焓闭合不代表区域气候正确。

完整初始库存 SHA256：${full[0].initialStockSha}。正式场景 SHA256：${full[0].formalSha256}。湖泊输入 SHA256：${full[0].inputSha256}。

[comparison.json](comparison.json) 保存区域月雨和全部误差；[full-causes.json](full-causes.json) / [screen-causes.json](screen-causes.json) 保存驱动和输送；raw/*.json.gz 无损保留完整输出，bundles/*.mjs.gz 保留对应运行 bundle。原字节/bundle 哈希见 comparison 和 manifest。存档和预览在 build/earth-seasonal-pressure，未覆盖正式场景。

复现：npm test、npm run typecheck、npm run build；node docs/evidence/earth-seasonal-pressure-20261012/setup.mjs；设 PARAM_PROFILE 运行 build/earth-seasonal-pressure/screen.mjs 或 full.mjs（900 s 另设 PARAM_DT=900）；运行 restore.mjs；设 CAUSE_STAGE=screen/full 运行 causes.mjs 并传入档名；再运行本目录 analyze.mjs、report.mjs、preview.mjs。旧运行版本可从对应 bundle gzip 解压使用。

## 实际 WebGL 截图

同库存一年端点、固定地球姿态和亚洲/澳大利亚视角、表面层、12× 地形起伏、云关闭。截图验证渲染，不作为年度雨量验收。

![调整前](before-asia.jpg)

![海陆热压](balanced-asia.jpg)

![边界层热压](boundary-asia.jpg)
`;
await fs.writeFile(folder+'/report.md',text);console.log('Report generated from actual annual outputs.');
