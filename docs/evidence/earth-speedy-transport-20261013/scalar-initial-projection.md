# 独立初态标量投影验证

导入 helper 已冻结，主测试 **112/112 GREEN**，独立序列化重载 **8/8 GREEN**。原生 RED 对两个冻结初态的五标量均发现非零辅助行：2 项来源 SHA 检查通过、10 项合法谱断言失败，exit 1。这项修复针对初态标量谱合法性；不改变 SI 参考，不证明季风或长期稳定性已经修好。

来源与离散算子根因见 [readonly-reference-review.md](readonly-reference-review.md)：此版本 `truncation=32` 的有效标量谱为 `l_index<=32`，`l_index=33` 是向量导数辅助行。压力辅助行足以重现实际参考变化导致的 curl-grad/div-grad 差异；单独清除它后，残差由约 `1e-2` 降到 `2–3e-10`。原生初态 grid→spectral 写入辅助行，水平扩散只清 tendency，Leapfrog 保留原有辅助状态；质量约束和湿度格点 clip 不会重新生成该压力谱行。

## 可复用接口与历史语义

```julia
include("scalar-initial-projection.jl")
using .ScalarInitialProjection

# 放在复制原检查点全部状态后、新实验初态库存/哈希记录前。
projection = project_scalar_initial!(vars, model;
    source_sha = bytes2hex(sha256(read(source_path))),
    stationary_history_fields = (:temperature, :pressure, :vorticity, :divergence),
    stationary_history_evidence = "readonly-scalar-auxiliary.json: pinned lineage and native tendency contract",
    matching_history_fields = source_year == 2001 ? (:humidity,) : ())

# 此后只检查，不能每步重新投影。
assert_scalar_auxiliary_zero(vars, model)
```

helper 不覆盖任何原生方法。五标量 T/q/ln(ps)/ζ/D 两个谱时间层仅清辅助行，全部有效谱系数逐位不变。当前格点层由投影后谱重建，湿度调用相同原生 hole filling，u/v 通过原生 UV inversion 重建；刷新 parameterization pressure、平均温度和格点 geopotential，不调用会轮转历史的全局 transform。

旧格点时间层并非 RAW 滤波后的 spectral step1 逆变换。2006 二者最大差为 T `0.00676660 K`、q `3.46846e-6 kg/kg`、ln(ps) `4.77139e-6`、radius×ζ `0.0286443`、radius×D `0.0413119`。因此不能把旧格点层完整重建或令 old=current。

- T/p/ζ/D 的辅助数组在 2001/2006/2007 两时间层逐位相同，有独立谱 SHA 和原生零辅助 tendency 证据。旧 grid1 只减去该辅助谱的逆变换，保留其余真实历史。
- 原生 UV inversion 本来忽略这组标量辅助行，旧 u/v 保持逐位不变。
- 2001 旧 q 与其原生重建/clip 实际匹配，允许仅扣除前后 clip 重建差。helper 先验证匹配，失败则在修改状态之前拒绝该策略。
- 2006 旧 q 受质量缩放、RAW 和 clip 历史影响，无法由现存谱唯一追溯，保留旧格点 q 至自然轮转。第一次物理调用仍使用该历史，第一步末轮转后旧格点已来自投影后的当前层；第二步验证涵盖其后续使用。不能宣称所有历史格点都在导入瞬间投影完毕，也不能从 RAW 后谱猜测这项旧 q 辅助贡献的幅度。

陆地、海洋、clock、scale 在纯导入阶段逐位保持。后续质量约束单列，不属于“有效谱系数逐位保持”的纯投影断言。

## 库存与派生初态

下表是当前格点层纯投影差额，未作常数模质量约束，水采用原生湿度 clip 后库存。`sensibleHeatProxyJm2` 是 CpT 代理量，不是完整大气能量。

| 原状态 | 大气水变化 mm | 总大气质量变化 kg/m² | CpT 代理热量变化 J/m² |
| --- | ---: | ---: | ---: |
| 2001-01-01 | −0.00000175780150 | +0.000055211749 | +13.6063805 |
| 2006-01-01 | −0.00002433993202 | +0.000061990465 | +17.2033339 |

