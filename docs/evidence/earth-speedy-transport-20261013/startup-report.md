启动水量残差的时间口径与数值来源（2026-10-13）
================================================

启动 4.5 小时约 −0.22 mm 的大气水量残差主要来自账本时间口径：旧账本按时钟步长矩形积分 E−P，而大气用 Leapfrog/RAW 更新。用相同离散时间算子记录外部通量后，该时刻剩余约 +0.04317 mm。**这次只修正诊断，没有改变模型水量；仍有 5 个启动时刻超过原 0.05 mm 门槛，不能宣称每步守恒已修好。**

复现使用冻结的联合物理修复模型、相同 2001-01-01 初态、T32／8 层／名义 1800 s 步长。自由海温 slab 和规定季节海温 seasonal 各完整积分三天、145 次大气更新。两组全部时刻水量与旧 `audit-coupled-mass-fixed.json` 完全相同（最大差为 0）。正式配置、原包、旧证据和旧产物未修改。

| 指标 | slab | seasonal |
|---|---:|---:|
| 矩形账本最大绝对残差 mm | 0.219777513559 | 0.220164381247 |
| 上述时刻及残差符号 | 第一天 04:30，负 | 第一天 04:30，负 |
| 离散通量账本最大绝对残差 mm | **0.062586677681** | **0.062579318977** |
| 上述时刻及残差符号 | 第一天 03:00，正 | 第一天 03:00，正 |
| 矩形账本超过原门槛的步数 | 19／145 | 19／145 |
| 离散通量账本超过原门槛的步数 | **5／145** | **5／145** |
| 离散残差绝对值小于矩形残差的步数 | 93／145 | 94／145 |
| 三天矩形残差 mm | −0.006368569839 | −0.006082760002 |
| 三天时间错层贡献 mm | −0.016829585887 | −0.016774792889 |
| 三天离散通量残差 mm | +0.010461016048 | +0.010692032887 |

原门槛保持 `max(0.05 mm, 0.001*(abs(累计矩形 E)+累计矩形 P))`，本次所有时刻均为 0.05 mm。两模式离散残差超限时刻相同：第一天 02:00、02:30、03:00、03:30、04:00。slab 相应残差为 +0.057041866、+0.061440807、+0.062586678、+0.059751057、+0.051162273 mm。03:00 的旧矩形残差仅 −0.033329250 mm；所以修正时间口径并不保证每个时刻的绝对残差下降，更不是物理轨迹改善。

三个量在所有输出中并列保留：

```text
rectangularResidual     = ΔW − rectangle(E−P)
timeStaggerContribution = Leapfrog_RAW(E−P) − rectangle(E−P)
discreteFluxResidual    = ΔW − Leapfrog_RAW(E−P)

rectangularResidual = timeStaggerContribution + discreteFluxResidual
```

第一天 04:30 的分解为：slab `−0.219777513559 = −0.262951703847 + 0.043174190288` mm；seasonal `−0.220164381247 = −0.263339424978 + 0.043175043731` mm。时间错层贡献不是物理源汇，不应改名为蒸发、降水或数值修水。

对每个原生阶段读取独立的光谱逆变换副本，按更新顺序分解水库存 `W = Σ area * exp(log p_s) * Σ(q Δσ) / g`。各过程的标量贡献也通过相同 Leapfrog/RAW 记忆递推，避免把交替时间层贡献直接累加。下表是 04:30 的累计离散贡献，单位 mm；它们的和等于离散通量残差。

| 来源 | slab | seasonal |
|---|---:|---:|
| 动力倾向（以保留时间层的湿质量线性化） | −0.005964509831 | −0.005950533482 |
| 半隐式压力倾向 | **+0.052260626406** | **+0.052259370050** |
| 半隐式湿度倾向 | 0 | 0 |
| 水平扩散 | +0.000329466084 | +0.000328944833 |
| 有限压力／湿度乘积非线性 | −0.003815002140 | −0.003823915793 |
| RAW 对非线性库存的贡献 | +0.000003644856 | +0.000003596984 |
| 物理倾向光谱投影及保留层压力权重差 | +0.000023737646 | +0.000023905937 |
| 当前诊断网格负湿度裁剪 | +0.000336227266 | +0.000333675202 |
| 保水干质量约束 | −2.10e−13 | −4.93e−15 |
| 初始光谱／网格库存差 | 0 | 0 |
| 合计 | +0.043174190288 | +0.043175043731 |

