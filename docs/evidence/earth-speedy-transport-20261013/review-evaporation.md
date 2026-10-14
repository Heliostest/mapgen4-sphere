# 陆面蒸发 / 露水修复独立交叉审查

审查日期：2026-10-13。范围仅为 `surface-evaporation-corrected.jl`、`surface-evaporation-test.jl`，以 SpeedyWeather 0.23.0 本地实现和 V2 指定行为为基线。审查者未改动物理源码、测试、运行文件或原包；没有运行气候积分。本报告不绑定根代理会重建的 aggregate JSON。

**结论：未发现阻断 V2 比较实验的源码缺陷。** 实现保留正蒸发，消除把蒸发 availability 当作露水平衡湿度所产生的额外负通量，并将真实露水与土壤干旱 stress 分开。下文结论限于本模型的 bucket、相态和通量语义，不等价于现实土壤在未饱和空气下不能吸附水汽，也不证明季风已改善。

## Availability 的语义

本地 `src/parameterizations/land/vegetation.jl:119` 将变量明确定义为 “Soil moisture availability for evaporation”。第 192–246 行使用植被覆盖、上下两层相对田间容量、根区萎蔫点和层厚构造该指标。它不是土壤孔隙相对湿度，也没有土壤水势、吸附等温线或表面水活度的闭合。`land/thermodynamics.jl` 提供热容、导热率、田间容量、密度、萎蔫点，未提供上述吸附过程。

