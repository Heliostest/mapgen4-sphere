# web-exoplasim-qol 气候模拟借鉴调研

调研日期：2026-11-25。上游固定版本：`Astervolans/web-exoplasim-qol@daface8c0846dfa2beeda9c98756b2cfc4350937`。
本地核查版本：`mapgen4-sphere@f2aa8ea5d8025b87673ce89108f660603807cae0`。仅新增本文，不修改模拟代码、参数或正式地球存档。
范围：阅读项目源码、构建清单和项目自身实验记录；本次没有运行其模型，也没有独立复现作者的性能、气候或精度结果。
“源码事实”和“建议/推断”分开列出；历史实验记录不能自动代表当前每个分辨率、参数组合都已通过验证。

## 结论

值得借鉴。它的重要价值是把已有 ExoPlaSim 的分层大气动力和物理过程搬进浏览器，并把地形输入、后台计算、诊断、月均/多年分类与续算组织成完整工具链。[A1][A2][A3]
但不能仅凭自然的天气图认定其区域气候准确：项目自己保留了地球偏暖、降雨分类偏差、GPU 长期一致性尚未完整通过等证据。[A1][A19][A11]
对本项目更有价值的方向，是用它建立独立的气候参考与对照流程，再决定是否引入整套可选后端；孤立复制几个降雨、云量系数，不能得到同样的大气环流能力。此为架构判断。

## 1. 项目能力来自哪里

源码事实：README 把此仓库定义为个人自用 fork，主要新增中文、行星参数图示、地形朝向、恒星直射点与气候带叠层、潮汐锁定提示等 QoL 功能，而非重做气候模型。[A1]
CPU 构建固定上游 ExoPlaSim `5f8dff4`，经项目补丁编译为 WASM；页面已有 T21/T42、5/10 大气层、2/4/8 workers 的资源。实际 manifest 的四组精度均为 `precisionBytes: 8`。[A2][A3]
GPU 的核心是 WGSL 计算，不只是渲染：`STEPPER.kernels` 明确执行动力核、湿度修正、地表通量、辐射、降水、地表、碳循环和诊断，再把物理倾向送回谱空间。[A4]

| 维度 | 上游源码/记录确认的能力 | 对借鉴的含义（推断） |
| --- | --- | --- |
| 水平网格 | T21 64×32、T42 128×64，GPU 另有 T63 192×96 | 地形显示网格无需等同求解网格 |
| 垂直维度 | 5/10 层，sigma/半层及层厚用于动力、通量、饱和湿度和辐射 | 不能用陆温/海温两个储热项代替垂直大气 |
| CPU | Fortran→WASM、共享内存 workers、FP64 | 可作为独立数值对照，需跨源隔离支持 |
| GPU | WebGPU compute、积分状态 FP32，部分初始化表在 JS FP64 计算 | 移植时需专门验证阈值过程和长期统计 |
| 展示 | 实时、月、年、多年分类；高分地形降尺度 | 画面细节不能作为物理分辨率证据 |

上述分辨率与后端依据：[A1][A2][A3][A5]。谱变换表和状态格式依据：[A10]。

## 2. 最有价值的物理设计

**分层动力和热/湿输送。** `dynamics` 同时维护谱空间、Fourier 空间和格点空间场；Fourier/Legendre 变换把涡度、散度等动力量转换为各层风，格点上形成温度/水汽通量，物理过程后把倾向送回动力核。整条链是耦合系统。[A4][A6][A10]
建议：若目标是季风、急流和大尺度风暴，应优先解决大气动力与热湿平流的闭环；只改降雨公式不可能补足这部分结构。并不意味着必须照抄谱方法，而是需要相应的动力自由度和输送机制。

**辐射受大气和云影响。** 短波采用 0.75μm 分界的两波段、层间 adding method，含臭氧/水汽吸收和云液水光学；长波使用水汽、臭氧、CO₂ 的宽带发射率并包含压力展宽，云发射率也依赖液水。[A7][A8]
建议：相比直接调地表有效发射率，分层辐射能够明确温室气体、云和垂直温度的作用；但它仍是简化参数化，不能等同完整光谱逐线求解。

