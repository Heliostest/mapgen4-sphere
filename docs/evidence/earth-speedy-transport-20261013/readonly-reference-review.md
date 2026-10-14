# 数值参考态不变性与辅助谱行：独立只读诊断

2026-10-13。诊断未改动包、冻结 include/driver、任何源检查点，也没有进行长期积分。两个自有脚本为 `readonly-reference-operators.jl`、`readonly-scalar-auxiliary.jl`；结果位于 `build/earth-speedy-transport/` 同名前缀 JSON / 日志。本报告先于后续初态投影 helper，不能当作后续 helper 或真实完整模型单步的测试报告。

**确定结论：本次“改变参考态后完整瞬时动力 RHS 不同”的主要原因是被冻结初态携带的非零辅助谱行，不能归因于环格 alias，也不是质量约束生成的。** 单独清理压力副本的辅助行就消除了有效谱行上的压力梯度恒等式误差。温度所谓百分比大误差基本属于不使用的辅助行。该发现解释参考态不变性测试失败，不单独证明它造成 V2 月尺度失稳，也不否定独立发现的 SI+RAW 计算模态增长。

## 索引、量纲与 fixture

`spectral_grid.jl:197` 使用 `Spectrum(truncation+1,truncation)`，实际 `sg.truncation=32`、`spectrum.lmax=33`。`l_indices` 是 1-based：有效标量 degree 0–31 对应 `l_index<=32`，`l_index=33` 是为向量梯度需要保留的辅助 degree 32。原测试 `li<=sg.truncation+1` 实际包含了全部辅助行；不能用于“有效模态”的结论。

`prognostic.scale=6.371e6`。动力的时间单位除过一次半径，而 ζ、D 本身也乘过一次半径。因此 T / q / ln(ps) tendency 转每天用 `86400 / scale`，ζ / D tendency 转 `s^-1/day` 必须用 `86400 / scale^2`。早期测试里的 vor/div 单次除半径数值不可按物理单位引用。

Leapfrog 的 dynamical / linear component 用固定 dispatch 分别选 step 2 / 1（`steppers/leapfrog.jl:49–73`）；测试把 T、q、p、ζ、D、u、v 的旧/新层置为相同，覆盖了相关输入。其 scratch `get_step(...)` 是单层中间量，并非未覆盖的历史状态。本测试无 SI、diffusion 或时间更新，所以恢复时钟但未恢复旧时间步数值不解释本次差异。实际检查点 u、v、D grid 与对应谱重建的最大差均逐值为 0。

## 完整差异的离散分解

设更换参考温度的差为每层水平常数 δ，G 是原生谱→格压力梯度，Q 是格→谱变换，Div/Curl 是原生谱向量算子，L 是直接谱 Laplace 算子。补回背景温度垂直平流后，相同时间层的参考差应满足：

```
ΔT_RHS = δ * [Div(Q(u/cosφ), Q(v/cosφ)) - Q(D_grid)]
Δζ_RHS = Rd * δ * Curl(Q(Gx(ln ps)/cosφ), Q(Gy(ln ps)/cosφ))
ΔD_RHS = Rd * δ * [Div(Q(Gx(ln ps)/cosφ), Q(Gy(ln ps)/cosφ)) - L(ln ps)]
```

用实际 2006 初态及 288 K 参考与旧参考之差，直接构造这三个子项。与 `physics-implicit-reference-raw.jld2` 的完整差值比较，ζ、D 全谱最大未解释项分别 `2.128e-10`、`1.960e-10`（内部单位，相对已观测差 < `6e-13`）；T 有效谱行最大未解释项 `9.611e-12`。T 另有 `0.4954` 内部单位未解释项，全在辅助行，未将其伪称为完全逐位匹配。

| 288 K 对旧参考的差 | 有效谱系数最大差（内部单位） | 去辅助后格点物理最大差 |
| --- | ---: | ---: |
| 温度 | `4.0005e-7` | `7.05e-8 K/day` |
| 涡度 | `364.1880` | `1.05285e-5 s^-1/day` |
| 散度 | `346.9812` | `9.21265e-6 s^-1/day` |

直接压力算子测试：

| 压力输入 | 有效 `Curl(G)` 最大谱误差 | 有效 `Div(G)-L` 最大谱误差 |
| --- | ---: | ---: |
| 原检查点全部谱行 | `0.01444076` | `0.01375848` |
| 只保留有效标量谱行 | `1.9963e-10` | `2.9522e-10` |
| 仅保留辅助谱行 | `0.01444076` | `0.01375848` |

OctahedralGaussian 与 FullGaussian 的第一行结果相同到舍入误差量级。剩余 `1e-10` 级误差可容纳环格/变换近似，不能解释原 `1e-2` 的误差。

原因可以从代码复核：`SpeedyTransforms/src/spectral_gradients.jl:332–362` 在 `UV_from_vordiv!` 中明确忽略输入标量的最后辅助行；但 `∇!` 对输入压力的最后行仍求导，需要超出当前谱存储的下一行才能维持恒等式。原生 `transform!` 则把标量所有存储行变到格点，因此同一个带辅助模式的状态在这些路径里被不一致地解释。

