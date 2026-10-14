# V2 热力半隐式失稳：独立数学审查

状态：V2 的长期稳定性验收失败。此前 `review-implicit.md` 的局部 Jacobian、单步求解和 restart 检查仍是有效的有限范围证据，但不能覆盖本次发现的实际层结/参考层结失配下的 Leapfrog 计算模态。本文与新增诊断不改冻结实现、原包、旧结果或任何运行中的源文件；没有温度 clip、放宽容限或降水调参。

## 严重：长期试验失败与未覆盖的计算模态

`implicit-sensitivity-native.log`、`all-corrections-sensitivity-native.log` 都实际退出 1，错误是 `ArgumentError: virtual temperature must be positive`。简短错误栈是 `vertical-diffusion.jl:94 sigma_conductance` → `:155 parameterization!` → 原包 `parameterizations/tendencies.jl:90,36,13` → `time_integration.jl:83`。它说明下一次物理过程读到了坏温度，不证明竖直混合制造了坏值。完整日志 SHA 与最后月进度保存在 `build/earth-speedy-transport/physics-implicit-errors.json`。

同队独立原生复现的第一负温度分别是 2006-02-28 05:30、50.099°N/186°E、第4层 −89.79 K，以及 2006-03-06 17:30、46.389°N/196.875°E、第3层 −33.34 K。原生窗口复放与分阶段探针的 extrema 逐步一致。坏点物理倾向是加热；动力候选已负，隐式校正与水平扩散有所缓解但没有救回。2001 初态连续运行的六年尝试也失败，因此不能仅归因于 2006 跨物理 restart。

CFL 口径必须区分：探针的 `maxVerticalCourant` 使用 Leapfrog 完整跨度 3600 s；常规名义步长 1800 s 的 CFL 是该字段的一半。不能把完整跨度 CFL=1 当成通常的单步 CFL=1。

## 方法与反例

`physics-implicit-stability.jl` 从真实 checkpoint 读取参考温度、实际温度、RAW 参数、半径与原生 HyperDiffusion；对干、平坦、静止气柱构造完整 old/current 线性放大矩阵。已用安装包真实 `implicit_primitive_leapfrog_kernel!` 与 `leapfrog_kernel!` 核验证四种 native/corrected、diffusion on/off 组合。实际 Leapfrog 顺序是 **implicit → horizontal diffusion → RAW**；不是通用时间积分函数中的另一顺序。

设空间算子为 A，参考为 Aᵣ，τ=2Δt/a，Q=(I−τAᵣ)⁻¹。隐式后倾向为 Q Aᵣ x_old + Q(A−Aᵣ)x_current，再按原生顺序施加水平扩散；最后把原生 RAW 的两个过滤更新组成 34×34 矩阵。报告增长使用时钟步长 Δt=1800 s，而非 τ 对应的 3600 s 跨度。文中 `l` 是原生一基 degree index：l=21 对应球谐 degree20。