**把对流雨与大尺度凝结分开。** `PRECIPITATION` 依次执行 Kuo/浅对流、干对流调整及其限制、大尺度凝结、降雨和云诊断；Kuo 读取各层温湿度和压力。云量来自对流雨、超过临界相对湿度的层云以及随机重叠，而非单一地表湿度阈值。[A9][A21]
建议：这比“单层水汽超过容量就下雨”有更多物理表达能力；单独搬其 `kuo` 或 `mkclouds` 不成立，因为它们依赖整根大气柱、层厚、压力、时间离散和通量倾向。

**海洋仍然简化。** `oceanstep.wgsl` 写明 slab ocean、单层、无 LSG 动力海洋，混合层海温根据热通量和混合层深度变化，海冰和海洋交换热量。[A12]
建议：这是适合浏览器的成本折中，不宜据此宣称能准确再现洋流对区域气候的影响。

## 3. 可以直接借鉴的工程结构

**模型和页面之间使用稳定接口。** `GcmRunRequest` 输入 `config / terrain / resolution / publishEvery / restart`，输出 `onSnapshot / onAverages / onStatus / onCheckpoint`；运行句柄提供 pause/resume/checkpoint/stop。[A13]
建议：本地保留地形编辑与球体渲染，以适配层对接求解器；无需为了接气候模型重写编辑器。

**地形边界按物理量转换。** `GCM_BOUNDARY.fromTerrain` 在模型纬圈单元上重采样地形，分别产生 landFraction 与 `gravity × elevationM` 的位势，输出 172 海陆和 129 地形 `.sra` 文件。[A14]
建议：复用米制高程、物理重力和经纬度契约；必须检查南北顺序、经度原点、地图旋转、海陆比例和面积权重。视觉夸张高度不应进入物理边界。

**Worker 的吞吐和交互一起设计。** GPU worker 持有 GPUDevice；批次预算、最多在途批次与页面确认形成背压，避免模型跑远后 Pause 长时间追不上。准备地形边界和显示网格也放进短命 worker，支持取消和错误清理。[A20][A22]
建议：若引入 WebGPU 计算，按帧回传必要快照、关闭月份时回传统计，明确 GPU 与渲染共用设备负载时的暂停延迟预算。

**完整续算要包含隐藏状态。** 集成说明仍记录 CPU/GPU 格式 22/23，但本次实施核对固定版本 `checkpoint/index.ts` 的实际 `FORMATS` 已为 24/25，并兼容读取22/23。GPU 保存模型场、温度窗口和发布间隔相关状态；引擎间不通用。旧研究文档中的格式 3 也是历史描述，应以当前源码为准。[A5][A20][A23]
建议：检查点必须保存求解器内部状态和统计累计器；仅保存屏幕上温度、云图不足以恢复相同演化。

## 4. 气候统计：结构可学，平均方法需审查

源码确认 `CLIMATE_YEARS = 10`，仅选择拥有 12 个不同月份的完整年份，再把对应的一月、二月等各自平均；不足十年时使用已有完整年。它不是把最新 120 个任意月份混成一张图。[A15]
Köppen/Pasta 分类接收这些对应月数据，降水从日率乘 `yearDays/12` 得月量，温度与其他场按具体分类方案读取。[A16]
但月累计器对**已发布的快照**求样本均值，并非每物理步按秒积分；年均又把 12 个月等权。源码也明确注释 PlaSim 使用十二个等权采样月份。[A15]
建议：借鉴“实时天气 / 月均 / 年均 / 多年分类”的数据层次；本地若使用不同月长、轨道日历或自适应采样，必须按实际秒数积分并在日历边界切分，不能原样复制这里的平均算法。

