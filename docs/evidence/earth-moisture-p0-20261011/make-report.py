"""Assemble tables from raw recorded evidence; no replacement physics."""
from pathlib import Path
import json, math
ROOT=Path(__file__).resolve().parent
read=lambda name:json.loads((ROOT/name).read_text(encoding='utf-8'))
c=read('comparison.json'); bindings=read('bindings.json')
before=read('before-1800-continuous.json'); after=[read(f'continuous-front-{d}-continuous.json') for d in [1800,900,450]]
names=['亚马孙','刚果','印度','喜马拉雅南麓','青藏','澳洲内陆','澳洲北部','澳洲东部','澳洲西南']
annual='\n'.join(f"| {name} | {r['before1800P']:.1f} | {r['afterP']['1800']:.1f} | {r['afterP']['900']:.1f} | {r['afterP']['450']:.1f} | {r['observedAnnualMm']:.1f} |" for name,r in zip(names,c['regions']))
budget='\n'.join(f"| {r['dt']} | {b['waterResidualMm']:.3e} | {b['enthalpyResidualJm2']:.3e} | {b['maxCellVaporResidualMm']:.3e} | {b['globalNetVaporTransportMm']:.3e} |" for r in after for b in [r['records'][-1]['budget']])
ledger='\n'.join(f"| {name} | {r['wholeArea']['P']:.2f} | {r['wholeArea']['E']:.2f} | {r['wholeArea']['netTransport']:+.2f} | {r['wholeArea']['storageDelta']:+.3f} | {r['wholeArea']['residual']:.2e} |" for name,r in zip(names,after[0]['records'][-1]['regions']))
settings=json.loads(Path('scenes/earth-land-sea/earth-simulation.json').read_text(encoding='utf-8'))['terrain']['settings']
planet=settings['planet'];mu=6.67430e-11*4*math.pi/3*planet['radiusM']**3*planet['densityKgM3']
period=2*math.pi*math.sqrt(settings['orbit']['distanceM']**3/(1.32712440041279419e20+mu))/86400
text=f'''# 地球 P0 首批修复与真实积分验证 · 2026-10-11

**状态：部分完成。诊断口径、步长比较与守恒预算已完成；海到陆供水和区域气候验收未通过。** 当前候选保留在 `codex/earth-moisture-p0`，尚未提交或推广为正式默认。正式 Earth JSON、场景渲染配置、legacy 水循环、classic 地表解析度保持原样。

## 已落地的通用改动

- `climate-diagnostics.ts`：球面交叠面积、GPCC 有效陆地共同权重、按实际秒数累计通量、日历月分箱与独立水汽账本。页面探针明确粗格格心、陆地比例、陆地平均海拔；区分当前空气/混合地表、当地表面、存储参考年均、最近一步通量与真实累计量。
- `circulation.ts`：输运实验的压力替代量移除固定地形温降造成的假区域异常；水汽密度作用使用虚温关系，潜热在实际凝结时进入热预算。仍是诊断势与有界风扰动，**不是预报气压/气团质量的求解器**。虚温公式依据 [MetPy 文档](https://unidata.github.io/MetPy/v0.10/api/generated/metpy.calc.virtual_temperature.html)；这里的整柱质量与系数仍是模型参数，不能据此宣称现实风场已校准。
- `water.ts`：凝结容量按空气热库温度诊断，地表温度单独驱动对流；锋面涡旋抬升随供水湿度差连续趋零，消除极小湿度差触发有限降雨的开关。
- `reference-moisture.ts`：扩大真实耦合积分上限，使 Earth 的 1800/900/450 秒都积分同一实际轨道年。旧上限让 450 秒切换成 4096 步压缩年/规定温度，原比较混用了模型。特殊长年/刚性配置的有界回退仍保留并报告 `coupled:false`。
- 10 项新增回归覆盖球面与日历口径、不同热库凝结、湿度差连续性、地形/虚温风力、真实年细步长。

## 积分与观测口径

基线锁定 `e3222280a0ceddd597245f3c45d75f75d2def9f5`。`bundle.mjs before` 直接读取该提交的水循环、环流与参考初始化源码；后组使用当前源码。**所有完整运行从严格恢复的相同正式第 0 日物理库存开始**；仅实验开关设为 `moistureScheme:transport`、`airRadiationFraction:0.5`，并分别设定步长。`verify-bindings.mjs` 对全部初始 state 字段逐一深比较，仅排除 `stepS`；验证通过。

`integrate.ts` 使用真正的 `ThermalRuntime.sync`、正式约 21.5 万地形单元、48×24 物理气柱、真实地形路由、冰川、动态环流与相变。只包装现有水循环 step 记录其输出，不替换输入、顺序或算子。每一物理步积累 P/E（kg/m²/s × 秒）、净水汽交换（该步 kg/m²）和库存；32 步一次 sync 批处理仅减少显示映射。各运行均到达 365 个实际地球日，并保存 0/24/90/180/270/365 日完整可严格恢复状态；无季节跳转、气候重生成或放大有效 dt。

模型轨道年约 {period:.4f} 地球日。月分箱采用非闰年月份长度按实际轨道年缩放，第 0 日为春分 3 月 20 日；365 日积分比一个轨道年短约 0.25 日，缺少的末段不外推。这里比较一次受初始库存影响的年过程与多年观测常年值，**不宣称达到气候平衡**。参考初始化另做真实一圈 spinup 加一圈记录，属于独立实验，不替代这组运行。

观测为 [DWD GPCC v2022，1991–2020 月常年值，2.5°](https://opendata.dwd.de/climate_environment/GPCC/gpcc_normals_v2022/normals_1991_2020_v2022_25.nc.gz)，固定 SHA-256 `6e08db25ba4eebb0affe9e2519907aa66e24f8e0177d25c3084a7e2085ef0d0b`。提取 3638 个十二个月都有效的观测格；两边使用相同 `区域 ∩ 气柱 ∩ GPCC格` 球面交叠 × 模型陆地比例，缺测区不进入任一分母。模型在气柱内取均匀降水深度，不推断子格分布。GPCC 是地面降水产品；这里没有把卫星表面温度或当地色图当成空气观测。

## 区域验收：未通过

下表全部降水使用 **相同 GPCC 有效陆地面积**。单位 mm，观测为 12 个月常年值之和，模型为实际 365 日累计值。

| 区域 | 前 1800s | 候选 1800s | 候选 900s | 候选 450s | GPCC |
|---|---:|---:|---:|---:|---:|
{annual}

![全年同口径对照](annual-comparison.png)

主要失败项在三个步长上都存在：

1. **印度仍缺海到陆供水。** 1800s 全区域净水汽交换是 −243.23 mm（前组 −251.44），仍为输出；同观测陆地区域夏季 JJA 仅 137.88 mm，GPCC 为 772.51 mm。夏季比冬季湿的方向虽出现，总量与净输入未通过。
2. **南麓/青藏排序错误。** 南麓降水从 0 增至 954.20 mm，但青藏为 1877.29 mm，超过南麓，GPCC 分别约 1307.78/257.39 mm。减小 dt 没有消除该逆序。
3. **澳洲出现回退。** 内陆 1142.80 mm 超过东部 780.75，观测内陆约 276.03；北部夏湿方向存在，但总量过大。西南 DJF/JJA 从前组 71.19/224.06 变成 369.64/193.01 mm，观测 51.30/226.67，冬雨优势被翻转。东部年总量接近不能抵消这些失败。
4. **热带仍有偏差。** 亚马孙由过湿转为偏干，刚果仍过湿；月分布也与 GPCC 不符。

![九区月降水对照](monthly-comparison.png)

## 时间收敛与独立预算

参考初始化修复前的 1800→900s 变化：亚马孙约 2190→2735 mm、澳洲内陆约 723→0；450s 切换回退模型，不能列为同模型收敛。当前真实耦合参考 1800/900/450s 分别完成 35066/70130/140260 步；亚马孙约 1895/1902/1907，刚果约 1853/1845/1842，印度约 501/503/504 mm。原始结果在 `before-reference-valid.json` 与 `continuous-front-reference-valid.json`。

完整地形积分的九区累计 P 在 900/450s 之间最大片区相对差为 **0.209814%**。P、E 与净交换的差随减步变小；水汽库存差总体很小，但不全部单调：西南澳库存的绝对差 1800→900 为 0.064625 mm、900→450 为 0.069399 mm。不能把“接近”写成“所有库存项都单调收敛”。亦未用预设区域精度阈值宣称全部气候状态收敛。

独立预算重加所有真实水库与显热/潜热，不只引用模型自报残差。以下为末日残差，逐格水汽为最大绝对值：

| dt（秒） | 全球水残差（mm） | 全球焓残差（J/m²） | 逐格水汽残差（mm） | 全球净水汽输运（mm） |
|---:|---:|---:|---:|---:|
{budget}

所有记录通过水残差 <5×10⁻⁶ mm、焓 <0.005 J/m²、逐格水汽 <10⁻⁸ mm 的检查。参考两圈细步长水残差最大约 4.32×10⁻⁶ mm；大量海库小额转账有浮点累积误差，未伪报 <10⁻⁶。各完整运行均记录严格保存/恢复后下一步 snapshot 完全相等。

下表采用**整个区域矩形面积**，供气柱预算闭合；不能与上表有效陆地区域 P 混为同一分母。1800s 单位 mm；正净交换为输入；恒等式 ΔW − E + P − 输运 = 0。

| 区域 | P | E | 净水汽交换 | ΔW | 预算残差 |
|---|---:|---:|---:|---:|---:|
{ledger}

![步长差与供水方向](convergence-supply.png)

净输入/输出与海库存检查提供供水方向证据；模型没有水源示踪器，不能将所有净输入逐一归因为某片海洋蒸发。守恒通过证明账本正确，不能证明季风、雨影或干湿分布正确。

## 隔离实验与下一项结构问题

隔离源码替换只写 `build/earth-moisture-p0/ablation-*.mjs`，**未加入产品**。保留失败结果避免反复调同一旋钮：

- 诊断势系数 50→200：印度参考降水上升，但热带偏干、青藏和澳洲内陆更湿，排除。
- 去掉全部地形抬升或仅去掉已由空气温降解析的部分：青藏过湿只小幅减少，不能独立解释区域问题，排除作为修复。
- 压力改用粗空气热库温度：亚马孙/印度近零雨，排除。
- 去掉南北风背景、减弱陆地背景、用广域平滑湿静能中心移动南北/全部风场、改用地表能量中心：印度有些实验改善，但热带或澳洲沿海出现明显回退，均未采用。

现有模板把收敛中心限定在 0.4×太阳赤纬（最大约 9.4°），使印度纬度的背景南北风全年指向南。这是可能阻碍夏季输入的结构性原因，属于代码和消融支持的诊断推断；本轮简单乘强度或移动整套纬带未能同时修复低层供水、山脉阻挡与副热带下沉。近地湿静能最大值仅作为消融假设；[相关理想化季风研究](https://journals.ametsoc.org/view/journals/atsc/64/5/jas3916.1.xml)提供理论动机，[存在临近沙漠的研究](https://journals.ametsoc.org/view/journals/clim/29/13/jcli-d-15-0747.1.xml)也明确指出这类诊断不能直接作为定量预报闭合。这里没有把研究关系当作调参许可证。

尚需一般性的低层环流/海陆供水与地形雨影闭合，并把对流、锋面、地形贡献分别诊断；当前有界压力扰动叠加固定模板无法据此称为已修好的季风。继续修改前应使用海陆交换/升温/季节反转的合成场检验闭合，再重复这些真实区域积分。当前候选保留为可复查实验，不标记 P0 完成。

## 视觉证据与浏览器阻塞

已保存同视域、同轴尺度的二维**真实积分诊断页**前后截图：

- [修复前截图](diagnostic-before.png)
- [当前候选截图](diagnostic-after.png)
- [浏览器核验记录](diagnostic-browser-audit.json)，[可切换诊断页](viewer.html)

![当前候选诊断页截图](diagnostic-after.png)

**地球 WebGL 场景的前后截图仍未完成。** Chrome 原验证页出现 WebGL 上下文丢失，关闭本次旧地球标签/新建或刷新后仍提示需要 WebGL2，并在启动时读到 null ARRAY_BUFFER。未重启用户浏览器或关闭其它工程标签。故障页面证据：[webgl-blocker.png](webgl-blocker.png)、[错误记录](webgl-errors.json)。最初空白截图的“两次 RAF 已完成”只是控制/回调检查，不能证明渲染有效；所有这些 JPG 与原记录已移入 `invalid-captures/`，**不得作验收图**。二维图与截图不能冒充地球渲染的视觉验收。

另有首次参考脚本误把归一化高度当米，已放入 `invalid-experiments/before-reference.json` 并排除。所有有效参考脚本均使用 `height * planet.reliefM`；历史 reassessment 证据保持只读。

## 检查、绑定与复现

`npm test` **223/223**；`npm run typecheck`、`npm run build`、`git diff --check` 均通过。新增缺陷回归先在原行为下失败，再在修复后通过。独立 [REVIEW.md](REVIEW.md)仍保留三个区域 P1 未通过项，测试绿色不覆盖这些结果。

正式输入 SHA-256：`afb80a8ab730785eed0cb709a66d938ad20a9690b04ecfa1246d1deb393adca6`。默认/源代码/完整运行 bundle/全部保存状态哈希绑定见 [bindings.json](bindings.json)；同初始库存深比较与严格恢复均通过。原始量与接受门见 [comparison.json](comparison.json)、`before-1800-continuous.json`、`continuous-front-{{1800,900,450}}-continuous.json`。原始完整 JSON 快照在本地 `build/earth-moisture-p0/`（生成文件，不提交正式场景）。

在仓库根目录用 PowerShell：

```powershell
python -X utf8 docs/evidence/earth-moisture-p0-20261011/extract-gpcc-grid.py
node docs/evidence/earth-moisture-p0-20261011/bundle.mjs before
$env:P0_LABEL='before'; $env:P0_DT='1800'
node build/earth-moisture-p0/integrate-before.mjs
node docs/evidence/earth-moisture-p0-20261011/bundle.mjs after
$env:P0_LABEL='continuous-front'
foreach ($p0Dt in @('1800','900','450')) {{
  $env:P0_DT=$p0Dt
  node build/earth-moisture-p0/integrate-after.mjs
}}
python -X utf8 docs/evidence/earth-moisture-p0-20261011/summarize.py
python -m pip install --target build/earth-moisture-p0/python matplotlib
python -X utf8 docs/evidence/earth-moisture-p0-20261011/plot.py
node docs/evidence/earth-moisture-p0-20261011/verify-bindings.mjs
```

GPCC 提取使用历史证据中固定的原始 gzip 与只读解析器；缺少该文件须按上述 DWD 链接取得同 SHA 文件。参考消融可用 `ablation.mjs <variant>` 后设 `P0_LABEL` / `P0_DTS` 运行生成 bundle。保存路径由 label 区分；重跑要先保留需要比较的现有结果。
'''
(ROOT/'REPORT.md').write_text(text,encoding='utf-8')
print('REPORT.md assembled from raw recorded integrals.')