真实冻结参考的 B=RL+UW′ 全部本征值为正实数：修复后范围 8.0697–93075.4253。最高有效谱行的 S 条件数为 30.4044，最小本征值为 1.002556。没有发现参考自身的负波速平方或 S 近奇异。单独的参考态稳定并不能保证显式剩余项稳定；这正是经典半隐式稳定性分析区分实际态和参考态的原因。[Simmons、Hoskins、Burridge (1978)](https://journals.ametsoc.org/view/journals/mwre/106/3/1520-0493_1978_106_0405_sotsim_2_0_co_2.xml)、[Bénard (2003)](https://arxiv.org/abs/physics/0304114)。

`physics-implicit-columns.jl` 和 `physics-implicit-candidates.jl` 扫描全部 3168 个真实瞬时列的 8 个代表 degree。2894 个列的连续干静止算子中性，其中原参考/1800s 有323列离散增长；全部列中有414列负实部计算模态增长。最强中性反例是 53.81°N/289.29°E，λ=−1.143139/步、e-fold 0.15573天。该区域不是实际首次崩溃位置，所以不以它单独认定崩溃因果。

`physics-implicit-window-stability.jl` 随后读取真实崩溃前48小时、四个固定北太平洋列的每步原生状态，解决“最冷点在别处”及“使用已崩坏剖面”的取样问题：

| 正温状态 | 连续干静止算子 | 原参考1800s的最强模态 | 原参考900s | 原参考450s / 等温288K、1800s |
|---|---|---|---|---|
| thermal 故障前48h，ij412，最低236.63K，全场名义CFL约0.1085 | 中性 | −1.116110，e-fold0.18965天 | −1.024542 | 两者ρ≤1 |
| thermal 故障前24h，ij412，最低234.00K | 中性 | −1.146314，e-fold0.15257天 | −1.041427 | 两者ρ≤1 |
| all 故障前24h，ij476，最低233.16K | 中性 | −1.180778，e-fold0.12537天 | −1.060062 | 两者ρ≤1 |

这些是温度大幅畸变和 CFL 失控之前的局部数值反例，支持“层结失配引起计算模态”的机制。它们仍排除实际风、旋转、地形、湿度耦合、竖直速度与物理参数化，**不是完整非线性崩溃的唯一归因或任一候选的稳定性证明**。输出保留实际 q，未谎称干矩阵包含湿耦合。

## 重要：等温参考不是无条件稳定方案

参考选择先使用原包既有 `EarthAtmosphere.reference_temperature=288K`，另检验280/300K的邻近范围；不是依据雨量选值。全部初态3168列相同扫描中，原参考1800/900/450s的负计算模态增长列数为414/98/0；三种等温参考1800s均为0。但是450s仍有5个连续中性列出现弱复模态增长，三种等温参考仍各有22个；288K最强ρ=1.000504929，e-fold约41.27天。因此只能说抑制了被识别的强交替模态，不能称无条件稳定。对最后几小时已经畸变的剖面，缩步或等温都可能仍有强增长；这不是初始根因证据。

## 重要：完整离散 RHS 的参考不变性与辅助谱行

`physics-implicit-reference-invariance.jl` 使用完整真实湿动力状态、地形和水平场，明确设置 old=current，只计算动力 RHS 并补完整背景竖直平流；不做隐式校正、扩散或时间推进。这样不会把不同 SI 有限步长轨迹的正常差异误作物理不一致。

原动态参考直接换为288K时，正确排除辅助行33后的有效谱行差异为：温度约7.05×10⁻⁸ K/day，涡度1.05285×10⁻⁵ s⁻¹/day，散度9.21265×10⁻⁶ s⁻¹/day，压力和湿度为精确零。该诊断实际 FAIL，未通过改门槛掩盖。早期 `*-rows.log` 的数组展开夹具错误以及 `*-compact.log` 的辅助行/涡散单位问题均保留；最终口径为 `*-valid.log`、当前 JSON 与源码，vor/div 需除以半径平方后换每日单位。

独立审查者 `monsoon_diagnosis` 的子项分解证明有效 vor/div 差异来自 pressure 辅助行33输入破坏 curl(grad p)=0 与 div(grad p)=Laplacian(p)，FullGaussian 同样存在；清辅助行的独立副本后算子残差降至约2–3×10⁻¹⁰，aux-only重现原误差。来源链由该审查者继续保存，不能归咎于只修改 pressure 零模态的水/干质量约束，也不能把当前污染初态下直接改动态 reference 宣称为严格相同离散物理。

保留离散 RHS 的独立候选是分离动力参考 T_dyn 与 SI 矩阵参考 T_si：native dynamics 和背景平流仍用 T_dyn，矩阵 L/U/S 用 T_si；在原生隐式核前给散度倾向补 λ(U_si−U_dyn)(p_old−p_current)，λ=−l(l−1)、U=−R_d T。温度的原生隐式核本来就会按新 L 做 old−current 移项，R/W不变。old=current时补偿严格为零，因此不改变原动态 RHS；不同时间层时应再用独立块矩阵求解验证。它不代替对辅助谱行约束的根因处理。

后续必须以独立新版本验证上述分解、真实失稳窗口、完整年度与六年，再判定能否接受；本报告没有宣布水热机制修复等于印度或北澳季风修好。

## 新分离参考候选的独立核验（不是长期验收）

`implicit-split-reference.jl` SHA `224ce07c9552709f31c2e74521e3624ae5894c2a7319ca404faed59c11124d31` 已作为首版永久保留。

`physics-split-reference-test.jl` 实际 GREEN 2796/2796、exit0：对任意完整当前 F、相等/不等 old/current、两个半径、α=0/0.5/1、enabled关闭、复数有效谱系数，真实新 wrapper 的输出与独立17×17块求解 `(I−ατA_SI)⁻¹[F+A_SI(x_old−x_current)]` 及安装包 RAW 核一致。最大相对倾向误差1.86×10⁻¹⁵、RAW误差1.81×10⁻¹⁵。该组背景设零以隔离 U 时间层补偿。

随后 `physics-split-reference-grid-test.jl` 实际 GREEN1074/1074、exit0：真实2006湿场含地形、风、q、pressure和非零背景竖直平流。old=current与不等两种情况下，关闭SI的新 wrapper 完整 T/p/D/ζ/q 动力 RHS 与旧 Consistent **逐位相等**，非零背景谱场也逐位相等。开启SI后，每种情形528个有效谱系数分别与独立块LU求解一致，最大相对误差1.86×10⁻¹⁵。归档辅助输入保持原样，没有先投影后假称原状态相同。对应日志及JSON在 build 同名前缀文件。

首版在 fresh startup 的时间步变化时保留首次 dynamics profile，而旧V2会在半步/全步跨度变化时刷新参考；这是已发现并单列处理的初始化语义差异。2006固定步长恢复的上述核验不受影响。独立新版 `implicit-split-reference-v2.jl` 恢复旧刷新语义，首版及其测试不覆盖写入，新版按新SHA重新验证。固定故障列扫描也已额外区分 January2006 global mean 与每一步实际 instantaneous global mean，均保留在窗口JSON中，未将两者混称为当前参考。

更新：v2已完成独立核验，SHA为 `22f9ef9c91190285d6aafc543abce8c6e706d11662a907a3eab4dd6cd02bfcfd`。仅改变 constructor 初态为零及恢复原有“时间跨度变化则刷新动态参考、同跨度保持”的初始化语义。`physics-split-reference-test-v2-final.log` 实际2796+16=2812 GREEN、exit0，新增16断言覆盖900/1800/3600秒启动跨度逐次刷新、同跨度时参考和矩阵保持不变。早期 `physics-split-reference-test-v2.log` 是本审查测试新增段 `205.+counter` 的解析错误，保留且不计通过；修复仅在审查测试文件，不改实现或容限。

`physics-split-reference-grid-test-v2.log` 实际1074 GREEN、exit0，新SHA完整真实湿场仍逐位保留原动力RHS；`physics-split-amplification-v2.jl` 进一步用34个基向量直接经过真实新wrapper、真实原生 `horizontal_diffusion!` 和RAW核，测量完整34×34放大矩阵。对 thermal 故障前48小时 ij412、degree20，测得ρ=0.9960449540606123，解析值0.9960449540606113；矩阵最大绝对误差7.05×10⁻¹²、相对误差2.36×10⁻¹⁵。这是原参考 λ=−1.116110 的同一真实正常剖面、同一时间步和扩散参数。该波数核级别反例已被候选消除；全场弱模态、真实窗口/年度/六年验收仍分别成立，不能跳过。

独立结论：未发现阻止以v2新类型开展隔离积分验证的 sign、radius、time-level、背景重复或完整动力RHS改变问题。原生辅助谱行来源与投影后影响见独立 [readonly-reference-review.md](readonly-reference-review.md)，它是另一项输入合法化问题，不能由参考预条件的成功替代。所有旧失败、首版候选、解析夹具失败日志均保留。