`GCM_BALANCE.assess` 检查的是：年能量收支的十年滑动均值取绝对值，计算五点斜率，再对最近最多 30 个斜率平均，TOA 与地表的绝对漂移都低于 `5e-4 W/m²/year` 才标 balanced；至少 14 年才能给出判断。[A17]
该判断不要求 TOA 净值本身接近零，也不要求温度或区域降雨接近观测。建议同时显示净残差、温度趋势、样本长度和区域验证状态，不将 balanced 翻译成“气候正确”。

## 5. 不能省略的验证边界

1. **有数值验证不等于全面通过。** 项目做了初始化、单模块、短轨迹、气候统计和检查点续算的分层验证，且与同源原生 FP64/FP32 Fortran 比较。[A5][A18][A19]
2. **阈值敏感是真实问题。** 历史短轨迹和 T42 fresh-start 测试保留了失败项：极小浮点差异触发对流层数、湿度修正或云层开关变化，短波可因此明显改变。[A18]
3. **长期 GPU 一致性未完整建立。** 文档 T21 V5 用十五年参考、比较第 6–15 年；两个 GPU seed 分别有云量或地表气压未通过既定阈值。作者接受其为噪声，但没有完成原计划三十年参考；T42 当时没有气候参考。不能转述成“GPU 已完全等价”。[A19]
4. **地球预设偏暖不能简单怪 FP32。** 相同页面输入下原生 FP64、历史 ExoPlaSim 3.2.4 也变暖。另一个组合不同的 author recipe 跑到第 71–80 年得到全球 2m 温度 15.8871°C；改变了地形、地表气候文件、时间步等，不能把降温单独归因于湿土反照率。[A11]
5. **区域降水未获准确性保证。** README 提醒 As/Cs/Ds 等干夏分类可能过多；多年平均只能减小年际噪声，不能修复系统性降水偏差。[A1]
6. **冰川和诊断覆盖有缺口。** 当前集成保留连续运行的积雪持续性→冰川形成生命周期不完整；GPU 海平面气压及非最低层相对湿度没有实现，相应保留槽位不能当成物理结果。[A5]

建议：先做相同输入下的后端对照与真实地球区域检验，再决定是否用于默认模式；保留失败数据和来源哈希，分别评价数值稳定、守恒、气候漂移、区域真实性以及性能。

## 6. 资源和许可边界

源码事实：上游声明 GPL-2.0，编译模型也有对应许可与固定源版本/补丁；地球地形则另有 WorldClim 数据条款，README 说明非商业使用与再分发/商业授权限制，并记录海底输入来源尚不明确。[A1]
建议：借鉴架构、公开物理关系与实验方法可以独立实现；实际引入其源码、WASM 或数据前，核对各自许可。Worker/iframe/独立目录的技术分隔本身不能作为免除许可义务的依据。优先沿用本项目已有地形数据，不复制其捆绑地形资源。

## 7. 本地对照与接入建议

### 7.1 当前真实执行路径

本地气候求解默认是 48×24 等面积网格，共 1,152 格；96×49 地表参考网格和地球场景的 215,348 个地形三角形属于不同层次。增加地形三角形不会自动提高大气求解分辨率。[L1][L2][L3]

`ThermalRuntime.sync` 调用 `ThermalModel.advanceTo`；每步之后由 `AtmosphericCirculation.step` 更新水平风，再由 `EnvironmentModel.step` 耦合水循环、潜热等过程。当前 `ThermalModel` 每格只有一个空气温度，独立陆面/海面温度是表面热储层；`AtmosphereCheckpoint` 只有一对水平风及其状态，没有分层大气。[L1][L4][L5]

空气温度的水平输热调用 `heatTransport`，没有按实际风场平流大气显热；现有风场闭合也明确不预报干空气柱质量或气压。C9–C11 的分层动力、几何及压力波研究仍是独立实验，尚未接入此运行路径。[L1][L4][L5][L6]

这并不表示现有水循环没有动力或守恒：风驱水汽输送、凝结潜热、陆海储热、海冰、冰川、土壤水和地表路由已经存在。最需要补的是分层动力、热量输送、湿过程之间的一致反馈。[L4][L7]

