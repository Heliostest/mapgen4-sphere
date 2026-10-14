# 半隐式动力离散后续核查（2026-10-13）

结论：找到并以原生显式核确定性复现了两个**热力动力算子**问题，已做可选、独立分派的配对修复；没有找到可简单接通的原生湿度隐式项。压力和湿度的共同载体质量离散仍是架构限制。本修复不等同于大气水残差修复，不改变先前启动水账本的失败判定。

本轮只新增 `implicit-*` 文件。安装包、旧 moisture-monsoon 证据、已运行的模型 include 和运行脚本均未编辑。以下行号对应安装的 SpeedyWeather 0.23.0 `qRu16/src`。

## 确证问题及 RED

`time_stepping/implicit/implicit_primitive_equations.jl:186–209` 构造温度矩阵 `L`；它由背景温度垂直平流和绝热转换两部分组成。原 `L1` 中两项累计散度减法没有乘相邻温差，而且用了全层 sigma，符号也不符合原生二阶中心垂直平流核。不能仅凭非零矩阵就认定错误，因此测试直接调用安装包 `vertical_advection_kernel!` 和 `_temperature_tendency_kernel!`，对逐层散度施加 ±1e−6 的中心差分，独立得到实际显式雅可比。

| 8 层测试 | 等温 280 K | 分层 210、215、225、240、255、270、282、292 K |
|---|---:|---:|
| 原生显式核与原生绝热矩阵最大差 | 3.55e−15 | 3.55e−15 |
| 原 `L` 与实际显式雅可比最大差 | 1.0 | 8.34375 |
| 完整温度垂直核减实际温度异常垂直核 | 约 5.42e−14 | 9.1875 |

单位均为温度倾向对散度的系数，即 K。等温场垂直平流应为零；从 `L` 减去已独立验证的绝热部分，再作用于各层相同散度，原生结果为 `[-0.5,-1.5,…,-7.5]`，正确结果为数值零。这排除了“`L1` 还包含其他绝热项”的解释。

第二个问题在 `dynamics/tendencies.jl:125–170`：当前温度先减 `implicit.temp_profile`，其后 `vertical_advection!` 读取当前温度异常；直到动力倾向完成才加回背景。水平常量背景没有水平梯度，但分层背景有垂直梯度。原生温度核的绝热项重建了完整虚温，却没有恢复 `−w ∂Tref/∂σ`。半隐式核只加 `L(Dold−Dcurrent)` 和 `ξ L δD`，这不是完整背景源项。分层场原生核差值 9.1875 K 明确复现遗漏。

有效 RED：`implicit-matrix-native-red.log`，2 通过、3 失败，退出码 1，源文件运行前后 hash 一致。原测试存档 `implicit-test-red.jl`；状态内原测试路径为当时的 `implicit-test.jl`，其 hash 与存档相同。早期 `implicit-native-red.log` 只是测试脚本语法错误，不作为 RED 证据。

## 配对最小修复

新组件 `ConsistentImplicitPrimitiveEquation` 位于 [implicit-corrected.jl](implicit-corrected.jl)，不替换安装包方法。其 SHA256：

`1af4513f14c7f66a42a3253f7288df18e84d7d1c4757edff0aadfa43949275d2`

记 `ds[k]=Δσk`，`h[k]` 为上界面 sigma，`Tref[k]` 为参考温度；纯 sigma 顶底边界为 0、1。对水平均匀参考态，原生连续方程给出：

```text
Mb[k,r] = (h[k+1] − 1[r≤k]) ds[r]
Ma[k,r] = (h[k]   − 1[r<k]) ds[r]
V[k,r]  = −[(Tref[k+1]−Tref[k]) Mb[k,r]
             +(Tref[k]−Tref[k−1]) Ma[k,r]] / (2 ds[k])
```

越界温差和边界通量置零。该 `V` 严格来自原生二阶中心重构；常温 `V=0`，同层散度 `V·1=0`。用 `L = V + Ladiabatic` 重建 `S⁻¹`，保留原生 `R,U,W` 和求解核。

仅改矩阵仍不足以修复显式源项。因此组件在半隐式纠正入口用原生当前 `w` 和原生二阶中心核计算一次参考温度平流，变换至谱空间后加入温度倾向，再调用未改的原生半隐式纠正。背景 scratch 每次清零；没有额外乘时间步或半径。`w` 已含当前动力时间层和半径缩放，也含当前压力梯度项，因此有地形时不能仅用 `V*D` 替代这个完整补回。

这两项必须配对：矩阵反映完整温度方程的线性化，显式入口也必须先给出该完整方程，之后原生 `L(Dold−Dcurrent)` 才能正确移动线性项的时间层。修复没有添加湿度、压力或动量的直接残差补偿。

