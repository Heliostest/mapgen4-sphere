# 第4部分独立代码审阅

审阅日期：2026-10-11。比较基线：`fdf4b6b`，对象为当前工作树。依据：本目录 `PLAN.md`、源码 diff、HydroBASINS 官方字段定义、独立定向测试与小型复现。审阅过程未修改实现源码。

## 结论

截至本次复审，没有发现仍未修复的水量守恒、参考径流注水、闭流标签阻断真实溢流或前三部分库存/热库回归。三个可复现显示/拾取错误均已修复并复核，没有未解决的阻断项。正式场景的完整 `runtime`、地形 `offsets`、绘制 `constraints` 与基线逐项 `deepEqual`；参考河网参数与分类是新增项。`waterConfig` 没有 `moistureScheme: 'transport'`，实验共享水汽保持关闭。

本结论不等于地球水文已校准。负高程内湖具有真实有限水库语义、干床分类、signed 负床几何和对应坡照；marine 分支保留基球面与平法线。独立实际 Chrome GPU 验收已通过：新增内湖机制 16/16、海面光照 20/20、径向位移 648/648，原地表水显示回归也通过。演化后的完整浏览器下载/恢复再次下载，经正式 decode 后 runtime、terrain/drainage、view 全部 deepEqual；本次最终复审核对了下述原始 JSON 和验证脚本。

## 后续 signed 渲染复审

`sphere_visible_elevation` 只在负高程、启用 finite inland 且顶点属性 `a_inland > 0.5` 时使用 `e * oceanDepthM/reliefM`。`terrain-water-view.ts:38–43` 从 routing 的 confirmed inland 三角形生成静态顶点标记，中心及其三个区域顶点都在同一数组中。GPU atlas 在第 5 个浮点保存该标记；land/depth/drape 三个 pass 全部使用 20 字节步长，depth/drape 的标记偏移均为 16。`atlasTriangles` 的日期线与极点复制保留额外属性。顶点位移不再依赖经过过滤的分类纹理。

普通 marine 顶点仍为 `max(0,e)`；drape 的 marine 法线仍为 `(0,0,1)`。深度和 drape 两个 pass 均绑定 finite 开关及深度比例；fragment 的 lake B 分类仅用于颜色、坡照和水面覆盖。深度缓冲为 R16F，可保存负高度。关闭 terrainWater 时两条渲染路径都返回原行为。干状态的 shader head 低于最低 bed，避免仅因负高程把干床绘成水。负内湖的坡照按深度比例缩放 signed 高程导数，去掉原 marine 平法线和地下剖面分支，适合该显示几何；纹理过滤与正/负床相接处的导数仍是显示近似。

后续拾取修复已完成：`render.ts:835–836` 将同一静态顶点标记和比例传给 `terrainPosition`；`updatePlanet` 在标记数组变化时重编 atlas 并令 pickingDirty 失效，比例变化时单独令 pickingDirty 失效。时间步与河宽样式变化复用同一静态标记，避免每帧重编地形。`updateMap` 先清除 active terrainWater，再生成新地形，避免旧分类泄漏到下一张地图。实际 GPU 检查 inland → marine → inland 后，CPU 半径最大误差为 2.315×10⁻⁵；海面回归在不同海冰覆盖下均保留平海面照明。

## 已复现并修复的问题

### P2：零门槛给零流量生成河流

- 位置：`geometry.ts:113`、`:132`、`:138`；调用入口 `terrain-water-view.ts:81`。
- 原实现允许 `outflow == MIN_FLOW`，并把 `flow_in == MIN_FLOW` 当支流。门槛可设为 0 时，全零数组也生成河流几何。河流 shader 存在固定 0.025 的线带，因此零宽度不能保证没有蓝线。
- 独立复现：2,996 个全陆地三角形、参考和真实通量全为 0，门槛 0 产生 **6,160** 个 river triangles；门槛 1 产生 0。生成几何宽度全部为 0。
- 修复：出流和入流都必须严格大于门槛；源头分支使用相应的 `<=` 条件。复查同一输入，零门槛生成 **0** 个 river triangles。已有干旱测试增加了零门槛断言。

### P1：双河网输出超过旧 GPU 缓冲容量