现有季风诊断已给出取舍依据：六组相同初态的首年实验中，换用外部水汽输送风代理使华南雨峰从 8 月提前到 6 月、月降水 MAE 从 50.18 降到 24.36 mm；六个重叠东亚诊断区的平均 MAE 下降 24.37%。但长江雨峰仍在 7 月，日韩也有恶化。此处引用既有归档，未重新积分；这是非默认共享水汽基线上的敏感性实验，不能当作模型自主产生季风的证明。[L8]

### 7.2 可选路线与推荐

下表是本次调研建议，尚未作为实施设计确定。

| 路线 | 能得到什么 | 代价和限制 | 建议 |
| --- | --- | --- | --- |
| 借鉴统计、诊断、交互 | 月/年/多年气候图、气候带、样本长度与漂移提示 | 不能补足缺失的大气动力 | 可以先做，独立于内核选择 |
| 外置 ExoPlaSim 参考运行，结果回到本地对照 | 用同一份地形直接比较分层 GCM 与现有模型，验证收益 | 需要地形/日历/单位适配；参考自身也有偏差 | **优先验证的路线** |
| 直接接成可选实时气候后端 | 保留编辑器与球体，使用整套分层模型 | 涉及资源、worker、打包、存档、物理耦合与许可安排 | 前述对照证明收益后再决定 |
| 把上游若干湿过程搬进当前单层模型 | 部分参数化有参考价值 | 缺少其压力/层厚/热湿倾向状态，难以还原原行为 | 不作为改善季风的主路线 |

### 7.3 第一个可验证增量

1. **冻结输入并导出地形。** 沿用本地 NOAA ETOPO 与 Natural Earth 数据，导出独立海陆掩膜和米制高程；固定行星半径、重力、太阳通量、自转、倾角和轨道。数据使用原始物理高程，去掉显示高度夸张；冰面/基岩定义也必须一致。先验证陆地面积、极点、经度方向和高原/山脉位置。[L3][A14]
2. **在独立页面或进程运行参考。** T21、10 层用于打通流程和长期统计；T42 用于检查地形与区域结果对分辨率的敏感性。优先保留 CPU/WASM FP64 参考，再比较 GPU FP32；本机速度尚未测量，不能沿用作者硬件的吞吐承诺。完整记录实际 namelist、初态、资源哈希和地表气候资料开关，避免相同界面参数对应不同实际输入。[A3][A11][A13]
3. **先导回只读诊断。** 导入气温、降水、蒸发、地表/各层风、云和能量通量及其月均，叠在现有球体上与现有结果比较。比较时保留各模型的物理层次；当前单层风不能标为 850 hPa。sigma 层也不能直接按层号冒充等压面，未来做 850/500/200 hPa 对照需要垂直插值与地下格点屏蔽。
4. **用共同支持和日历验收。** 沿用本地 `matchedSupport` 与 GPCC 有效陆地支持；明确春分起始、模型年长、月份边界与实际累计时长。已有 `CalendarFlux` 按秒积分通量，可以扩展为温度/风的时间加权均值和多年同月统计，避免统计受画面刷新频率影响。[L9][A15]
5. **检查季节与空间。** 除全球均温、年雨量、TOA/地表净通量与漂移，还应检查华南—长江—华北雨峰推进、低层输水汽通道、急流及外部地区，至少覆盖印度、欧洲、亚马孙、刚果和两极。热身期与统计期分开保存；最新十年平均本身不能证明已平衡或与观测吻合。[L8][A17]

这一增量的产物应是相同地形的可复跑输入、月均对照和误差报告。现阶段不把 GCM 降雨同时写入现有 `WaterModel`：两个模型若各算一次蒸发/降水/潜热，会重复交换水和能量。后续接实时后端时，需要明确大气、海洋、雪冰、土壤和路由各由哪个模型持有库存，按边界通量耦合；其范围远大于更换一个降雨函数。

### 7.4 接口与工程落点