接口与组合：

```julia
# components.jl 已定义 const SW = SpeedyWeather 时直接 include；不要重复定义 SW。
include("implicit-corrected.jl")
implicit = ConsistentImplicitPrimitiveEquation(sg; centering=1.0, enabled=true)
model = SW.PrimitiveWetModel(sg; implicit, other_components...)
```

支持范围显式限制为 CPU、原生 Leapfrog、顶界 sigma=0 的纯 SigmaCoordinates、二阶 CenteredVerticalAdvection。验证使用 Float64；不声称 GPU、Float32、混合坐标或其他垂直格式已验证。

初始模型随原生 reinitialize 生命周期初始化。续接既有 checkpoint 时，新变量必须按新组件分配其 scratch；复制其他组件时跳过旧 `implicit`。为了只改变此修复，保留 checkpoint 原有参考廓线和物理时间步：

```julia
SW.initialize!(new_implicit, model)  # 检查所支持的配置
SW.initialize!(new_implicit,
    saved_implicit.Δt[] / vars.prognostic.scale[],
    saved_implicit.temp_profile,
    model.geometry, model.geopotential, model.atmosphere,
    model.adiabatic_conversion)
new_implicit.Δt[] = saved_implicit.Δt[]
```

不要复制旧 `L` 或 `S⁻¹`。普通初始化第一参数是缩放后的时间步，而组件 `Δt[]` 缓存物理秒；startup counter 0、1、2 分别使用半步、一步、两步。原生 reference 只在时间步变化时更新；在 2006 分支沿用已保存的 2001 reference 避免额外改变线性化方案。完整垂直平流的拆分不依赖参考廓线来源，但有限步长的半隐式近似本身可以依赖参考廓线。

`enabled=false` 或 `centering=0` 关闭半隐式纠正但仍补完整背景平流。它们保留原生 LinearDynamicalCore 的旧时间层选择，不能解释为整个模型已切换为全当前层显式积分器。

## GREEN 与验证边界

`implicit-fixed-final-green.log`：**1134/1134**，退出码 0；`implicit-fixed-final-green-status.json` 确认测试、wrapper 和核源运行前后不变。

矩阵/线性波 1014 项包括均匀和非均匀层厚、等温和分层 reference、α=0/0.5/1、enabled 开关、两个行星半径、900/1800/3600 s，以及三个谱波数。新 `L` 与原生完整显式核的有限差分雅可比最大差 5.42e−14；原生半隐式核与独立 17×17 联立块矩阵求解最大差 4.30e−13。α≥0.5 的测试线性波放大率最大 1.0000000000000069。α=0/disabled 只验证代数极限，不声称显式重力波稳定。

真实 `Variables` 与原生核 120 项包括非均匀层厚、0/1200 m 地形所产生的压力场、不同旧/当前时间层、两个半径、两个 startup 半步、正常两步跨度。对同一真实当前温度场，分别使用两套不同 reference，`native(full T)` 等于 `native(T−Tref)+restored native(Tref)`；重复调用前重置倾向验证不会积累 scratch。补回函数不改变温度状态和气压状态。

早期 `implicit-fixed-green.log` 中 24 个失败来自测试把 T8 的默认分辨率缩放时间步误当成固定 1800 s；修正测试时钟后全通过，wrapper 没有为此修改。该失败不是另一项模型物理 RED。

这些是算子、原生 kernel 和配置组合测试，不是整段新物理积分。没有用本修复重跑三天启动验收，也没有启动新六年运行。单柱物理水闭合和动力湿质量余项必须继续分别报告；旧候选最大离散水残差约 0.06254 mm 不由这些测试推翻。

## 湿度隐式项和时间层核查

原生整个 `time_stepping/implicit` 没有 humidity、humid 或 tracer 项。`implicit_primitive_leapfrog_kernel!` 只写散度、温度、对数表面压力，没有遗漏调用的现成湿度矩阵。

`steppers/leapfrog.jl:55–60` 明确规定 DynamicalCore 读取 current（2），LinearDynamicalCore 读取 old（1）。`dynamics/tendencies.jl:231–278` 因而将网格平均散度从 current 构造，用于 `w`，但谱平均散度从 old 构造，用于线性压力项；这是原生半隐式拆分设计，不足以认定为误传了时间下标。

在半径缩放单位下，忽略书写谱投影细节，代码的关系是：

```text
log(ps)_dot = −ubar_current · grad(log(ps)_current) − Dbar_old
             + ξ W δD                    (W = −ds)
q_dot       = −div(u_current q_current) + q_current D_current
             + native_vertical_advection(q_current, w_current)
```

