# 独立复核：coastal-deposition-v2

复核日期：2026-10-11。基点：`e3222280a0ceddd597245f3c45d75f75d2def9f5`；对象为当前未提交改动及实际积分证据。复核仅读取产品、测试和证据；补充实验使用 esbuild `write:false` 在内存中运行。按后续授权另写 build 下的可重跑复现脚本，没有修改产品、测试或运行中的积分证据。

**最终代码复核结论：本次 Important 兼容问题和 Minor 展示问题均已验证关闭，未发现尚未解决的 Critical/Important/Minor 代码缺陷；没有确认主积分路径存在质量或能量重复入账。气候整体验收仍未通过，不能把守恒或恢复成功表述为气候真实性已经通过。**

## 已修复发现（保留原始证据）

### Important：旧细分 transport 存档重新保存后不可恢复

**修复状态：已验证解决。** 最终方案撤回将 patch 推导量写成实际记录的做法。旧细分 transport 缺字段时保持 `landPrecipitationKnown=false`，内部估计受已保存 snowfall 下限与总雨量上限约束，checkpoint 继续省略该字段，探针明确显示分配不可用。下一次真实物理步才令 known=true 并记录实际陆地量。共享 `oldRefinedLandEstimate` helper 同时覆盖 fromSnapshot 与 presented-frame rollback；remapTerrain 保留 known 标志。

边界复核还覆盖旧代码在不规则海岸做过 `enableRefinement('high')` 的存档：这种 rain/snowfall 几何搬运无法精确反推陆地份额，因此保留未知是必要的。`node build/earth-moisture-structural/reproduce-old-refined-transport.mjs` 及其 `--remap` 分支现在均以 exit 0 通过：载入、保存、再次载入；未知估计不序列化；真实 sync 呈现帧回滚恢复完整旧快照；下一步两份快照完全相等，且新实际分配恢复为 known。旧模型重分区后的水量残差 `-5.8208e-10 mm`、焓残差 `-3.8806e-6 J/m²`。下文保留首次发现和修复前复现。

位置：`water.ts:474` 的缺字段回退、`water.ts:465` 的无条件新增 transport 陆地降水字段，与 `runtime-state.ts:123` 的雪量校验共同触发。

旧版 RefinedSurface 的降水按局地地形权重分配，真实落到陆地的雨雪可以超过 `totalPrecipitation * parentLandFraction`。当前恢复在字段缺失时仍使用这个均匀分配值，随后 checkpoint 将它当作实际陆地降水保存。新雪量校验因而拒绝原本合法的旧细分存档。

独立复现使用冻结的 `build/earth-moisture-structural/baseline-water.ts` 与真实细分海岸 fixture，在配平初始水量和热量后推进一步，生成旧格式存档。其最大 `snowfall - totalPrecipitation * landFraction` 为 `0.00010885147564293946 kg/m²/s`。当前代码第一次 `ThermalRuntime.fromSnapshot` 成功；对恢复结果执行 `snapshot()` 后再次 `fromSnapshot`，抛出 `Snowfall exceeds precipitation on land`。这不是人为构造不守恒库存的结果。

可重跑命令：`node build/earth-moisture-structural/reproduce-old-refined-transport.mjs`（仓库根目录）。脚本固定旧水模型及基点 Git 对象中的旧细分沉降实现，使用真实一步 coupled integration；该步水量残差 `1.6298e-9 mm`、焓残差 `-2.1687e-6 J/m²`。脚本也检查首次启用细分的陆海显示；修复后将自动检验 load-save-load 和下一步快照完全相等。它仅在内存中生成 fixture，不改产品、测试或积分证据。

修复建议：旧细分存档缺少陆地降水字段时，利用已保存的 refined rain 与 patch land/area 重建旧算法的真实陆地份额；或明确保留“分配未知”的状态而不序列化伪造值。增加由旧细分沉降算法产生的 load-save-load 和 next-step 回归测试。只覆盖未细分旧存档的均匀回退不足以检验此情形。

### Minor：首次启用细分会把已记录陆海降水重新显示为均匀降水

**修复状态：已验证解决。** transport create 现分别按已记录陆地/海洋量在各自 patch 面积内分配；legacy 保留原算术表达式。冻结旧源复现脚本中的第二项检查现得到记录/显示陆地均为 8、海洋均为 2。下文保留首次发现。

位置：`refinement-surface.ts:47`，由 `thermal-runtime.ts:246` 的首次 `enableRefinement` 路径调用。

