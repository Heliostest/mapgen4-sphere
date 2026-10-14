# 短波云、默认长波与灰体地表边界复核

默认长波没有云或水汽辐射反馈，这是明确的 Frierson 灰辐射设计，不是遗漏了云参数的调用错误。当前实验确实组合了有云短波与这种理想化长波，不能称为原 Fortran SPEEDY 的完整辐射方案。没有发现长波温度单位、通量符号或柱能量漏项；另有一个独立、可复现的灰体地表边界错误：发射率小于 1 时遗漏地表对下行长波的反射。

本次未改任何旧 include、run、protocol、安装包或正在运行的六年配置。后获授权的可选反射修复仅位于 `longwave-corrected.jl`，测试位于 `longwave-test.jl`。

## 配置与调用证据

本地路径以 `build/earth-speedyweather/depot/packages/SpeedyWeather/qRu16/src/parameterizations/` 为根：

| 文件与行号 | 实际行为 |
|---|---|
| 新实验 `transport-model.jl:16` | 只给 `Radiation` 指定短波组件 |
| `radiation/radiation.jl:23–28` | 默认 `longwave=OneBandLongwave(SG)` |
| `radiation/longwave_radiation.jl:168–174` | 默认 `FriersonLongwaveTransmissivity` 与 `OneBandLongwaveRadiativeTransfer` |
| `radiation/longwave_transmissivity.jl:44–78` | 仅从纬度和归一化气压计算层透过率，不读 q、主云量、云顶或层积云 |
| `radiation/longwave_radiation.jl:228–282` | 用空气温度、SST、第一层土温和层透过率求上下行长波；同样不读云 |
| `radiation/shortwave_transmissivity.jl:85–148` | 短波吸收读 q、主云量和云顶 |
| `radiation/shortwave_radiation.jl:188–226` | 主云在云顶反射；层积云作为近地表反射处理 |