即压力看到的线性有效散度为 `Dold + ξ δD`，湿度载体仍由 current 的流动构造。没有共用有效载体质量通量，自然不能保证离散 `ps*q` 的乘积恒等式。还存在 `exp(log ps)` 的非线性、网格/谱投影及 Leapfrog/RAW 的时间配对问题；不能把它们都归结为一个缺失 humidity kernel。原生将 `log(ps)` 倾向的零模置零（`tendencies.jl:424`），这也不等于将空气质量 `ps` 的总量变化置零。

热力修复可能改变 δD、进而改变压力贡献的数值大小；其方向和总水误差必须由新独立运行测量，不能预先声称改善。

## 下一步最小物理一致实验

可以分两个层级检验，不能混为一个完成声明。

第一层是背景湿度的线性完整性。若设 reference `qbar(σ)`，可从同一个原生垂直核构造 `H=V(qbar)`，检验

```text
ds' H = qbar_mean ds' − (ds .* qbar)'
```

它给出线性载体一致性的必要关系，常量 q 的 H 为零。随后可研究与压力有效散度相同的 `H(Dold−Dcurrent)+ξHδD` 配对。若同时把虚温湿度反馈纳入重力波线性求解，则还需联立温度/湿度到虚温的映射，改变 Schur 矩阵；不能单独加 q 项后声称完整湿动力已隐式化。只用背景 H 也不处理空间非均匀 q、非线性载体质量和谱乘积误差。本轮只检验恒等式，未接入模型。

第二层才是非线性湿质量守恒。每个格层以空气质量 `m=ps ds/g` 和湿质量 `Q=m q` 为一对，使用同一组时间积分后的空气界面通量 F：

```text
m_new = m_old − div(F)
Q_new = Q_old − div(q_face F) + integrated_sources
q_new = Q_new / m_new
```

压力/半隐式解需要提供与其空气连续方程一致的 F，垂直 F 由层空气预算诊断，且顶底为零。这里 `Q` 会随物理输送迁移，不是固定局地 `ps*q`；不会读全局湿度余项来补 q。局部均匀 q 应保持，封闭域总 Q 应守恒。长远需将同一积分规则用于空气载体和湿质量，再明确物理 Euler 与大气 Leapfrog/RAW 的源项配对。

不能在完全保留任意 `exp(log ps_new)` 的同时，总能找到封闭共同空气通量。反例：等面积格点上 `Σ mdot=0`，却一般有 `Σ m exp(dt mdot/m) ≠ Σm`。该空气质量改变本身不是封闭通量散度。要精确共同守恒，需要使压力表示/更新符合共同载体预算，或先量化容许的空气离散误差；不能静默将水按压力倒数缩放来掩盖它。

独立有限体积原型 `implicit-flux-prototype.jl` 仅有周期 8 列、3 层、零顶底通量，没有覆盖模型方法。37/37，通过记录见 `implicit-flux-prototype-final-green.log` 和 `build/earth-speedy-transport/implicit-flux-prototype.json`。

| 原型结果（等面积单位下的总量） | 1800 s | 3600 s |
|---|---:|---:|
| 非均匀 q 的共同通量总湿质量误差 | 3.41e−13 | 2.27e−13 |
| 只改空气质量、q 不随输送的湿质量误差 | −0.247979 | −0.495958 |
| 最大局地湿质量真实变化 | 0.170738 | 0.341477 |
| 同一零和空气质量率以 exp(log p) 更新的总空气质量增量 | 0.085894 | 0.343575 |

原型也验证常量 q 保持、空气正性、q 范围和上述 H 恒等式。数字是构造反例，不能当作地球积分的 mm 残差或气候效果。它支持下一步设计共同载体通量的实验方向，不提供可直接放进当前谱模型的守恒补丁。

## 可复现入口与文件保全

```powershell
$env:IMPLICIT_IMPLEMENTATION='native'
$env:IMPLICIT_LABEL='new-native-red'
node docs/evidence/earth-speedy-transport-20261013/implicit-run.mjs docs/evidence/earth-speedy-transport-20261013/implicit-test-red.jl

$env:IMPLICIT_IMPLEMENTATION='fixed'
$env:IMPLICIT_LABEL='new-fixed-green'
node docs/evidence/earth-speedy-transport-20261013/implicit-run.mjs
```

更换 label 防止覆盖已记录日志；测试 JSON 的固定输出路径仅用于本次新证据，冻结后重跑应另复制实验并改输出路径。保全结果另见 `implicit-preservation-verification.json`，核查旧 manifest 绑定与本轮来源状态，不更新任何旧证据。代码中的 EUPL-1.2 归属与修改日期已保留。