`RefinedSurface.create` 仍以 `totalPrecipitation * patchArea` 初始化局地 rain。新增陆海实际落雨率虽然留在 WaterModel 中，局地细分雨场却没有保留它。内存 fixture 中，50% 陆地海岸母格的记录为总降水 10、陆地 8、海洋 2；首次启用 balanced refinement 后，母格陆地记录仍为 8，局地雨场对应的陆地量却为 5。暂停时局地“最近一步降水”会误报，直到下一次物理步刷新。此问题不改变库存。

修复建议：首次建立细分雨场时，将记录的陆地/海洋份额分别按对应 patch 面积归一分配；保留 legacy 行为。增加首次 enableRefinement 的测试；现有质量切换测试覆盖的是已经细分后的 remap。

## 已确认的修复和守恒结构

- 上轮缺海纬度行问题已通过相邻海洋纬度插值及陆地纬向温度回退修复；完全陆地世界不再统一退回全球常数。
- 上轮恢复后归因数组失效问题已增加 `precipitationComponentsValid=false` 并清空数组；下一次真实步才恢复有效状态。
- 双向 eddy parcel 在修改任一端前采样两个供体量；每方向交换比例不超过 1/2。上坡和锋面凝结各自从有限交换量中扣除；列云降水按陆海面积加权后只从共享水汽扣除一次。
- 海洋供体的山地凝结移至受体陆地；陆地供体的上坡凝结留在供体。`landRain + seaRain = totalRain`；粗模式湖泊分配从海面份额再分出，细分模式分别归一陆地与海面沉降，没有把同一份雨同时写入陆地和海洋。
- 凝结潜热使用总雨量一次，冻结潜热使用实际雪量一次；细分库存聚合是母格视图而非新增库存。未发现这轮改动造成重复或遗漏的潜热项。
- saved wind 仍使用原模板偏移约定；新陆地降水字段仅在 transport 且分配已知时保存，legacy 正式存档形状未增加该字段。上述旧细分兼容例外现已通过复核。

## 实际证据及其边界

最终读取的 `tests.log` 为 **241/241 通过**；对应 `typecheck.log` 无编译错误，`build.log` 明确记录构建成功。修复复核另外读取 `refinement-compat-green.log`，三项回归测试全部通过；上文两个冻结旧源独立脚本也全部通过。复核没有重跑会覆盖运行证据的命令。

`coastal-deposition-v2-1800-continuous.json` 已到 365 天，`strictRestoreNextStepExact=true`。末态独立水量残差 `4.4471e-8 mm`，焓残差 `-2.1195e-4 J/m²`，最大单格水汽残差 `2.3874e-11 mm`。这是所测积分的预算和继续积分一致性证据，不代替气候验收。

直接比较 baseline/candidate 保存的 day-zero 空气、陆地、海洋温度以及全部水库存，结果完全相同。候选 1800/900/450 s 记录的初始库存 SHA-256 均为 `51961e8bb0611e0e79c7d4bef14a379c6ca8db2072c3f45f205d0e79cb5b93f5`。**baseline 的旧 harness 原始结果没有 initialStocksSha256 字段**；新的 bindings 校验从保留的原始 day-zero 快照独立推得同一 SHA，并逐字段核对原始初态（仅步长与新增沉降诊断允许差异）。这不是补写或改写 baseline 原始数据。

GPCC 对比使用同一有效观测交叠与同一模型陆地权重。候选使用实际陆地落雨量除以陆地比例；baseline 旧沉降均匀，因此旧列雨量就是对应陆地深度。全区域水汽账仍用总列降水，未把陆地条件深度错误放入全格预算。

1800 s 全年结果仍明确失败：India 年净水汽输送为 **-146.06 mm**；澳大利亚西南 JJA/DJF 为 **3.78/372.56 mm**，冬夏次序错误。India JJA 从 baseline 137.88 改善至 304.14 mm、喜马拉雅前缘年雨量 978.83 大于 Tibet 25.96 mm、澳内陆 646.65 小于东岸 1267.15 mm，均不能抵消未通过项。Tibet 相对 GPCC 257.39 mm 严重偏干；Amazon 年雨量由 1862.27 降至 1794.79 mm，相对 GPCC 2292.71 mm 的绝对偏差增加约 67.48 mm，必须报告其退化而不能笼统声称热带没有变差。