固定 commit `0ebfdbfcd62efd46dd1802284908645be4b230be` 的原 [SPEEDY surface_fluxes.f90 第 173–174 行](https://github.com/samhatfield/speedy.f90/blob/0ebfdbfcd62efd46dd1802284908645be4b230be/source/surface_fluxes.f90#L173) 先计算地表温度对应饱和值，然后对 `soilw_am * qsat - q` 取非负值。本地 Julia `surface_fluxes/humidity.jl:158–160` 为允许凝结去掉这个截断，因而同时让干旱 availability 降低了所谓凝结阈值。

现实中，吸附不同于露水；[McHugh 等的同位素示踪实验](https://www.nature.com/articles/srep13767) 在 20–60% 相对湿度、土温高于露点的条件下也测到了水汽进入土壤。本修复的依据是当前 evaporation 指标没有建立这种物理过程，而非否定该过程存在。保留正蒸发而只修负支，是本次明确指定的最小改动；没有改成另一种常见的 `alpha * (qs - q)` 蒸发阻力公式。

## 源码与收支核对

记 `C = rho * drag * wind`、`I = 1 + snow / snow_insulation_depth`，`qs = saturation_humidity(Tsoil_top, ps)`。修复第 41–48 行采用：

| 输入条件 | 修复的单位陆地面积湿度通量 E | 核对结果 |
| --- | --- | --- |
| `q <= qs`，`alpha * qs > q` | `C * (alpha * qs - q) / I` | 原生正蒸发算术顺序保留 |
| `q <= qs`，`alpha * qs <= q` | `0` | 不因 evaporation availability 生成负通量 |
| `q > qs` | `C * (qs - q) / I` | 真露水为负；不因土壤越干而额外放大 |

这里的饱和判断使用实际地表温度的饱和值，而非空气温度对应 RH。`q = qs`、`0 <= alpha <= 1` 时为零。源码保留原生的有限值筛选、地表与大气时间步选取、拖曳系数选项、雪衰减和原变量声明，无新增参数化状态。

`surface_humidity_flux.land` 储存未加权 E，之后只乘一次 land fraction `f` 加入总通量和最低大气层。原生 ocean 分支先设置海洋份额，land 分支累加，因此混合地表总值为 `f * E_land + (1-f) * E_ocean`，不存在双重面积权重。

原生 `land/soil_moisture.jl:275–289` 的上层来源为 `P + (snow_melt - E_land) / water_density`；两层扩散在按容量和厚度积分时抵消。`land/soil_temperature.jl:282–306` 使用同一未加权通量，净入热含 `-Lv * E_land`。露水因此增加土壤水、加热土壤，并减少大气水汽潜热含量；正蒸发方向相反。`parameterizations/tendencies.jl:98–106` 用 `g / (ps * delta_sigma)` 将加权通量转换成大气比湿 tendency，恢复柱质量积分恰得到该通量。没有依据再往大气干温 tendency 添加一份相变热，否则会把地表的相变热重复记账。

雪处理逐字保留原生 `1 / (1 + snow / depth)`，同时衰减两个方向的水和潜热交换。它只是原模型的绝热近似：本修复没有新增雪表面温度、霜沉积、雪升华或吸附热物理。

## 验证证据及审查发现

已独立阅读原生 RED 日志和首次完整 GREEN 日志，未将作者声明替代日志核对：

- `build/earth-speedy-transport/surface-evaporation-red.log`：第一组 22 个断言，9 pass / 13 fail / 0 error；失败覆盖暖面未饱和负通量及干土露水被放大。原生失败会结束脚本，因此第二组未在该 RED 运行中执行。
- `surface-evaporation-green-complete.log`：第一组 22/22，第二组 270/270。包括 8 个独立通量例子，以及陆地比例 0/0.3/1、湿度比 0.2/0.6/1.2、availability 0.1/0.5/1、雪深 0/0.05 的 54 个组合。实际调用 `SW.parameterization!` 和原生 bucket 水、热 `SW.timestep!`。
- 已反馈并由实现者修复的测试缺口：原第二组虽然枚举雪深，但只断言耦合闭合；若删去雪衰减，仍可能全部通过。最终测试第 63–64 行为每个组合额外对照含雪因子的独立期望通量，覆盖正蒸发、零通量和真露水。该修改只加强测试，物理源码 SHA 未变。
- 已独立重读最终 `surface-evaporation-green-snow.log`：第一组 22/22、第二组 324/324，合计 **346/346**；实现者报告进程 exit 0。已独立核验最终文件哈希。日志中 PowerShell 将 Julia 的 `[ Info: Time step changed ...]` 标为 NativeCommandError 的 stderr 展示，并非失败断言；测试总结均通过。

测试验证的是当前状态下的通量及 tendency 守恒：土壤初态均为容量的 0.6，温度均匀。它不覆盖完整时间积分后的 runoff / 非负裁剪、土壤热容随水量变化、气候反馈、季风或长期平衡。这些仍由父任务的 V2 独立短审计与长积分判断，不应把本次 GREEN 写成全模型长期水热守恒已证明。

## 审查绑定

| 文件 | SHA-256 |
| --- | --- |
| `surface-evaporation-corrected.jl`（已冻结） | `8258dab6422c7ea2a245492e94c8c9eb06fad5244a0cbef851ee43094e048db0` |
| 首次完整 GREEN 对应 `surface-evaporation-test.jl` | `9cb278674359dffb6baa60270cf4ab6b3db88c198c35a6f8f95d0f689033fdc5` |
| 最终 `surface-evaporation-test.jl`（补强雪断言） | `87e2449784dd9e91fe359b3527a909cb1bbe7470eafc1410940f7b45a752836f` |
| 原生 RED 日志 | `be5b116130c3fad9c44249ac25896f23b77e7ce05e7c9866704bb75f273e54a8` |
| 首次完整 GREEN 日志 | `329850ed26a45ab89a6337c85ca1769f976350ac9fdb1a1653d7ee827386e0c0` |
| 最终 `surface-evaporation-green-snow.log` | `286940be943866571205e48295ef70b8114a451791dbbba26cbbb2dd3220bc30` |

物理源码头保留 SpeedyWeather / SPEEDY 著作权与 EUPL-1.2 指向 `convection-LICENSE.txt`。本次审查发现的测试缺口已关闭，无需修改已冻结的物理源码。