- 计算接口可参考上游 `GcmRunRequest` 的输入、快照、统计、暂停和续算契约；本地新增适配层，不把其状态硬塞进 `ThermalCheckpoint`。[A13][L1]
- 上游是 Vite、别名导入和 WGSL `?raw` 资源，本地是 esbuild/WebGL2；源码并非复制目录即可运行。CPU 还依赖 `SharedArrayBuffer`，本地服务当前没有 COOP/COEP 头；实际接入需核对资源路径、WASM 响应类型、隔离头和 worker 构建。独立参考运行能先减少这一阶段的耦合。[A13][L10]
- 显示插值与物理重映射分开：标量颜色可双线性插值，降雨/蒸发的总量与库存转移要采用面积守恒重映射；风向还要保留球面切向基的约定。高分辨率地形订正只声明为显示/统计降尺度，不能称新增了局地动力。[A14][L2]
- 地形或物理参数变化后，已有气候结果需标明所属输入版本并失效/重算；多年的气候参考不应在每笔画刷后无提示地当作新地形结果。
- Köppen 和多年气候统计可作为独立图层，保留样本年数、是否仍在热身、数据层含义；不能用一帧湿度或第零天生成参考代替真实累计气候。[A15][A16][L11]

本地来源：以下路径均相对本文，可直接核对；核查版本见文首。

[L1]: ../../thermal.ts
[L2]: ../../surface-grid.ts
[L3]: ../../scenes/earth-land-sea/README.md
[L4]: ../../thermal-runtime.ts
[L5]: ../../circulation.ts
[L6]: ../evidence/earth-pressure-waves-20261015/CURRENT-STATE.md
[L7]: ../evidence/east-asia-monsoon-formation-20261015/MODEL-AUDIT.md
[L8]: ../evidence/earth-monsoon-forcing-20261015/REPORT.md
[L9]: ../../climate-diagnostics.ts
[L10]: ../../scripts/serve.mjs
[L11]: ../../surface.ts

## 一手来源（全部固定在本次上游版本）

[A1]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/README.md#L7-L90
[A2]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/scripts/exoplasim-wasm/README.md#L1-L51
[A3]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/public/gcm/manifest.json#L1-L52
[A4]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/src/model/climate/gcm/stepper/index.ts#L121-L161
[A5]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/docs/climate/exoplasim-webgpu-integration.md#L1-L58
[A6]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/src/model/climate/gcm/dynamics/index.ts#L27-L64
[A7]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/src/model/climate/gcm/physics/radiation/wgsl/swr.wgsl#L51-L56
[A8]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/src/model/climate/gcm/physics/radiation/wgsl/lwr.wgsl#L30-L34
[A9]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/src/model/climate/gcm/physics/precipitation/index.ts#L81-L168
[A10]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/docs/climate/exoplasim-webgpu.md#L140-L195
[A11]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/docs/climate/exoplasim-native-versions.md#L1-L118
[A12]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/src/model/climate/gcm/physics/ocean/wgsl/oceanstep.wgsl#L1-L44
[A13]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/src/model/climate/gcm/runner/types.ts#L18-L74
[A14]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/src/model/climate/gcm/boundary/index.ts#L13-L81
[A15]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/src/model/climate/gcm/averages/index.ts#L22-L234
[A16]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/src/model/climate/gcm/classification/index.ts#L29-L84
[A17]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/src/model/climate/gcm/balance/index.ts#L6-L73
[A18]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/docs/climate/exoplasim-webgpu.md#L564-L660
[A19]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/docs/climate/exoplasim-webgpu.md#L662-L691
[A20]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/docs/climate/exoplasim-webgpu.md#L693-L703
[A21]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/src/model/climate/gcm/physics/precipitation/wgsl/mkclouds.wgsl#L13-L49
[A22]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/docs/climate/exoplasim-webgpu-startup.md#L47-L57
[A23]: https://github.com/Astervolans/web-exoplasim-qol/blob/daface8c0846dfa2beeda9c98756b2cfc4350937/src/model/climate/gcm/checkpoint/index.ts