沿岸指标是区域内 signed net face transfer 乘陆地比例差的代理量，已在 harness 方法说明中披露。它包括在受体凝结的水，排除供体陆地截留；不能称为历史海洋来源示踪或独立测得的真实海岸输送。“gross in/out”是净面通量的正负部分，不是两个方向 parcel 的总交换量。

动力闭合仍是海洋纬向虚温与正局地浮力、外加规定纬向目标；没有预报气压、空气质量或动能预算。固定 lapse/isentropic front、容量函数和粗平均地形均为物理近似；正性与守恒不证明这些近似能正确重现季风。对称算子顺序也不自动证明带非线性凝结的完整系统已达到某一收敛阶。

### 最终三步长及报告核对

1800/900/450 s 三组候选现均完成 365 实际日，三组及 baseline 均有 `strictRestoreNextStepExact=true`。独立从原始记录重算并核对 comparison 的九区年雨、JJA/DJF、净水汽输送：450/900 s 最大年雨绝对差为 **4.436313282 mm**，最大相对差（分母为 450 s）为 **0.702363370%**。三个步长所有方向判定一致。季节求和在跨语言复核时仅有约一个 Float64 ulp 的舍入差异，不影响报告数字或判定。

以 450 s 最终结果为准，India 年雨 **537.5715 mm**、JJA/DJF **300.8152/8.3102 mm**、全年净水汽输送 **-151.1595 mm**；澳西南 JJA/DJF **3.8102/381.5468 mm**。报告正确保留供水与季节性失败，没有用时间步差异小替代 GPCC 整体验收。Amazon 年雨 **1798.9417 mm**，相对 baseline 的绝对年偏差增加 **63.3253 mm**；Congo 年雨 **1630.5830 mm**，绝对偏差减少 **266.5947 mm**。上文 1800 s 数字保留为该步长的原始检查记录，与最终 450 s 数字不混用。

报告中的年雨/季节表、方向主张、低层风符号和实测步长差异与数据相符；预算表明确是六个记录时刻的最大值，没有冒称逐步保存独立全库存预算。沿岸代理量、瞬态一年、未采用候选与 reference 探针的边界均有披露。物理措辞需保持：陆海表面温度分别影响抬升，但气柱水汽/湿度共享，不存在两个独立陆海湿度库存。

独立只读核对了 comparison 来源 SHA、bindings 中四组积分 bundle 与全部保存快照 SHA。另直接读取最终源和冻结全年 bundle 的 day 0/day 24 保存文件，验证完整 runtime 逐字段完全相等，且文件 SHA 与 `final-source-equivalence.json` 一致；最终源 24 天积分自身也记录严格下一步恢复成功。此等价性仅陈述所测两时刻与恢复检查，未冒称另用最终源重跑三组全年。

## 正式默认与未判定项

逐字节 SHA 比较确认 `earth-simulation.json`、`config.js`、`environment.ts`、`surface-grid.ts` 均与 HEAD 一致。正式 Earth JSON SHA-256 为 `afb80a8ab730785eed0cb709a66d938ad20a9690b04ecfa1246d1deb393adca6`。实验在恢复副本中启用 transport/airRadiationFraction，并未写回正式默认。

**Declined to judge：**仍没有健康 WebGL 帧，因此不判定实际渲染健康、前后截图等价或像素正确性；数值图表不能代替该验证。三步长全年数值差异现已实测，不再属于未完成项；非线性系统的严格收敛阶与多年气候平衡仍未证明。外部 WebGL 阻塞不列作代码缺陷。隔离的 surface-anomaly、boundary-anomaly、friction-balance、boundary-parcel、marine-friction 候选不属于本次主代码验收对象。

修复复核通过时核心源文件 SHA-256（用于区分后续改动）：

| 文件 | SHA-256 |
| --- | --- |
| water.ts | `754b5fcdce9a453d845da6d5a53ddcd920918f329533f280e778bb7a20315f39` |
| circulation.ts | `42ad6555ff02d686b7510b23f3fe4b49144ec499f2cd0d49aea8b230e0e40698` |
| refinement-surface.ts | `99acd9200b3c001d177b28e43c09553224e3788760d7ff72df52375364683f6c` |
| runtime-state.ts | `092d95aa78a267c281a5d1c0f59e9ecfe57f20b9ce5485cee2ea67ccda7fbc98` |
| thermal-runtime.ts | `15fd9478705c7cc67ed1380e1819897d0d619c9ba09d0e0eade50308496a5d78` |
| planet-controls.ts | `ea24bd8d0b23b13b8710b9a4892f00c53dfcce3692fa9bdcc06b6ea0114d5034` |
