# 云量公式修复：独立实现证据

两个实现错误均已由原生运行失败、独立组件通过验证。它们证明单位和稳定度公式错误；季风季节、区域降水及多年气候是否改善，仍须由主实验独立验收。

1. 原包 `rain_rate` 的声明及凝结/对流赋值均为 m/s。转 mm/day 应乘 `86400*1000`；原 `86400/1000` 小了 10⁶ 倍，未触及上限时平方根云量贡献小 1000 倍。SPEEDY 原实现将降水项的权重定义为 1 mm/day 时 0.2，最大贡献对应 10 mm/day。[原始短波源与阈值](https://github.com/samhatfield/speedy.f90/blob/0ebfdbfcd62efd46dd1802284908645be4b230be/source/shortwave_radiation.f90#L13)
2. SPEEDY 明确使用 `G=(se_above-se_bottom)/(Phi_above-Phi_bottom)`，`se=cp*T+Phi`。所以 G 与 0.25/0.4 阈值均无量纲；原 Julia 代码下层减上层且不除位势差，反号并丢失归一化。这一项已有直接源码证据，不是气候推测。[计算 G 的原始调用点](https://github.com/samhatfield/speedy.f90/blob/0ebfdbfcd62efd46dd1802284908645be4b230be/source/physics.f90#L134)

接口可直接替换现有短波云组件：

```julia
include("cloud-correction.jl")
clouds = CorrectedDiagnosticClouds(sg; mode=:full)
radiation = SW.Radiation(sg; shortwave=SW.OneBandShortwave(sg; clouds))
```

`:precip_only` 仅修降水换算，保留原生 G 供归因；`:full` 修复两项。`kwargs...` 原样传给原生 `DiagnosticClouds`。未调整任何系数；保留原生 RH 云量、云顶、陆海混合、陆地 RH 乘子及 rain-only 输入。原 Fortran 的陆地最低层积云等其他差异不在本轮改变范围。仅声明原生三个诊断变量，不添加模型 state，也不覆盖原生类型的方法。

真实 T32、8 层、Float64 模型初始化后，对受控单柱调用原生或包装 `clouds!`、`Radiation`（原生透过率和辐射传输，另测默认长波）。先完成原生 RED，再创建实现；三次运行使用相同测试文件 SHA256。

| 运行 | 结果 | 说明 |
|---|---:|---|
| native | 100 通过，16 失败，0 error，共 116 | 5 项降水、7 项稳定度、4 项实际辐射接口断言失败 |
| precip_only | 117/117 通过 | 稳定度断言明确要求保持原生行为，供消融对照 |
| full | 119/119 通过 | 两项正确公式及稳定度辐射效应通过 |

| 单柱反例 | 原生 | full | 正确期望 |
|---|---:|---:|---:|
| 1 mm/day 主云量，RH 项为零 | 0.0002 | 0.2 | 0.2 |
| 4 mm/day 主云量 | 0.0004 | 0.4 | 0.4 |
| 10 mm/day 主云量 | 0.00063246 | 0.63245553 | 0.63245553 |
| 20 mm/day 主云量 | 0.00089443 | 0.63245553 | 在 10 mm/day 截断 |
| G=-0.1，海洋层积云 | 0.6 | 0 | 0 |
| G=0.325，海洋层积云 | 0 | 0.3 | 0.3 |
| G=0.4，海洋层积云 | 0 | 0.6 | 0.6 |

另验证 G 阈值、整体位势平移不变性、层厚改变但 G 不变时响应一致、0/0.25/1 陆地分数、RH 与降水共同贡献及云量上限。单独云诊断不改变温湿预报场、降水率或温湿倾向；实际短波调用不产生湿度倾向。

真实短波调用的 `入射TOA - 出射TOA - 地表净吸收 - 柱大气吸收`，full 最大绝对误差 **5.69×10⁻¹⁴ W/m²**（验收阈值 10⁻⁹）。受控 682.5 W/m² 入射列中，1 mm/day 令 full 出射短波从 36.6827 增至 111.8080 W/m²；G=0.4 的无降水层积云列为 182.8894 W/m²。这些只用于验证调用链响应，不能直接解释为全球辐射强迫。

`cloud_cover` 原生变量不含层积云。气候对照至少同时看 TOA 出射短波与地表下行/上行短波；若记录层积云，须在物理调用的相同时点采样返回值，不能将主云量当总云量。

复现命令（约 80–100 秒 Julia 初始化/编译，无气候积分）：

```text
node docs/evidence/earth-speedy-transport-20261013/cloud-run.mjs native
node docs/evidence/earth-speedy-transport-20261013/cloud-run.mjs precip_only
node docs/evidence/earth-speedy-transport-20261013/cloud-run.mjs full
```

完整输出及源文件运行前后 SHA256 在 `cloud-{native,precip_only,full}.{log,json}`。三次源文件均未变化。

- 实现：`544322dbc709ccf37233cfe2932d337ed1f7191d0c14c385f5061595a45c613f`
- 测试：`bbded7ba786ea53cdafcbf535b00c7151638065c8234ebc3b48b078fd9a70b2d`
- 原生 clouds.jl：`9fc96f97064a4745559e06d9a975c4636000ec8865f81549dd7b9cacc93bbc5f`

来源与许可：实现是 SpeedyWeather `qRu16` 云量算法的 EUPL-1.2 衍生组件；保留作者和修改说明，完整许可为 `cloud-LICENSE-SpeedyWeather.txt`，原生源备份为 `cloud-native-source.jl`，固定 Fortran 提交及路径见 `cloud-provenance.json`。本工作只新增本目录 `cloud-*` 文件，未改旧冻结证据、安装包、正式默认，未运行六年模拟或提交发布。