- 位置：`terrain-water-view.ts:79`、`:86` 与 `render.ts:658`。
- CPU 双图层缓冲已扩大至 `126 * N` 浮点数，GPU 最初仍分配 `63 * N`，`bufferSubData` 不会自动扩容；超限会触发 WebGL 上传错误并保留旧几何。
- 独立正门槛复现：`makeSphereMesh(5,35,12345)`，6 个三角形，温暖湿润全陆地状态，实际 `TerrainWater.route` 产生通量，门槛 1。双图层输出 **32** 个 river triangles，即 **672** 个浮点数；旧 GPU 仅 **378**。该问题不依赖零门槛错误。5、6、8、12、20、30 点的小网格均可触发旧容量不足。
- 修复：GPU 缓冲扩大到原生成缓冲的两倍，匹配 `126 * N` 契约；上述 672 浮点输出在新的 756 浮点容量内。实际 GPU 压力回归另外上传参考/真实图层各 561 个三角片，共 94,248 字节，实际缓冲 239,904 字节，`gl.getError() == NO_ERROR`。

### P2：拾取位置与 signed 床几何不同步

- 原位置：`render.ts` 的 `updatePicking`、`sphere-view.ts:9`。GPU confirmed inland 已使用 signed 位移，CPU 仍将全部负高程钳到基球面；改变 terrainWater 时也没有更新 picking。
- 数值复现：e = −0.4、height = 50、ratio = 0.4、radius = 300 时，GPU 半径为 **292**，原 CPU 半径为 **300**。Inspect 和画笔在凹床或其边缘可能拾取错误可见三角形。
- 修复：CPU/GPU 共用静态顶点分类和比例，分类、比例、开关变化均触发必要的拾取更新。独立运行新增断言，confirmed inland 返回 **292**，marine 默认仍返回 **300**；相关 atlas、球面半径和旋转拾取检查一起通过。

审阅还提出了内湖实现中普通沿海 authored valley 的插值边界风险：海洋 `bedM` 被钳为 0，不能直接取代原 signed 中心高程插值。`terrain-water.ts:137` 已恢复普通三角形的原插值路径，仅 confirmed inland 分支使用 signed 湖床。这一修正避免改变普通沿海的鞍部与储水几何。

## 规范与需求核对

未找到当前仓库或其工作区祖先中的 `AGENTS.md`、`CLAUDE.md` 等额外编码规范；类型与构建检查由主任务执行。本次没有独立规范违反项。

