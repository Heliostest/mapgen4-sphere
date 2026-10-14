# 分离动力参考与半隐式数值参考：独立候选

日期：2026-10-13。旧包、V2 include、driver、协议、两套失败轨迹均保持不变。

## 结论和适用范围

保持原动力参考廓线及其完整离散 RHS，仅把半隐式矩阵参考改为已有 `atmosphere.reference_temperature=288 K` 并配对压力时间层，可以跨过两次已复现的 2006 年负温失败。两份原始首坏前 48 h checkpoint 各运行 96 个原生 30 min 步；没有温度截断、没有改雨量参数、没有清理压力辅助谱行。这是针对两个真实失败窗口的可选数值稳定性候选，不是全年/六年稳定性验收，也不是湿质量守恒修复。

初版 `implicit-split-reference.jl` 永久保存为 SHA256 `224ce07c9552709f31c2e74521e3624ae5894c2a7319ca404faed59c11124d31`。它用于上述恢复既有固定参考的窗口。最终入口 `implicit-split-reference-v2.jl` 只另行修正新鲜启动参考捕获时机，SHA256 `22f9ef9c91190285d6aafc543abce8c6e706d11662a907a3eab4dd6cd02bfcfd`。两个文件定义相同类型，入口只能 include 其中之一。

## 分解公式

动力仍读取 `c.temp_profile = T_dyn`；背景垂直平流也只补回 `T_dyn`，恰好一次。数值求解器 `c.inner.temp_profile = T_si` 为既有 288 K。`R`（静力积分）及 `W`（层厚加权连续性）不依赖该参考，保持不变。`U_si=-R_d T_si`，`L_si` 使用已验证的完整温度线性化。

原生动力在散度原始倾向中已经包含 `λ U_dyn (p_old-p_current)`，其中 `p=ln(p_s)`，一基谱度数 `λ=-l(l-1)`。进入原生隐式核前只增加：

```text
Δ Ḋ = λ (U_si-U_dyn) (p_old-p_current)
```

没有额外乘除时间步或行星半径，因为这是原生已按半径缩放的倾向。原生隐式核随后自行增加 `L_si(D_old-D_current)`，并通过原有块消元求解温度、散度和压力。该实现直接调用 `c.inner.inner` 的原生核，避免再次经过带背景补回的 Consistent wrapper。`enabled=false` 或 `centering=0` 时只保留原已验证背景补回，不施加压力重新分解或 SI 求解。

完整当前动力 RHS 不随 SI 参考变化。`old=current` 时新增压力项为零；`old≠current` 时该项把同一个完整当前 RHS 正确拆到新数值线性算子。原有湿虚温项、地形、环格、物理参数化与 RAW 均未改动。

## 接口和参考捕获时机

```julia
include("implicit-corrected.jl")
include("implicit-split-reference-v2.jl")
c = SplitReferenceImplicit(sg; centering=1.0, enabled=true)
```

与旧 Consistent wrapper 同样受 CPU、原生 Leapfrog、纯 sigma、顶部 sigma=0、二阶中心垂直平流限制。温度参考必须有限且为正。数组初始化为零，避免首次原生初始化前读取未初始化内存。

跨物理 2006 checkpoint 恢复时显式保留其动力参考和原生时间跨度：

```julia
SW.initialize!(c, previous.Δt[] / vars.prognostic.scale[],
    previous.temp_profile, model.geometry, model.geopotential,
    model.atmosphere, model.adiabatic_conversion)
c.Δt[] = previous.Δt[]
```

新鲜 2001 启动的原生 `reinitialize!` 在 counter 0、1、2 分别看到 900、1800、3600 s 跨度。V2 每次跨度变化都会捕获当时 `average_temperature_profile`，之后跨度相同便保留。初版候选错误地首次捕获后永久保留；同一条完全未修改 V2 启动轨迹的影子探针测得 counter 1/2 的偏差分别 0.1499432771/0.3108793838 K，因此最终版本恢复 V2 的刷新算法。

新算法要求捕获规则相同，不要求实际新候选轨迹前三步的平均温度强行等于旧 V2 轨迹。新 SI 已改变积分结果，后续平均温度自然可以不同。恢复 checkpoint 的 `Δt` 已与当前跨度相同，因此直接返回，保留传入旧参考；只有原生跨度发生变化才重新捕获平均温度。此前两个 48 h 窗口始终为 3600 s 跨度，初版和新版的上述差异不会进入其时间步路径。

