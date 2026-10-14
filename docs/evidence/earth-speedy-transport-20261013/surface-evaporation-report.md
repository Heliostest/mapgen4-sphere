# 陆面负蒸发分支：独立诊断与隔离修复

2026-10-13。已冻结的新 include：`surface-evaporation-corrected.jl`，SHA256 `8258dab6422c7ea2a245492e94c8c9eb06fad5244a0cbef851ee43094e048db0`。本项没有编辑原包、既有模型/运行入口、既有冻结证据，也没有启动年度或六年积分。

## 发现与依据

**重要：原生陆面通量把蒸发可用水系数直接外推到了负通量。** SpeedyWeather 0.23.0 `src/parameterizations/surface_fluxes/humidity.jl:156–158` 明确说移除 `max(...,0)` 以允许地表凝结，实际计算 `C(α qs(Ts,p)−q)`。因此即使 `q<qs(Ts,p)`，只要 `q>α qs`，空气仍向土壤输送水汽。原始 [SPEEDY surface_fluxes.f90](https://samhatfield.co.uk/speedy.f90/sourcefile/surface_fluxes.f90.html) 的陆面正蒸发使用 `max(0,soilw_am*qsat0−q1)`；海面通量采用饱和湿差。安装包当前 `vegetation.jl:228–247` 的 α 由植被、两层土壤和萎蔫点计算，定义为 evaporation availability。

这个判据必须限定适用范围：真实土壤孔隙可有吸附，不能声称任何未达水面饱和的负通量都违反热力学。Viterbo 的 [ECMWF 原始综述](https://www.ecmwf.int/sites/default/files/elibrary/2002/16960-review-parametrization-schemes-land-surface-processes.pdf) 第 16–18 页讨论了水势、表面相对湿度以及 α/β 法，并明确指出露水处理会影响累计蒸发。但当前 SPEEDY bucket 没有水势/吸附等温线或相应热量闭合，原正蒸发参数也不是由吸附平衡拟合。将这个根区/植被蒸发系数作为凝结平衡湿度，是本次可以直接定位的参数化域扩展错误，而非发现了某个单位或层索引错误。

[Environment Canada 的 SVS 原始科学文档](https://collaboration.cmc.ec.gc.ca/science/rpn/SMAP/documents/20140911_SVS_DOCUMENTATION.pdf) 第 8、18 页采用以 `q>qs(Ts)` 识别露水、露水时湿度系数置 1 的处理。这里借鉴该露水边界条件，未宣称实现了 SVS 土地模式。

## 修复边界

新类型 `DewAwareLandHumidityFlux(sg;kwargs...)` 可用于 `SurfaceHumidityFlux(sg;land=DewAwareLandHumidityFlux(sg))`，原参数仍由 `.inner` 暴露，没有新增状态。令 `C=ρ Cd V/(1+snow/snow_insulation_depth)`：

```
q > qs(Ts,p):   E = C * (qs − q)
q <= qs(Ts,p):  E = C * max(α qs − q, 0)
```

正蒸发的原始算式和所有参数保留；这不是把全公式改成 `α(qs−q)`。真实露水不被干土系数放大；暖面未饱和情况下被去除的是不具备本模型物理依据的负分支。雪绝热、drag 选择、原生时间层访问、未按陆地比例加权的陆面诊断、加权大气通量和底层湿度倾向均沿用原包。版权和 EUPL 来源头保留。

## 实际 RED / GREEN

- `build/earth-speedy-transport/surface-evaporation-red.log`：原生函数的实际 **9 pass / 13 fail / 0 error**，首组 22 项断言。暖面 300 K、q/qs=0.5、α=0.1 时原生 E=−9.3011 mm/day，应为零；275 K、q/qs=1.2 时干土原生露水比饱和湿差多 5.5 倍。
- `surface-evaporation-green-snow.log`：最终新实现 **22 + 324 = 346 pass，进程退出码 0**。覆盖干/湿土、零 availability、恰好饱和、原正蒸发逐位不变、冷面真实露水；陆地比例 0/0.3/1、三种湿度与三种 availability、无雪/0.05 m 雪、20% 海冰共 54 个混合列。交叉审查发现仅检查守恒不能发现遗漏雪缩放，故在已通过的 292 项基础上追加 54 个直接通量期望值断言；冻结物理源码未变。最终测试 SHA256 为 `87e2449784dd9e91fe359b3527a909cb1bbe7470eafc1410940f7b45a752836f`。
- 测试调用真实 `SurfaceHumidityFlux`、土壤水量和土壤温度倾向函数。验证大气柱水量倾向等于加权 E、土壤储水倾向等于负陆面 E、土壤热储倾向等于 `−Lv E`，以及原海面公式/海冰绝热不变。只检验固定态过程倾向，没有把它称作积分后的全球预算。
- 期间两次测试基础设施问题已保留日志：`surface-evaporation-green.log` 是首版构造器分派错误；`surface-evaporation-green-final.log` 是首组通过后第二测试组的 Julia 小数点语法错误。前者修了新 wrapper 构造器类型限定；后者只修测试第 71 行，未更改首组 RED 断言。最终完整日志才是成功证据。

## 真实检查点反事实

`surface-evaporation-snapshot.jl` 只读四个检查点并绑定它们的 SHA256，生成 `build/earth-speedy-transport/surface-evaporation-snapshot.json`。下表为 India native land 支持（仍含分数陆格）；首行是完整旧轨迹推进至 2006-07-01 的真实瞬时场，其余是不同一年分支的 2007-01-01 终态，不能当作夏季平均。

| 检查点 | 根区总水 / 超萎蔫点水 mm | α | q/qs(Ts) | 负通量且未饱和面积 | 同输入 E 原生→修复 mm/day |
|---|---:|---:|---:|---:|---:|
| 旧 July 1 | 403.36 / 63.36 | 0.2810 | 0.3654 | 96.494% | −3.0141 → +0.02413 |
| baseline 年末 | 413.20 / 73.20 | 0.3096 | 0.3978 | 96.494% | −1.7558 → +0.01161 |
| parcel 年末 | 395.75 / 55.75 | 0.2612 | 0.3301 | 99.127% | −1.6498 → +0.00417 |
| combined 年末 | 396.60 / 56.60 | 0.2658 | 0.3457 | 96.377% | −2.0003 → +0.01906 |

July 1 全部负通量支持点还满足 Ts 大于干绝热外推至地面的空气温度。该固定态修复去除的土壤潜热加热约 87.95 W/m²。这里没有使用月均量计算非线性饱和公式。检查点的储存 E 在最后一次陆面更新之前计算；上述同输入公式采用当前陆面温度与存储的 α/drag/ρ，因而不声称逐位复现存储 E（July 1 存储 E 为 −2.9941 mm/day）。α 重新用当前土壤计算为 0.28117，与存储的 0.28095 接近，也不能混淆二者时间相位。

## 限制与后续

1. 这会改变土地储水、潜热和大气供水，不能由瞬时反事实推断年降水改善。原始一年对照印度降水仍失败，需同初态新对照；不调土壤、RH、drag 或对流参数。
2. 正蒸发仍可能因 α 小而为零；400 mm 深层水不等于湿表面。原生 α 的定义和较粗土层代表性未改变。
3. 冷面露水进入原 bucket；没有新增植被截留、吸附、水汽扩散或霜的物理。原雪绝热/水相处理保留，也没有宣称这些方面已验证。
4. 346 项测试针对 CPU/Float64、原生两土层和八大气层。GPU/自动微分及其它时间步进器未检验；模型长期离散预算另由主线程三天审计验证。固定 0.6 田间容量土壤的倾向级潜热闭合测试，也不能推广为径流/裁剪、变化热容或完整时间积分的能量验证。