局地物理守恒与上述数值余项是不同层次的问题。冻结的凝结、保水质量和垂直混合回归证据继续成立。本次三天耦合回放另外验证：面积加权的物理湿度倾向积分与地表 E−P 通量的最大差分别为 1.0842e−19、8.1315e−20 mm/s。该检查是全域物理倾向账本，不能冒充对每根柱子的新测试。半隐式修正前后的湿度倾向逐步完全相等；压力倾向却发生改变，从而改变压力加权水库存。最大离散残差的 03:00，slab 半隐式压力贡献 +0.094127782057 mm、动力贡献 −0.030913759578 mm，二者大幅抵消后仍超限。负湿度裁剪和 RAW 非线性并非此次峰值的主要来源。

这些归因依赖记录的原生操作顺序；有限乘积余项与线性项的划分不是唯一的连续物理分解。不过其逐步代数和严格重建实际库存：两模式最大归因闭合误差分别 2.59e−14、2.68e−14 mm。三天终点全部分项与每步记录保存在 `build/earth-speedy-transport/startup-budget-analysis.json`，未用终点的小残差掩盖启动失败。

后续若要逐步消除此余项，需要湿质量输送、压力演化及半隐式修正的一致离散设计。本轮未增加全局湿度缩放、补偿源汇或新参数。陆地／海洋采用 Euler 时钟步，Leapfrog 大气保留两个时间层；仅为大气通量换用正确账本，仍不能证明陆海与大气逐步共同守恒。长期运行的旧矩形账本验收必须保留原口径，不能与这里的新离散口径混为同一个验收。

可复用的纯标量 helper 是 `startup-ledger.jl` 中的 `StartupFluxBudgets` 模块，没有 SpeedyWeather 依赖、模型方法覆写或模型状态修改。示例：

```julia
include("startup-ledger.jl")
using .StartupFluxBudgets
b = LeapfrogFluxLedger()
# 每次物理倾向计算后，传入更新前的 clock.step_counter。
advance_flux!(b, evaporation_minus_precipitation_mm_per_second;
    nominal_dt=1800.0, step_counter=counter,
    robert_filter=0.1, williams_filter=0.53)
row = budget_residuals(b, current_water_mm - initial_water_mm)
saved = ledger_snapshot(b)           # 保存两个记忆量、矩形量及计数器
b = restore_ledger(saved)           # 也接受 JSON3 反序列化后的对象
```

两个启动时钟半步分别走 900、900 s，但大气更新跨度为 900、1800 s；此后时钟走 1800 s，大气更新跨度为 3600 s。RAW 系数启动时为零，此后使用 `w1 = robert*williams/2`、`w2 = robert*(1−williams)/2`。helper 直接接收每次模型通量和实际模型参数；`nominal_dt` 是秒，不是按半径缩放后的动力时间。断点恢复必须同时恢复 ledger，不能只保留当前累计值。诊断 trace 为观测原生阶段而在独立进程覆写时间步函数；生产可复用 helper 不覆写任何模型方法。

验证证据：

- 原矩形算法对真实 `SW.leapfrog_kernel!` 的变化通量测试：1 通过、5 失败，见 `startup-ledger-red.log`。
- helper 对同一原生内核、两个启动半时钟、常量通量及 5 个不同断点恢复测试：**32／32 通过**，见 `startup-ledger-final-green.log`。
- 独立后处理用 helper 重新计算两个完整三天轨迹，并验证冻结水库存、矩形账本、每步物理闭合、隐式湿度为零、三项恒等式和全量归因：**2322／2322 通过**，见 `startup-analysis-verification.log`。
- 两个实跑、最终 helper 测试及独立分析的 `*-status.json` 均为退出码 0、`sourceUnchanged=true`。
- `startup-preservation-verification.json` 记录对旧 manifest 中冻结证据、旧产物、原包源码和归档的只读散列复核，并绑定本次 `startup-*` 文件；验证程序为同名前缀的 `.mjs` 文件。

重新运行须使用新标签，避免覆盖现存结果。工作目录为仓库根目录；`startup-run.mjs` 固定使用既有 Julia 1.12.7、既有项目／depot、2 个 Julia 线程和 1 个 BLAS 线程。示例 PowerShell 命令：

```powershell
$env:STARTUP_MODE='seasonal'
$env:STARTUP_STEPS='145'
$env:STARTUP_LABEL='new-seasonal-label'
$env:STARTUP_DATA_LABEL='new-seasonal-label'
node docs/evidence/earth-speedy-transport-20261013/startup-run.mjs
# 独立分析读取已冻结的两条 trace-split-* 三天结果。
$env:STARTUP_LABEL='new-analysis-label'
node docs/evidence/earth-speedy-transport-20261013/startup-run.mjs docs/evidence/earth-speedy-transport-20261013/startup-analyze.jl
```

本报告只审计冻结的上一轮联合物理模型，不提前声称新对流／云量实验的水量表现，也未开始新的六年积分。