## 测试与失败到通过证据

- 第一组对原 Consistent 的 RED：512 pass / 128 fail / 0 error。新候选原生 kernel 与独立 17×17 块求解器匹配后 650/650 通过。涵盖 Float32/64、均匀/非均匀 sigma、两半径、开关、α=0/0.5/1、相同/不同时间层和双 profile 序列化。
- physics_review 独立原生核与 RAW 验证 2796/2796；最大相对误差分别 1.86e−15 / 1.81e−15。独立真实湿场、地形、非零背景和平流验证 1074/1074，五完整倾向逐位相同，启用时 528 个有效谱系数按独立块 LU 求解核对。
- 上述独立验证也对最终 v2 hash 重新运行：2796+16 项块方程/RAW/启动恢复检查、1074 项湿场检查全部通过；最终日志为 `physics-split-reference-test-v2-final.log`、`physics-split-reference-grid-test-v2.log`。新增 36 项验证直接把 34 个基扰动送入真实新 wrapper → 原生 HyperDiffusion → 原生 RAW，在真实 thermal 故障列前 48 h 正温剖面、一基 degree=21 下测得放大谱半径 0.9960449540606123，与解析 0.9960449540606113 相符，映射相对差 2.36e−15。此局地干平坦静止验证同样不代表全部非线性气候轨迹。
- 每个真实 48 h 窗口 15/15，含输入 stock hash 一致、五完整动力+背景倾向逐位一致、非零 w、96 步及最终时刻。`implicit-split-window.jl` 全程调用原生 `SW.time_step!`。
- 真实启动刷新 RED 来自 `implicit-split-startup-verify.mjs` 对上述影子探针的断言，counter 1 实测非零差直接失败。最终版本 `implicit-split-v2-test.jl` 为 651/651 GREEN；新版真实轨迹影子探针的三个跨度差均为 0，四项独立捕获检查通过。另对两个短窗时钟、全层极值、压力辅助行原样、两个库存各自账本和新版启动捕获共做 1940 项 JavaScript 独立复核，全部通过。新版文件不覆盖旧证据。
- `implicit-split-startup-red.log` 是测试草稿一次误沿用旧参考断言的 651-pass 运行，名称有误，**不作为 RED 或最终验收证据**；该草稿原文已按其 hash 保存于 source-archives。真正 RED 是 `implicit-split-startup-real-red.log` 的实轨迹断言失败。

## 原始失败窗口对照

| 量 | thermal（combined+thermal） | all-corrections |
|---|---:|---:|
| 原始起点 | 2006-02-26 05:30 | 2006-03-04 17:30 |
| 原始首坏/本次终点 | 2006-02-28 05:30 | 2006-03-06 17:30 |
| 原方案首坏最低温 / K | −89.7908 | −33.3437 |
| 候选全窗最低温 / K | 186.6385 | 192.7823 |
| 候选全窗最高温 / K | 303.9332 | 304.7661 |
| 候选最大名义垂直 Courant | 0.126123 | 0.108988 |
| 全场动力+背景 T/ζ/D/p/q 最大差 | 五项均 0 | 五项均 0 |
| 诊断网格水矩形残差最大绝对值 / mm | 0.0198423 | 0.00350814 |

谱系数的压力辅助行原样保留，最大绝对值约 3.2822845e−5。它是另一条已识别离散恒等式污染证据，不是本次候选修正的对象。保留它可隔离本次 SI 时间分解的效果。

另外输出原始谱 `p*q` 库存的两时间层离散账本，最大残差为 0.000696184/0.00173724 mm。账本以 checkpoint 的旧/current 两份库存初始化，保留已有斜率。这与经原生负湿度裁剪的诊断网格库存不同；例如 thermal 终点分别为 21.88346 与 22.09154 mm。因此不能把较小的谱库存残差替代此前诊断网格水门槛，也不能宣称此候选修复了湿质量守恒。完整物理通量、两库存、两个残差、压力模式水账和每步极值均在窗口 JSON 保留。

## 仍未证明的范围

这些短窗和线性核证据支持候选可进入新的独立三天/长期验证，不保证全球所有温度状态或气候轨迹稳定。独立局地谱扫描中，即使该等温 SI 参考消除了相关负实计算模态，仍有少量弱复模态增长；不能据此宣称全局稳定定理。当前候选没有改湿载体/压力配对输送，原有湿质量离散限制仍在。原包、冻结 V2 轨迹和六年协议不被此候选替换。