2006 旧 q 格点数组未变；旧层水库存仍因压力投影增加 `5.27063517e-7 mm`，不能把“旧 q 未变”误写成“旧层库存未变”。导入水量变化必须记为初态投影差额，不计为蒸发或降水。

| 文件 | SHA-256 |
| --- | --- |
| 原 `annual-initial.jld2` | `8e88991dde3af2877bd248cb1e30b0e7235fa6ee792fa705db5b65da0d237be8` |
| 派生 `scalar-initial-projection-2001.jld2` | `6cfe9bf04fc287fbf0a9c189892302403243548f3edc6e8e417a01506060515c` |
| 原 `coupled-seasonal-statistics-start.jld2` | `5e540be4025e75984cd1ab414fb36daccf95e66f5a309306523b63c9704ea6f1` |
| 派生 `scalar-initial-projection-2006.jld2` | `e36cfbffa4ee0cc04ae33edf2a3f8aebd03ab7ad1c5c0f5caaa78746359a5bb0` |

派生文件位于 `build/earth-speedy-transport/`。重载到相同模型容器后，状态内容 fingerprint、两时间层零辅助行及库存均通过检查。fingerprint 和 JLD2 文件 SHA 是不同对象，JSON 分别记录。原检查点内容保持原 SHA。2001 使用原协议的 `apply_frozen_initial!` 导入布局再投影；这些文件不是原 raw 初态的同 SHA 替代品。

## 两个真实时间步

恢复冻结 2006 全部模型组件、质量/SST context 和 clock，调用原生 `SW.time_step!(sim)` 两次（00:00→00:30→01:00），包括真实物理、动力、扩散、SI、RAW、格点轮转。没有逐步投影。

- 两个谱时间层五标量辅助行全程精确 0；每一步全部旧格点 T/q/p/ζ/D/u/v 与上一步当前格点逐位一致。
- 当前 T/ζ/D/u/v 与原生谱重建逐位一致；p 最大差 `1.77636e-15`、q 最大差 `1.12757e-17`，来自随后常数模/湿度缩放的浮点顺序。
- 原 dry-mass target 保留，约束后相对误差 < `1e-12`。每步水残差分别 `−0.000370759683`、`+0.000162020591 mm`；记录包含 E、P、质量约束水账和前后库存，不强称单步水量精确守恒。
- 土地/海洋和时间在导入阶段未重置；实际时间步按物理演进。此处不验证多月或多年稳定性。

第一轮 GREEN 的 8 pass/1 error 是测试快照 materialize 后的 SubArray 缺少 spectrum 元数据，未声称通过；修正为原生谱对象快照后完整主测试 112/112，exit 0。旧失败日志保留。

## 验证绑定

- helper `scalar-initial-projection.jl`：`572893f6eacdb9594160638b320e44fd5da6fd047dcec94ae58f19a5f3e3109c`
- 主测试 `scalar-initial-projection-test.jl`：`3d0359959b5453eaf16a9d44165b614a8c9cb55bcf78267d610dbf9cc41ca130`
- 主结果 `build/earth-speedy-transport/scalar-initial-projection-verification.json`：`bc8f0cdf867cff8aa9be732d06e1eb3eb3854326ec6259e9e4edd5824a73b5b7`
- 重载探针 `readonly-projection-reload.jl`：`e9de491761871562e58607ebe3cf709ca6813547b3f6f830a154cf5eeb37ce45`
- 重载结果 `build/earth-speedy-transport/readonly-projection-reload.json`：`32d60bd2523b7a220434eb4730e7f72cb58e4098e0ee576dafed32ddda385ceb`
- 日志：`scalar-initial-projection-native-red.log`、`scalar-initial-projection-green.log`（已记录的测试容器错误）、`scalar-initial-projection-green-final.log`、`readonly-projection-reload.log`。

后续三天 V3 派生初态试验使用独立入口 `audit-projected-initial.jl`；其结果另存报告，不能覆盖原 V3 raw 初态控制，也不能据本报告改正在运行的长期入口。
