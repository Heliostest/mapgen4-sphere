import {readFile,writeFile} from 'node:fs/promises';
const folder='docs/evidence/earth-speedy-transport-20261013',out='build/earth-speedy-transport';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const optional=async p=>{try{return await read(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const comparison=await read(`${folder}/sensitivity-comparison.json`),fields=await read(`${folder}/candidate-fields.json`);
const replay=await read(`${folder}/replay-summary.json`),audit=await read(`${out}/audit-combined.json`),baseline=await read(`${folder}/baseline-replay-verification.json`);
const f=(n,d=2)=>n.toFixed(d),pct=n=>f(100*n,1)+'%',pass=b=>b?'通过':'未通过';
const names={'baseline-sensitivity-v2':'上一轮基线','clouds-precip-sensitivity':'仅云降水项','clouds-full-sensitivity-v2':'完整云量','parcel-sensitivity':'仅气块抬升','combined-sensitivity':'气块＋云量','parcel-seasonal':'仅气块抬升','combined-seasonal':'气块＋云量','evaporation-sensitivity':'气块＋云量＋陆面蒸发','implicit-sensitivity':'气块＋云量＋热力配对','all-corrections-sensitivity':'第二批全部修复','all-corrections-seasonal':'第二批全部修复'};
names['longwave-sensitivity']='气块＋云量＋灰体反射';
names['split-reference-sensitivity']='第三批分离隐式参考';
names['split-reference-seasonal']='第三批分离隐式参考';
names['thermal-split-reference-sensitivity']='气块＋云量＋稳定热力分支';
const long=comparison.cases.filter(c=>c.stage==='five-year-spinup-one-statistics-year'),short=comparison.cases.filter(c=>c.stage==='same-2006-state-one-year-sensitivity');
const baselineCase=short.find(c=>c.prefix==='baseline-sensitivity-v2');
const table=cs=>{
 let s='| 配置 | 印度年雨 mm | JJA占比 | 峰月 | 月MAE mm | 四项通过数 | 北澳年雨 mm | DJF占比 | 峰月 | 月MAE mm | 四项通过数 |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
 for(const c of cs){const rows=['India','Australia north'].map(name=>{const r=c.regions.find(r=>r.name===name);return `${f(r.modelAnnualMm)} | ${pct(r.summerFraction)} | ${r.peakMonth} | ${f(r.monthlyMAEMm)} | ${Object.values(r.monsoonScreen).filter(Boolean).length}/4`;});s+=`| ${names[c.prefix]??c.prefix} | ${rows.join(' | ')} |\n`;}
 return s;
};
let text='# 湿物理、热力输送与水量账本：继续修复记录\n\n';
text+='本轮先检查气块抬升、云量、背景温度输送及其半隐式配对、陆面蒸发和灰体长波反射，并把启动水量峰值分解到原生离散操作。第二批热力方案在长期运行中失稳，随后另建第三批候选，分开动力参考温度与半隐式求解参考温度。实现检验通过不能代替季风验收；固定区域的降水结果和失败门槛全部列在下方。正式地球默认和上一轮冻结证据保持不变。\n\n';
const failedRuns=[];
for(const prefix of Object.keys(names)){
 const status=await optional(`${folder}/${prefix}-native-status.json`);
 if(status&&status.code!==0){const progress=await optional(`${out}/${prefix}-progress.json`),log=await readFile(`${folder}/${prefix}-native.log`,'utf8');
  failedRuns.push({prefix,status,progress,error:log.split(/\r?\n/).find(l=>l.startsWith('ERROR:'))??'见原生日志'});}
}
const latestSplit=long.find(c=>c.prefix==='split-reference-seasonal')??short.find(c=>c.prefix==='split-reference-sensitivity');
if(latestSplit){
 const complete=latestSplit.stage==='five-year-spinup-one-statistics-year';
 text+=`**第三批${complete?'六年积分':'一年分支'}已完成，源码与输入均保持原散列。** `;
 for(const name of ['India','Australia north']){
  const r=latestSplit.regions.find(r=>r.name===name),label=name==='India'?'印度':'北澳';
  text+=`${label}年雨 ${f(r.modelAnnualMm)} mm，当地夏季占 ${pct(r.summerFraction)}，峰 ${r.peakMonth} 月，四项季风门槛通过 ${Object.values(r.monsoonScreen).filter(Boolean).length}/4。`;
 }
 text+=`固定 11 区中 ${latestSplit.regionsMAEIncreased} 区月 MAE 高于上一轮。`;
 if(!latestSplit.monsoonPassed)text+='两地完整季风门槛没有同时通过，不能据此推广默认模型。';
 if(!complete)text+='这是从旧状态出发的一年响应，六年结果仍须独立验证。';
 text+='年水量预算通过也不能代替启动每步 0.05 mm 门槛。\n\n';
}
if(failedRuns.length){text+='**第二批长期运行的失败记录仍完整保留。** 以下运行停止后未产生完整年度结果，不进入气候验收表；保留其原始日志和同初态输出用于复现。第三批结果单独列出，不以新版本完成覆盖旧版本的失败。月进度是最后已记录时刻，不一定是具体失败时刻。\n\n| 运行 | 最后月进度 | 退出码 | 错误 |\n|---|---|---:|---|\n';
 for(const r of failedRuns)text+=`| ${r.prefix} | ${r.progress?.time??'无'} | ${r.status.code} | ${r.error} |\n`;
 text+='\n';}
text+='## 完整六年积分\n\n';
const expectedLong=['parcel-seasonal','combined-seasonal','all-corrections-seasonal','split-reference-seasonal'];
const pending=expectedLong.filter(p=>!long.some(c=>c.prefix===p)&&!failedRuns.some(r=>r.prefix===p));
if(pending.length)text+=`**长积分仍有 ${pending.length} 组未完成：${pending.join('、')}。** 不以一年分支替代独立六年结果。\n\n`;
if(long.length){text+=`已完成 ${long.length} 组，均从相同冻结 2001 初态真实连续积分至 2007-01-01，T32、8 层、30 分钟、五年预热，最后一个完整年度统计。基线是上一轮连续积分，本轮无改动重启分支已逐值复现其 2006 结果。\n\n`+table([baselineCase,...long])+'\n![六年季风比较](six-year-monsoon.png)\n\n';
 text+=`完整季风门槛通过 ${long.filter(c=>c.monsoonPassed).length}/${long.length} 组。各地区的单项通过数保留，未以平均改善掩盖失败项。\n\n`;
}
text+='四项沿用原门槛：峰月距观测不超过一月、当地夏季降水占全年至少 50%、年雨量相差不超过 25%、月 MAE 低于冻结的 `before-seasonal` 基线。观测印度 1138.06 mm、峰 7 月；北澳 985.87 mm、峰 1 月。此处的观测是 GPCC 1991–2020 月气候态，并非 2006 实况。\n\n';
if(long.length){
 text+=`| 区域 | 上一轮月MAE | ${long.map(c=>names[c.prefix]+'月MAE').join(' | ')} |\n|---|---:|${long.map(()=>'---:|').join('')}\n`;
 for(const r of baselineCase.regions){text+=`| ${r.name} | ${f(r.monthlyMAEMm)} | ${long.map(c=>f(c.regions.find(x=>x.name===r.name).monthlyMAEMm)).join(' | ')} |\n`;}
 text+='\n以上误差单位为 mm/月；与上一轮 `coupled-seasonal` 对比，与季风 MAE 门槛使用的更早 `before-seasonal` 不同，机器结果同时保留两种差值。\n\n![11区与水量](six-year-regions-budgets.png)\n\n';
}
text+='## 相同 2006 初态的一年响应\n\n'+table(short)+'\n';
text+=`${short.length} 组起始大气／陆地库存哈希相同，各运行 17,520 步，保留原两个 Leapfrog 时间层与干质量目标。第一批分离气块和云量改动；第二批以第一批组合为基础，分别增加蒸发、成对热力和全部修复。它们包含从旧平衡态调整的瞬态，不能称为新平衡气候。\n\n![第一批一年分支](sensitivity-rain.png)\n\n`;
if(short.some(c=>['evaporation-sensitivity','implicit-sensitivity','all-corrections-sensitivity','longwave-sensitivity'].includes(c.prefix)))text+='![第二批一年分支](sensitivity-v2-rain.png)\n\n';
if(short.some(c=>c.prefix==='split-reference-sensitivity'))text+='![第三批一年分支](sensitivity-v3-rain.png)\n\n一年分支的峰月与夏季占比改善，不等于逐月曲线已经准确；印度 8 月仍仅约 56.3 mm，固定 GPCC 气候态约 290.3 mm。组合方案包含多项改动，不能单独归因于半隐式参考；另用冻结入口的稳定热力分支作机制对照。区域温湿风、陆面水量和辐射的独立分析见 [第三批一年气候复核](v3-climate-review.md)，附加分支的选择依据见 [热力对照记录](thermal-split-selection.md)。\n\n';
const thermalShort=short.find(c=>c.prefix==='thermal-split-reference-sensitivity');
if(thermalShort){
 const r=thermalShort.regions.find(r=>r.name==='India');
 const thermalGlobal=fields.cases.find(c=>c.prefix===thermalShort.prefix).annualGlobal;
 text+=`机制对照在第一批气块＋云量基础上加入热力配对和分离求解参考，尚未加入新的露水及长波反射修复，也出现了两地各 3/4 的季风响应。因此改善并不依赖后两项同时存在，但不能用单条混沌轨迹计算各修复的因果贡献百分比。印度 8、9 月仍仅 ${f(r.monthlyMm[7])}、${f(r.monthlyMm[8])} mm，对照气候态 ${f(r.observedMonthlyMm[7])}、${f(r.observedMonthlyMm[8])} mm；夏季占比提高也不能替代完整逐月验收。该分支 TOA 净输入已经是 ${f(thermalGlobal.toaNetWm2)} W/m²，较大的辐射失衡不能单独归咎于后加的灰体反射。\n\n`;
}
text+='## 已修的机制与可复现检查\n\n';
text+='1. **气块抬升**：旧代码跨 LCL 时将整段当作饱和湿抬升，并用饱和湿度覆盖原水汽，能产生不存在的水。新代码先干绝热抬升到 LCL，再以压力坐标积分饱和段；夹卷后重新判定饱和。原生回归先出现 2 个真实失败，最终 1,497 项通过；独立检查 12,344 次抬升未增水或异常。保留原生 RH、夹卷、调整时间尺度及最终列水／焓预算。它是恒定 cp/Lv、稀薄水汽近似的热力算法替换，并非仅改索引；不使用旧 geopotential 参数。Float32 极暖湿状态的约 1.31 J/kg 焓舍入余项已记录，本轮生产运行均为 Float64。详见 [对流报告](convection-report.md) 和 [独立审查](review-parcel.md)。\n\n';
text+='2. **云量**：降水 m/s → mm/day 应乘 1000，旧实现却除 1000；修复后平方根云贡献恢复原单位。层积云稳定度用上层减下层干静能并除以位势差，恢复无量纲 G，保留原阈值。原生相同测试 16 个失败；仅降水项 117/117、完整修复 119/119 通过，实际原生辐射列能量闭合到约 5.7e−14 W/m²。`cloud_cover` 不包含另存的层积云，不能作为总云量解释。详见 [云量报告](cloud-report.md)。\n\n';
text+=`3. **无干预复放证明**：完整逐过程诊断复放 17,520 步，12 个月雨量和温／湿／东西风／南北风与原连续积分最大差 0；无物理改动的新统计入口又比较 ${baseline.valuesChecked.toLocaleString('en-US')} 个已存数值，最大差 ${baseline.maxError}。因此诊断本身没有修改轨迹。\n\n`;
text+='4. **温度输送与半隐式配对**：原生核从温度中减去参考剖面后只平流扰动，缺少背景温度平流；其线性温度算子的层厚系数和界面使用也不等于原生完整核的雅可比。成对恢复背景平流并构造一致 L，不改湿度或压力库存。1,134 项通过，独立随机层结构的原生核误差约 5.2e−14。2006 分支保留原 2001 参考温度并重建 L/S，未用新平均温度重设参考。关闭隐式时仍保留背景平流修复，不是完整显式对照。见 [热力报告](implicit-followup.md)、[独立审查](review-implicit.md)。\n\n';
text+='5. **陆面蒸发与露水**：保留正蒸发算法 `max(alpha*qs-q,0)`；当空气湿度确实超过地表饱和值时，允许 `qs-q` 真实露水。旧扩展在暖面未饱和时也会因土壤可用指数产生负通量。现实土壤存在吸附，本模型的 bucket 未表示吸附水势或能量，因此这里恢复其正蒸发语义并限定液态露水条件。原生 13 个失败，修复后包括雪衰减和混合陆海水热账共 346 项通过。见 [蒸发报告](surface-evaporation-report.md)、[交叉审查](review-evaporation.md)、[环流诊断](circulation-followup.md)。\n\n';
text+='6. **灰体长波地表反射**：补上 `(1-epsilon)*下行长波` 的反射，沿原透过率向上传播并记入大气吸收和顶层出流。发射率和光学厚度未调；黑体极限逐值等同原生。原生 26 个失败，修复后 175 项通过。固定温度下该修复增加出射长波，不能作为抵消云短波冷却的调参。见 [辐射报告](radiation-followup.md)。\n\n';
text+='## 第二批失稳与第三批候选\n\n';
text+='两次一年分支已逐值重现首次非正温度，分别在 2006-02-28 05:30 和 2006-03-06 17:30 的北太平洋中层。首次坏点的物理倾向是加热；进入最终更新前，动力候选温度已经为负。两个 Leapfrog 时间层的温度振荡和垂直速度先增长，因此不能靠裁掉负温度解决。原探针的垂直 Courant 数使用 3600 秒双步跨度，按常规 30 分钟定义须除二；并不把后期越界倒推为最初原因。见 [逐步失稳复现](implicit-instability-report.md)。\n\n';
text+='独立的实际剖面线性化发现，原参考下 SI、RAW 和原生水平扩散的组合可放大负计算模态，即使对应的连续干动力系统中性。故障前健康检查点也出现这种增长。等温参考消除了所检查的强负模态，但扫描仍有少量弱复模态；这不是无条件稳定的证明，也不能单凭局部干系统解释全部非线性过程。第三批采用原大气组件已有的 288 K 等温求解参考，保留原动力参考，并补齐压力线性项的两个时间层配对。两个真实 48 小时窗口各完成 96 步并跨过原失败时刻，全窗最低温分别 186.64 / 192.78 K，最大名义垂直 Courant 数 0.1261 / 0.1090。与第二批已修正的完整物理动力倾向相比，短窗对照逐位一致。新鲜启动还单独修正了参考刷新的时机，最终候选自测 651 项通过；同一旧轨迹影子参考的三个启动阶段最大差均为零。全年及六年结果按新标签分别列在上方。见 [候选与短窗报告](implicit-split-report.md)、[独立稳定性审查](physics-implicit-instability-review.md) 和 [第三批协议](v3-protocol.md)。\n\n';
text+='另已查清一个独立的初态问题：T32 标量的最后辅助谱行在原生地形压力初始化中非零，原生水平扩散只清该行倾向，时间推进会一直保留初值。有效标量是 degree 0–31，辅助 degree 32 不能算进有效系数比较。只在副本中清压力辅助行，即可消除本次压力梯度的 curl / Laplace 恒等式误差；质量约束没有生成这些系数。这解释了此前改变动力参考时的离散不变性失败，不单独证明它导致长期失稳。第三批纯隐式参考试验保留原辅助行；初态投影另建派生状态、库存账和对照，不能混入同一实验。见 [辅助谱行来源审查](readonly-reference-review.md)。\n\n';
const projectedAudit=await optional(`${out}/audit-all-corrections-split-reference-projected-initial.json`);
if(projectedAudit){text+='独立初态投影 helper 的主检查 112 项和保存后重载 8 项通过，所有有效谱系数逐位保持。旧格点包含 RAW 前的历史，不能从已滤波的旧谱直接覆盖；2006 旧湿度历史无法追溯的部分保留到下一次自然轮转。派生 2001 状态的两种海温模式各运行三天，五标量两个谱层的辅助行全程为零。导入水变化 −1.7578e−6 mm 单列，干质量目标因派生初态增加约 5.6970e−5 kg/m²；不能声称初态 SHA 或全部控制量未变。\n\n';
 text+='| 派生初态模式 | 三天离散峰 mm | 超原0.05mm步数 | 三天离散终点 mm |\n|---|---:|---:|---:|\n';
 for(const c of projectedAudit)text+=`| ${c.mode} | ${f(c.maxDiscreteResidualMm,8)} | ${c.stepsOverOriginalPointZeroFive}/145 | ${f(c.finalStep.discreteFluxResidual,8)} |\n`;
 text+='\n辅助行约束得到维持，但启动水量峰没有消除；它不是原 0.061 mm 余项的修复。见 [投影接口与保存验证](scalar-initial-projection.md) 和 [原始／派生初态逐步对照](scalar-initial-projection-audit.md)。\n\n';}
const india=replay.records.find(r=>r.name==='India').seasons.JJA;
text+=`旧基线印度 JJA 平均雨量仅 ${f(india.rainMmDay,3)} mm/day，浅对流占 ${pct(india.fields.shallowFraction[0])}、深对流 ${pct(india.fields.deepFraction[0])}。对流对底层施加约 ${f(india.processes.convectionTemperatureKDay[7])} K/day 温度倾向，地表显热提供约 +${f(india.processes.surface_heat_fluxTemperatureKDay[7])} K/day。它表明旧错误参与了持续的垂直热量重分配；不等于修复后必然产生正确季风。旧 7 月瞬时状态上的修正气块诊断几乎全部无浮力，是瞬时反事实，不能当作修复后的全年频率。\n\n![印度逐过程倾向](india-process-budgets.png)\n\n`;
text+='## 水量结果：物理列闭合与数值核心分开\n\n';
text+='新合并候选两种海温模式各从原始初态运行三天。物理倾向逐过程与 E−P 闭合，但完整光谱动力积分仍有启动余项。原时钟矩形账本和相同 Leapfrog/RAW 离散账本同时保留；只改诊断，未调整任何水库存。\n\n';
text+='| 模式 | 物理残差最大 kg/m²/s | 三天矩形余项 mm | 三天离散余项 mm | 离散最大绝对余项 mm | 超原0.05mm步数 |\n|---|---:|---:|---:|---:|---:|\n';
for(const c of audit)text+=`| ${c.mode} | ${c.maxPhysicsResidualKgM2S.toExponential(2)} | ${f(c.finalStep.rectangularResidual,6)} | ${f(c.finalStep.discreteFluxResidual,6)} | ${f(c.maxDiscreteResidualMm,6)} | ${c.stepsOverOriginalPointZeroFive}/145 |\n`;
const auditV2=await optional(`${out}/audit-all-corrections.json`);
if(auditV2){text+='\n第二批全部修复的同初态三天结果：\n\n| 模式 | 物理残差最大 kg/m²/s | 三天矩形余项 mm | 三天离散余项 mm | 离散最大绝对余项 mm | 超原0.05mm步数 |\n|---|---:|---:|---:|---:|---:|\n';
 for(const c of auditV2)text+=`| ${c.mode} | ${c.maxPhysicsResidualKgM2S.toExponential(2)} | ${f(c.finalStep.rectangularResidual,6)} | ${f(c.finalStep.discreteFluxResidual,6)} | ${f(c.maxDiscreteResidualMm,6)} | ${c.stepsOverOriginalPointZeroFive}/145 |\n`;
 text+='\n![第二批启动账本](startup-v2-candidate.png)\n\n';}
const auditV3=await optional(`${out}/audit-all-corrections-split-reference.json`);
if(auditV3){text+='\n第三批分离隐式参考的同初态三天结果：\n\n| 模式 | 物理残差最大 kg/m²/s | 三天矩形余项 mm | 三天离散余项 mm | 离散最大绝对余项 mm | 超原0.05mm步数 |\n|---|---:|---:|---:|---:|---:|\n';
 for(const c of auditV3)text+=`| ${c.mode} | ${c.maxPhysicsResidualKgM2S.toExponential(2)} | ${f(c.finalStep.rectangularResidual,6)} | ${f(c.finalStep.discreteFluxResidual,6)} | ${f(c.maxDiscreteResidualMm,6)} | ${c.stepsOverOriginalPointZeroFive}/145 |\n`;
 text+='\n![第三批启动账本](startup-v3-candidate.png)\n\n';}
text+='\n![新候选启动账本](startup-candidate.png)\n\n上一轮约 −0.22 mm 的峰值主要来自两种时间口径的差，原生逐操作归因严格重建库存；真实剩余峰值主要与半隐式压力改变压力加权湿质量有关。全步守恒尚未通过，不能拿三天终点通过来代替。见 [启动详细归因](startup-report.md)。\n\n';
text+='进一步的无源短例关闭全部物理、质量约束和海温回调，从导入库存单独记账的合法投影初态运行原生三步。空气增加约 2.1641 kg/m²、水增加 0.0323236 mm；三个时刻的湿度裁剪均为零，辅助谱行也保持为零。因此该例不能归咎于 E−P、辅助行或负湿度裁剪，但它不等于耦合三天峰值的完整归因。\n\n';
text+='另建共同空气质量 M 与水质量 Q 的无源原型，通过 92 项守恒／常量示踪机制检查及 34 项双时间层库存复核；接入现有模型的压力一致性、正性和谱回投三类门槛仍有 9 项失败。原型仅作影子计算，未写回第三批模型。下一步需要协调压力连续性／半隐式步骤、Q 时间层和重启、共享输送、物理水源与总／干气质量定义、正性及重映射，不能用全局补水或只换湿度 wrapper 达成。见 [原型与失败证据](wet-carrier-report.md) 和 [独立接口审查](physics-moisture-carrier-review.md)。\n\n';
text+='| 配置／阶段 | 年大气水残差／原容限 mm | 年陆水残差 mm | 年干质量相对差 |\n|---|---:|---:|---:|\n';
for(const c of comparison.cases)text+=`| ${names[c.prefix]}／${c.stage.startsWith('five')?'六年积分统计年':'一年分支'} | ${f(c.budget.airWaterExcludingModeResidualMm,6)}／${f(c.waterLimitMm,3)} ${pass(c.waterPassed)} | ${c.budget.landLedgerResidualMm.toExponential(2)} | ${c.budget.dryAirMassRelative.toExponential(2)} |\n`;
if(long.length){text+='\n完整六年（含五年预热）累计预算：\n\n| 配置 | 大气水余项／原容限 mm | 陆水余项 mm | 干质量相对差 |\n|---|---:|---:|---:|\n';
 for(const c of long)text+=`| ${names[c.prefix]} | ${f(c.fullBudget.airWaterExcludingModeResidualMm,6)}／${f(c.fullBudgetChecks.waterLimitMm,3)} ${pass(c.fullBudgetChecks.waterPassed)} | ${c.fullBudget.landLedgerResidualMm.toExponential(2)} | ${c.fullBudget.dryAirMassRelative.toExponential(2)} |\n`;}
text+='\n另行进行的 30/15/7.5 分钟三天季节海温试验用于检查时间离散敏感性，不替换上述 30 分钟气候协议。峰值下降不等于残差严格趋零，结果与共同采样检查见 [时间步报告](timestep-convergence-report.md)。\n\n';
text+='![时间步诊断](timestep-convergence.png)\n\n';
text+='\n长期验收沿用旧矩形口径 `max(0.05 mm, 0.001*(|E|+P))`，未用新的离散账本替换原门槛。土壤深排水、径流、雪上限流出继续单列；固定干质量是数值约束，不能称为保守湿动力核心。\n\n';
text+='## 辐射与适用边界\n\n| 配置 | 全球反射短波 W/m² | 全球TOA净输入 W/m² | 全球降水 mm/day |\n|---|---:|---:|---:|\n';
for(const c of fields.cases)text+=`| ${names[c.prefix]}／${c.stage.startsWith('five')?'六年统计年':'一年分支'} | ${f(c.annualGlobal.outgoingShortwaveWm2)} | ${f(c.annualGlobal.toaNetWm2)} | ${f(c.annualGlobal.precipitationMmDay,3)} |\n`;
text+='\n全球净辐射并未因此自动趋零。当前短波云量耦合了原包 Frierson 灰体长波，其长波光学厚度按纬度与 sigma 规定，不响应水汽或云；这是理想化配置限制，不是完整 Fortran SPEEDY 辐射。规定 SST 外部供热继续明确计账，不能把模式运行稳定当作完整能量闭合。模型仍没有有限海冰水量／潜热库存，也没有可续跑统计 Observer 的完整检查点。采用原包 12 个月海温气候态，其观测基准期未核验；不是逐日实况海温。\n\n';
text+='区域雨量比较沿用未mask原生场 → 48×24 父格均值 → 固定 GPCC 有效陆地支持；不是原生纯陆水量积分。附加原生陆地重加权与海洋诊断仅用于机制判断，分别标注。月均 qv 通量由瞬时 p*q*v 累积，未用月均乘积冒充；区域平均通量向量本身也不等于水汽辐合。\n\n';
text+='## 运行与完整性\n\n首次 `baseline-sensitivity` 与 `clouds-full-sensitivity` 在首日主动终止：发现从恢复网格重新计算干质量目标产生约 7e−12 kg/m² 舍入差，会使无改动混沌轨迹分叉。改为恢复原目标后以 `-v2` 重跑，旧终止日志保留、不用作气候结果。其余运行源码和输入各有 before/after 散列、退出码及源码快照。早先启动的逐过程 replay 未应用后来增强的 launcher 自身／输入散列功能，不追认该功能；它有原 collector 递归源码绑定及逐值复现证明。\n\n';
text+='[机器比较](sensitivity-comparison.json) · [区域状态](candidate-fields.json) · [基线复放验证](baseline-replay-verification.json) · [旧证据保全](preservation-verification.json) · [长积分选择](candidate-selection.md)\n';
if(process.argv.includes('--final'))text+='\n[最终文件清单](manifest.json) · [完整性与科学门槛分列核验](verification.json) · [独立验收审查](final-review.md)\n';
await writeFile(`${folder}/report.md`,text);
console.log({report:`${folder}/report.md`,sensitivityCases:short.length,completedSixYearCases:long.length});