- **参考拓扑**：`river-channels.ts:14–58` 按观测组限制参考树，终点子流域优先于普通低点，confirmed inland 各连通分量另有内部根。父节点仅在已 settled 节点扩展时指定，因此 receiver 总指向更早结算节点；逆 `order` 积流不会形成环。实际边缘鞍部来自 `network.neighbors`，不修改源 DEM。
- **实际溢流**：`TerrainWater.route` 仍以供体 head、实际 sill、接收 head 和供体库存约束转移，未读取 `endorheic`/`terminal`。内流分类不会删除边或创建无限高墙。负高程 confirmed inland 使用有限 reservoir cell，不再被当作全局海洋出口。
- **预算分离**：参考年径流仅生成 `sides`；实际 `fluxM3S` 单独生成 `physicalSides`（`river-channels.ts:97–106`），两次独立几何调用只进入显示缓冲。内湖 E/P 从真实 `surfaceKgM2` 与 `atmosphereKgM2` 转移；marine 份额进入全局 ocean。湖蒸发不能借用全局海洋库存。
- **显示、缓存、存档**：四个 fused 控制走 render 重绘路径；样式进入暂停态 view 缓存键。reference 和 lake 几何缓存分别以新 routing network 为键。旧档缺失字段恢复到 300 / 0.07 / 0.85 / 开启；可选分类检查长度、有限整数和范围，Reset 清除分类。
- **数据含义**：HydroBASINS `ENDO=2` 是终点子流域，`NEXT_DOWN` 可为虚拟连接，`NEXT_SINK` 是直接连接的下游终点。因此使用 `NEXT_SINK` 分组、在 `ENDO=2` 内选可解析低点符合官方语义；这不是实测河道或湖岸。[HydroBASINS v1.c 技术文档](https://data.hydrosheds.org/file/technical-documentation/HydroBASINS_TechDoc_v1c.pdf)。

## 验证证据

独立运行 `terrain-water`、`terrain-application`、`water`、`environment`、`ice-inventory` 五组测试：**68 / 68 通过**。覆盖有限蓄水、干涸、溢流、粗细账本协调、恢复/回滚、负高程内湖、无海洋补贴的湖蒸发，以及原分层热库、海冰和观测冰库存行为。

signed 顶点与拾取修复后，另独立运行 sphere 的日期线 atlas、极点属性复制、径向地形/海面、球面半径和旋转拾取 **5 / 5 通过**；`git diff --check` 对本次 render/view/picking 源码与测试无错误。本次没有重复前述 68 项，也没有把 CPU 检查记为实际 shader 验收。

最终核对独立 GPU 审核进程的实际 Chrome 读回：[内湖 16 项](gpu-after.json)、[海面光照 20 项](gpu-surface-lighting.json)、[径向位移 648 项](gpu-radial.json)、[原地表水显示](gpu-terrain-water.json)全部 PASS。受控全负高程内湖零库存与排干均为 0 个蓝像素；库存增加后蓝色面积从 522,067 增至 1,594,040；R16F 中有 1,983,475 个负床像素，最小显示高程 −0.230713；相反光照改变 985,404 个负床像素。容量压力阶段的人工通量只验证上传接口，不用于证明实际地球径流。初版 `gpu-before.json` 与最终全内湖 fixture 不同，不将两者颜色计数作为严格同输入前后差值。完整测试日志最终为 **199/199 PASS**；此项由主任务运行，本审阅未重复运行。

[浏览器保存恢复](browser-roundtrip.json)为 PASS：原场景既有同源加载路径以 `File/DataTransfer → terrain-load` 处理实际下载文件，再由保存按钮生成第二份文件。`browser-roundtrip.ts` 对两个完整文件调用 `decodeSimulationDocument`，逐项 deepEqual runtime、terrain（含 drainage）和 view；另外核对显示上限 0.01、472 个物理时间步与预算阈值。时钟 9.844067 天、物理模型 9.833333 天的差值小于一个 30 分钟步长；水量残差 −3.376×10⁻⁹ mm、能量残差 −2.054×10⁻⁴ J/m²。下载文件原始 SHA 不同，但被要求恢复的解码内容一致。核验没有扩大 Chrome 文件网址权限。

独立复现与状态检查脚本位于被忽略的 `build/code-review/`：

```text
node build/code-review/review-tests.mjs
node build/code-review/build-probes.mjs
node build/code-review/review-probes.mjs
node build/code-review/gpu-capacity-positive.mjs
node build/code-review/scene-state-check.mjs
node build/code-review/signed-sphere-check.mjs
```

`scene-state-check` 从 Git 基线读取原正式场景，逐项比较 runtime/offsets/constraints；输出全部通过，并核对新增 drainage/inland 字段与正式显示参数 1000 / 0.025 / 0.35。小网格探针中的 `gpuFloats` 保留旧 `63*N` 值，用于记录原错误；当前实际容量为其两倍。

## 物理与显示边界

1. **湖面仍是储水重建的颜色/岸线显示**：signed 干床几何与坡照已补充，不能再按原先的“仅干床染色”描述。当前湖水仍通过 lake atlas 的覆盖与湿润分额呈现，没有独立水面网格随 head 位移；湿湖画面不等同于三维自由水面。实际 GPU 已确认 marine 不变、干湖无水、湿湖面积随库存增长、负床位移与坡照响应；分类纹理在边界的过滤、阈值以及混合正/负床导数仍是显示近似。
2. **粗格湖面积受旧海陆分额上限约束**：`water.ts:49` 将 mesh 湖面积截到 `1-land`。小内湖若粗格仍被判为几乎全陆地，独立湖面 E/P 分额会缩小甚至为 0；有限水量和总预算仍守恒，但不代表小湖局地降水/蒸发已准确解析。
3. **未实现淡水湖结冰**：`water.ts:348` 将内湖降水放进液态 surface；`environment.ts:106`、`:134` 将新 sea ice 冻结限制在 marine 份额。没有独立 freshwater lake ice 库存、冻结点、湖雪或其相变热。保留旧 runtime 也意味着不能把旧海冰初始化解释成实测内湖冰库存。
4. **湖水初值没有观测标定**：分类没有增加水；原 coarse surface 初值仍可能少量分配到新增的 fine reservoir。不能据此宣称真实里海水位或湖面恢复。低于海平面的陆地仍受旧 +1 m 海岸约定影响，Lake Eyre 等绝对盆底未解析。
5. **参考流量和真实通量共用蓝色呈现**：预算与数组已经独立，但截图中两者未用颜色区分。年降水的示意径流系数、粗格雨/融雪和夸张河宽都不是实测 discharge；真实 `fluxM3S` 是最新有限时间步的平均转移率。判断溢流必须结合 Inspect/诊断，不能只凭一条蓝线。
6. **源尺度与动态地形**：level 4 会遗漏细小嵌套盆地；三角形中心采样可能分裂终点区域；后续绘制/侵蚀也可改变海岸和局部连通性。内部低点兜底确保终止，不保证每条参考支流都对应现实河道。应保留实际 Earth 案例拓扑核验和相同状态截图。