长波光学厚度为 `tau0=6+(1.5-6)*sin(latitude)^2`、`tau=tau0*(0.1*sigma+0.9*sigma^4)`，层透过率为 `exp(-delta_tau)`。这与 Frierson 2006 的式 (4)–(7) 对应；论文明确排除水汽变化的辐射效应及云，地表原边界则是黑体 `U=sigma_SB*Ts^4`。因此给灰长波加入云光学厚度会是一个新的物理方案，不能凭缺少云响应直接指定唯一修复公式。[原论文，第 2551 页](https://math.nyu.edu/~gerber/courses/2016-fruhling/frierson_held_zurita-gotor_JAS-2006.pdf)

相对地，原 Fortran SPEEDY 会使用 q、cloudc、云顶计算多波段长波透过率；其独立 `clstr` 在这段长波透过率中也未被直接使用。不能推断“所有层积云都必须直接按同一短波云量加进长波”。[固定提交的原始实现，第 172–205 行](https://github.com/samhatfield/speedy.f90/blob/0ebfdbfcd62efd46dd1802284908645be4b230be/source/shortwave_radiation.f90#L172)

## 一年分支的辐射变化

直接来源：下面五个已完成 `build/earth-speedy-transport/*-statistics.json`，不把动态重建的 `candidate-fields.json`、`sensitivity-comparison.json` 或总 `report.md` 作为冻结输入。每组 `sum(monthly.seconds)=31536000`；出射均值由 `statisticsBudget.terms.outgoing{Shortwave,Longwave}Jm2/31536000` 得到，净量由 `statisticsBudget.toaNetJm2/31536000` 得到。以下均为 W/m²，正的出射表示离开地球系统，净量为入射减两项出射。五组入射均为 341.250598。

| 分支 | 出射短波 | 出射长波 | TOA 净量 | 相对 baseline 的净变化 |
|---|---:|---:|---:|---:|
| baseline | 114.2205 | 242.4478 | -15.4178 | 0 |
| clouds-precip | 146.5562 | 235.8730 | -41.1786 | -25.7608 |
| clouds-full | 146.8618 | 235.7166 | -41.3278 | -25.9101 |
| parcel | 113.2181 | 237.4375 | -9.4049 | +6.0128 |
| combined | 143.6834 | 232.0400 | -34.4728 | -19.0551 |

| 文件名（均在上述 build 目录） | SHA256 |
|---|---|
| baseline-sensitivity-v2-statistics.json | `90fd09302b1fb1b2c08f12ae2b3d967cf3f710172fe40d0d2fed73f049767304` |
| clouds-precip-sensitivity-statistics.json | `5ddde17db76b8a367135f72c9d027a39f7df48ec1cc1db1862353ed416598d5b` |
| clouds-full-sensitivity-v2-statistics.json | `bb157a16cff7d76fd5f8fd6efd02a06e295ddddc494b727d2dbff2f4441559ba` |
| parcel-sensitivity-statistics.json | `18cc29d1f9c99eadf65a58c45171f911f83f8035b0d18d5d5bfed57ea823905c` |
| combined-sensitivity-statistics.json | `ce9bdd662a8959fa6849a26dfb5ec78ebdc781559e6e2f2bdca4617e8859eb57` |

完整云修复对应短波出射 +32.6413、长波出射 -6.7312，净变化 -25.9101。降水云量修复分支已经出现绝大部分净变化；再修 G 只使该一年均值多变 -0.1492。这里的长波变化来自温度/地表状态变化，并非直接云光学效应。以上是相同 2006 初态的一年响应，不是平衡气候；TOA 为负也不等于数值能量不守恒。规定海温的外部热交换由现有 driver 单独记录。

## 单位、符号与只读原生验证

`T`、SST 和土温均以 K 存储；`stefan_boltzmann=5.67e-8` 与 `T^4` 给 W/m²。`tendencies.jl:105–108` 实际执行 `g*flux/delta_p`，所以 `flux/cp` 转为 K/s；个别注释写成 K·Pa/s 不改变实际算式。相邻层通量一减一加，地表向上通量先进入底层，TOA 向上通量离开顶层，向下地表通量离开底层。海洋与土壤能量方程使用 `D_surface-U_surface`，符号一致。

独立原生只读单柱调用（通过 stdin 运行，无新模型文件）得到 9/9 诊断断言通过：

- 在空气 T=285 K、陆海表面 300 K 固定时，q 从 0.002 改为 0.02、cloud_cover 从 0 改为 1、云顶从 9 改为 3，长波通量与全部 8 层温度倾向逐值完全相同。
- 该柱 `U_surface=450.0846`、`D_surface=373.146652854`、`OLR=374.267577257`、柱加热 `Q=-297.329630111`。`Q+D_surface-U_surface+OLR` 为 5.68×10⁻¹⁴ W/m²。
- 完全透明大气的全部空气加热为零，地表下行长波为零，OLR 等于地表上行。

云/水汽不敏感性的可复现代码（本项目固定 Julia 环境）：

```julia
using SpeedyWeather, Test
const SW=SpeedyWeather
sg=SpectralGrid(NF=Float64,truncation=32,nlayers=8)
m=PrimitiveWetModel(sg;feedback=nothing)
v=initialize!(m).variables
ij=argmin(abs.(m.geometry.latds))
function response(q,cloud,top)
    SW.reset_tendencies!(v,m.time_stepping);SW.reset_variables!(v)
    for step in 1:2
        SW.get_step(v.grid.temperature,step).data[ij,:].=285.
        SW.get_step(v.grid.humidity,step).data[ij,:].=q
    end
    SW.get_step(v.prognostic.ocean.sea_surface_temperature).data[ij]=300.
    SW.get_step(v.prognostic.land.soil_temperature).data[ij,:].=300.
    m.land_sea_mask.land_fraction[ij]=.3
    p=v.parameterizations
    p.surface_pressure[ij]=100000.
    p.cloud_cover[ij]=cloud;p.cloud_top[ij]=top
    SW.parameterization!(ij,v,m.radiation.longwave,m)
    return (p.surface_longwave_up[ij],p.surface_longwave_down[ij],
        p.outgoing_longwave[ij],copy(SW.get_step(v.tendencies.grid.temperature).data[ij,:]))
end
@test response(.002,0.,9.)==response(.02,1.,3.)
```

## 独立确定问题：遗漏灰体地表反射

`longwave_radiation.jl:209,212` 默认陆海发射率均为 0.98；244–253 行仅赋 `U=epsilon*sigma_SB*Ts^4`。向下束完整进入地表热收支，却从未把 `(1-epsilon)*D` 返回上行束。对单波段不透明灰体，正确边界为 `U=epsilon*B_surface+(1-epsilon)*D_surface`。吸收率与发射率一致，地表上行长波包含自身发射与下行长波反射。[USACE 官方 Kirchhoff 说明](https://www.hec.usace.army.mil/confluence/hmsdocs/hmstrm/meteorology/longwave-radiation/longwave-radiation-basic-concepts)，[ECMWF 官方上行长波定义](https://codes.ecmwf.int/grib/param-db/211)

所有层及地表均 300 K、层透过率均 0 的反例：原生 D=459.27、U=450.0846 W/m²，地表净吸收 +9.1854、最低层加热 -9.1854 W/m²。底层和地表同温时这项交换应为零；最高层仍可向太空冷却，测试不要求整柱平衡。原生柱总能量依然闭合，因此仅测总能量守恒发现不了此边界错误。

它不解释上述云修复的 25.91 W/m² 增量冷却：所有分支都使用同一错误地表边界。在固定温度场下，补反射对 OLR 的直接增量为 `R_surface*product(layer_transmissivity)>=0`，并减少地表净吸收、增加沿途大气吸收，不能作为抵消短波云冷却的经验补偿。

独立可选组件 `ReflectingLongwaveRadiativeTransfer` 先保留原生求解，再加入反射上行束及沿途吸收。没有长波散射，所以下行求解不受反射影响。`epsilon=1` 或 D=0 时直接保留原生结果；不改发射率、光学厚度、温度、云参数或变量声明。

```julia
include("longwave-corrected.jl")
longwave=SW.OneBandLongwave(sg;
    radiative_transfer=ReflectingLongwaveRadiativeTransfer(sg))
radiation=SW.Radiation(sg;shortwave=existing_shortwave,longwave)
```

验证完成：原生 RED 为 **149 通过、26 失败、0 error，共 175 项**；修复 GREEN 为 **175/175 通过**。两次运行使用相同测试 SHA256，运行前后源文件未变化。覆盖 epsilon=1 在默认/不透明/透明三类大气中通量和 8 层倾向逐值原生等价、epsilon=0 全反射、epsilon=0.25/0.98 同温不透明柱零底层—地表净交换、透明大气零加热，以及三种陆海比例与不同陆海发射率/温度。全部受测列能量残差小于 10⁻⁹ W/m²，默认实际 Radiation 列残差为 5.68×10⁻¹⁴ W/m²。

默认实际列中，补反射使地表上行从 432.961548138 变为 440.666233197 W/m²，OLR 从 289.877195580 变为 289.896383905 W/m²，地表下行仍为 385.234252942 W/m²。300 K、epsilon=0.98 的不透明柱底层残余交换降至 2.60×10⁻¹⁴ W/m²。首轮修复仅在全反射混合像元出现 1 ULP 的严格等值失败；最终先混合反射率再乘公共下行束，测试和阈值未改。首轮日志保留为 `longwave-fixed-attempt1.*`。

- 可冻结实现 SHA256：`b047709d264a07e057152af95a6f9f1d6e1b78550441909dbc51935fd1053785`
- 共同测试 SHA256：`071204fd1bd3c6435fd609120d5cec11ca173c2401f07ba71431e9d60ae0d10a`
- 组件按 EUPL-1.2 标注来源，许可全文复用本目录 `cloud-LICENSE-SpeedyWeather.txt`。

复现测试：设置 `JULIA_DEPOT_PATH` 为项目 `build/earth-speedyweather/depot`，运行 `build/earth-speedyweather/runtime/julia-1.12.7/bin/julia.exe --startup-file=no --project=docs/evidence/earth-speedyweather-20261012/julia-env docs/evidence/earth-speedy-transport-20261013/longwave-test.jl`。环境变量 `LONGWAVE_IMPLEMENTATION=native` 或 `fixed` 选择两种实现。原始输出与运行前后源哈希在 `longwave-{native,fixed}.{log,json}`。

本次读取的原包 SHA256：

- `radiation.jl`: `8676820bda17c8f9c1ae757792229ed3712c8103eff34c82f825ddeaae73478f`
- `longwave_transmissivity.jl`: `cd0e734214fcfe3fdace913fbfa67866421ca9c62e8362dc0d0a54cc8bf6856c`
- `longwave_radiation.jl`: `1899b317633a80abaf5a7024c88ee14753e835d3084b2adc7d3d8555ff5d5fbe`