## 非零辅助行来自 2001 初态并持续存在

已比较冻结 `annual-initial.jld2`、`coupled-seasonal-initial.jld2`、2006 statistics-start 与 2007 final；两时间层 T/p/ζ/D 的辅助数组 SHA 全程逐位相同。

| 标量 | 2001 辅助谱系数最大幅度 | 2006 状态 |
| --- | ---: | --- |
| T | `0.0014082203 K` | 逐位不变 |
| q | `5.0121556e-6 kg/kg` | `5.0281469e-6`，随全谱 humidityScale 略变 |
| ln(ps) | `3.2822845e-5` | 逐位不变 |
| radius × ζ | `0.0261600542` | 逐位不变 |
| radius × D | `0.0386206568` | 逐位不变 |

原生 `PressureOnOrography` 单独初始化，精确重现冻结初态的压力辅助数组 SHA：`b68d3c12e3bd913e36177ec7bb82bd1c5f23c5f1a2a1c22e0b079ad01d7fc289`。链条是 `initial_conditions.jl:794–808` 的非线性地形压力 → `set!(grid)` → `variables/set.jl:112–116` 的 transform；没有清标量辅助行。其他初始标量也通过 `set!` 从格点函数/格点场写入，但本次未宣称已分别重跑它们的完整原生初始化。

原生 `horizontal_diffusion.jl:343–349` 仅保证辅助 **tendency** 为零；`steppers/leapfrog.jl:298–307` 对所有谱系数作相同更新，不清预报状态。独立给五变量设置 old=current、tendency=0，再调用一次原生 `update_prognostic!`，五者的完整数组逐位不变，直接证明非零辅助模式可持续。这里是隔离的原生更新试验，不是假称完成了全物理 `time_step!` 回放。

湿度 hole filling 在 `time_stepping/transform.jl:150–153` 仅改格点 humidity，接口不接收预报谱数组；探针确认前后该谱数组逐位不变，因此不向谱状态重新注入辅助行。冻结质量约束 `components.jl:126/145` 仅改压力常数模，两个 `scratchPressure` 变换都是谱→格。用人为 `1e-6` 目标干质量偏移实际调用约束，压力非常数模和辅助行最大改变量均为 0。

## 清理的影响与最小位置

把五标量辅助行置零，**所有有效谱系数逐位保持**；并不意味着物理格点场或库存完全不变。2006 当前层投影的格点最大改变量为：T `0.00143779 K`，q `2.43865e-5 kg/kg`，ln(ps) `1.3829742e-4`，ζ `3.5165e-8 s^-1`，D `3.0612e-8 s^-1`。

| 状态 | 原生 humidity hole filling 后全球大气水变化 | 总大气质量变化 |
| --- | ---: | ---: |
| 2001 初态 | `−1.75780e-6 mm` | `+5.52117e-5 kg/m²` |
| 2006 初态 | `−2.43399e-5 mm` | `+6.19905e-5 kg/m²` |
| 2007 状态 | `+4.92316e-6 mm` | `+6.19512e-5 kg/m²` |

最小候选位置是新实验导入初态时明确投影五标量的两个时间层，然后在每步检查辅助行保持零；不要在 SI 校正内部悄悄反复删除旧状态。原协议和旧检查点保留，新派生试验必须单列标签、源 SHA、派生 SHA、投影水/质量/热量账。若需要维持既定 dry-mass target，随后常数模约束的变化也应另列，不能与“有效系数逐位不变”的纯投影混为一谈。

还有一项需要后续 helper 明确的历史语义：RAW 修改保留的 spectral step1，而 native transform 把未过滤的原 grid2 移到 grid1；因此旧 grid1 一般不等于当前 spectral step1 的反变换。不能在重建格点状态时不加说明地把两个时间层设成相同，或抹去这项历史区别。

## 验证绑定

- `readonly-reference-operators.jl`：`366d7fc83f8d6feffa9a03e2f8db13ae12fbfcad97abc052c678b7e427d892a3`
- `readonly-reference-operators.json`：`91785c405ee58417e6dfce63013ca1280d7774bc67b6723410517dcdd3dd0fbe`
- `readonly-scalar-auxiliary.jl`：`df012a8080c5cf882518ac661c559aa84197d17113dd8c20b34c643f9cceba47`
- `readonly-scalar-auxiliary.json`：`6ebe288a9093c164f77519ece65f13d31c7ba51c345c8b1b6e16f67bf04975ab`
- 比对的 `physics-implicit-reference-raw.jld2`：`33841f23f306166eb9d37df55288fd500f3a4e1fc7f924ff5d0d00795f63438b`
- 原生 `spectral_gradients.jl`：`95b65356393d10ce1bc7adfa40f452046e9c1da5cc5b1aff5c5c713665e04d8f`
- 原生 `steppers/leapfrog.jl`：`60f4fdbb0077ce40022a81a26f81f814d7a3792830c7b0ab971a620a464b0885`

所有冻结检查点源 SHA、各变量投影前后数组 SHA、有效模式 SHA 与完整数值存于上列 JSON。此阶段只在内存中投影，没有写出派生检查点。
