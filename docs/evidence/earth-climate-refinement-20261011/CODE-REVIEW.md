# 第5部分独立代码审阅

2026-10-11；基线 `dc87afb`，审阅对象为候选工作树。产品源码只读。初审及后续发现均由主实现修复，**最后一轮独立探针与14项细化测试通过，在本次代码审阅范围内未发现遗留阻断问题**。审阅文件哈希见 [CODE-REVIEW-FILES.json](CODE-REVIEW-FILES.json)。本报告不是真实地球长期物理/浏览器性能验收。

读取了 `refinement-topology.ts`、`refinement-surface.ts`、`thermal-runtime.ts`、`thermal.ts`、`water.ts`、`environment.ts`、`terrain-water.ts`、`runtime-state.ts`、`glacier.ts`、现有测试和设计证据；后续复核保守地形重映射、恢复与UI比较路径。修复前复现结果保存在 [code-review-probes.json](code-review-probes.json)，脚本为 [code-review-probes.ts](code-review-probes.ts)。

## 初审问题（已修复，保留原始复现）

1. **[P1] 未覆盖片的水在 represented 总量为零时脱离路由账本。** `TerrainWater.reconcile` 的分区分支只在 represented>0 时按已有水量分配 unresolved；represented=0 的目标全部为0。一个父格、一个代表三角形、两个子片 `[0,10] kg/父m²`，路由后父库存仍10，但三角体积变0，partition residual=-10 m³（fixture父面积1000m²）。同一 checkpoint 恢复被 `Fine and coarse water stores differ` 拒绝。应按实际代表面积兜底分配；完全没有代表三角形的父格保留未解析库存。

2. **[P1] 路由恢复未恢复分区的 previous 缓存，下一步改变水的位置。** 新增 `partition.previous` 没有在 `TerrainWater.restore` 中按恢复体积重算。保存一个片内两个三角形 `[2,0] m³`，运行至 `[1,0]` 后恢复 `[2,0]`，下一次无邻接、无物理流动的 route 变成 `[1.5,0.5]`。总量守恒不能掩盖湖/河水被重新撒匀；运行时回退到 presented checkpoint 也走此路径。应按恢复三角体积重新锚定 previous，且测恢复下一步空间数组一致。

3. **[P1] 局地空气诊断/雨雪与表面换热使用不同温度。** `airK(t)` 含相对父平均高程的细 lapse，但 `stepSurface` 的热交换驱动力是 `landK[t]-model.temperatureK[parent]`。把每片陆温设为对应 `airK(t)`，关闭 fixture 的辐射以单独测热交换，1800s 后仍有最大0.18785K的变化（热量残差0）。当地空气与地表已同温，却继续趋向父平均温度，会抹平高低地对比。应明确共享父空气与局地 lapse 的能量语义，使相同的局地空气用于换热和雨雪判定；总父热量只接收一次。

4. **[P1] 内湖面积按父海面积比例均摊，冷湖片能从全局海洋形成海冰。** 细拓扑只有land/sea，`phase`、`evaporate` 和 `precipitate` 都将 `inlandWaterFraction/(1-land)` 用于每个sea片。合成同父海岸中陆地=.5、确认内湖=.25，湖片270K、外洋片280K：phase从global ocean扣0.6631269 kg/全球m²，全部在湖片形成21.22006 kg/父m²海冰，外洋片为0。该转移不使用有限湖库存。需要来自 `inlandLakeId` 与三角面积的局地湖/外洋映射，不能让真实湖片充当海水冰库；无需因此引入新湖冰模型。

5. **[P2] 已保存的细高程/注册位置未与实际地形核对。** 修改有效保存的 `partition.heightM[t] +=1000`，保持陆海面积、各水库存和各温度不变，`fromSnapshot` 与随后 `attachRestoredTerrain` 均接受。该片气温由298.802K变292.709K，下一步辐射/雨雪会变，实际 authored terrain 完全没变。当前 coarse/local96 terrain 校验不能覆盖细拓扑。decode应校验tile u/v中心及几何注册，挂接真实地形时应核对地形导出的partition高程/面积与保存值；不能用重算并覆盖错误值作为静默回退。

6. **[P2] 极点纹理平均未覆盖物理查询。** `renderRefinement` 将极点像素平均，但 `RefinedSurface.sample(u,0)` 仍按u选择不同父格/片。合法的相邻极帽空气柱270…277K时，同一北极方向的查询读数相差7K；极点的field数组也未平均。需明确单点查询策略或极帽极限，使相同几何点的查询与展示一致，且不增加任何库存面积。有限体积格内近极点的离散跳变与零面积精确极点问题须区分。

## 兼容与范围

- 创建与decode现已统一100000片预算。原4096个混合父格high生成262144片、能创建不能保存恢复的问题已由创建前明确拒绝解决；Earth默认1152父格不会达到这一极端。
- 面积使用真实三角条件权重后重新归一到旧父陆海mask，保持既有热容量和库存语义，是明确的兼容取舍；不能称每个地理矩形片的总权重都等于1/q²。该取舍要写入报告。
- 共享父水汽的局地迎背风份额归一化并没有新增独立细水汽场；这能改变落雨位置和相态，不能据此声称修复印度、澳洲或阿塔卡马原气候闭合。
- 当前极区触发为高纬且父land>0，纯海海冰边缘不触发细化。若正式验收仅覆盖极区陆冰缘/海岸，应如实限定；若宣称季节海冰边缘分辨率改善，需要额外数据触发与证据。
- 当前Node成本证据写明不是浏览器FPS，口径正确。最终浏览器成本及长积分证据应由独立物理/视觉审阅核对。

## 已核对的正确链路

粗表面辐射在启用fine solver后跳过；局地蒸发直接调整fine显热并通过coarse ledger只登记一次exchange，再聚合回coarse视图；粗水汽凝结与结雪潜热只进父空气一次。`GlacierModel` 跳过已经由fine执行的雪压实，粗冰流结束后按目标库存回分。合成热平衡探针能显示错误的热交换方向，但没有显示热量被重复计入。经度分区索引采用周期wrap。

## 修复后复核

最终复核脚本为 [code-review-recheck.ts](code-review-recheck.ts)，结果为 [code-review-recheck.json](code-review-recheck.json)。原 [code-review-probes.json](code-review-probes.json) 是修复前的历史证据，不能作为当前代码仍有原缺陷的结论。

| 检查 | 当前结果 |
| --- | --- |
| 未覆盖片且represented=0的水量 | represented=10m³、unresolved=0、partition residual=0 |
| 同片内恢复后无流动下一步 | `[2,0]`m³保持`[2,0]`，未重新撒匀 |
| 地表与局地空气同温、单测换热 | 温度变化0，显热变化0 |
| 改写保存细高程 | 挂接authored terrain时报错，拒绝拓扑错配 |
| 精确极点跨经度查询 | 空气温度spread=0；测试覆盖完整sample字段与周期接缝 |
| 4096混合父格high预算 | 创建前明确拒绝超过可保存的100000片预算 |
| high→balanced质量重建 | 父空气变化0，父陆温最大差8.53e-14K，全球显热残差0 |
| 实际mesh有限冷湖与外海 | 湖片海冰0，全局海洋损失0 |
| 实际mesh balanced→high湖水重映射 | 湖体积相对差3.83e-16，海洋增量0，总水/显热残差0 |
| 湖水存档恢复 | 初始完整snapshot全等，下一步完整snapshot全等 |
| 地形增高使旧步长不再稳定 | 明确拒绝，原时间步和运行时状态保持 |
| 地形降低允许更长步长 | 保留旧短步长；自己的保存可恢复 |
| 已侵蚀陆地变海 | erodedVolumeM历史保持2，沉积转为deposited=2，固体残差0；恢复下一步全等 |
| 通用100000m起伏 | 陆温最小0.95931K、最大431.13459K，保存恢复接受 |
| 首次Classic→Fine纯湖迁移 | surface=10保持10kg/父m²，路由体积保持，总水残差0，保存恢复接受 |
| 演化后晚启用需要缩步 | 明确拒绝，snapshot差异为空，旧routing.partition引用未变 |
| 比较视图跨96/192/384尺寸 | 代码分别按baseline/current尺寸取kb/k；decoder接受三种合法尺寸 |

14项 `tests/refinement.test.ts` 全通过（最后查询单位复核后的独立运行，约5.7s）。测试包括面积非零、库存/热量守恒、真实网格有限湖、首次Classic迁移、地形重映射、极端地形、拓扑篡改拒绝，以及保存下一步精确继续。此处的真实网格是确定性1600-region authored mesh，非高分辨率真实地球数据集。

后续审阅发现并已修复的事项：质量合并曾只取旧单片热温、全局补偿改变未编辑父空气；surface重映射曾把纯湖排入全局海洋；同步路由的previous曾和实际体积求和差一个ulp；降低地形后的合法较短时间步曾无法恢复；极端起伏的加法温度校正曾产生负开尔文。现在温度按重叠条件面积加权并保持父条件均温，局地正温度用乘法重心校正，路由缓存按实际体积锚定，保存允许在稳定上限内继续使用较短步长。

最后补充发现并修复 **[P1] 首次Classic→Fine迁移删除纯湖父格的地表水**：旧create只按`p.land`分配surface，实际mesh fixture的parent12 land=0、surface=10kg/父m²启用后变0，总水减少0.3125全球mm，自身保存被`Saved water budget mismatch`拒绝。现在create候选阶段只计算真实lakeArea，surface按land+confirmed lake分配；没有可映射carrier时仍保留未解析surface。主实现新增Classic迁移回归。最终JSON的`classicLakeMigration`保留10kg/父m²、体积434674353216.7236m³和总水，保存恢复通过。候选阶段不安装路由partition，晚启用需要缩步的`lateEnableAtomic`仍snapshot全等、旧routing.partition引用未变。

先前一次湖水探针的-133mm结果来自测试夹具清除海冰却未归还海洋库存，已修正夹具，不作为产品问题；有效最终探针湖水重映射总水残差为0。

最后展示/API单位补审：`sampleWater` 的fine soil已是per-land值，standing从whole-patch换算到per-land，与Classic接口一致；无陆地片二者返回null。独立 [code-review-query-probe.ts](code-review-query-probe.ts) 使用25%陆地的混合片，输入5mm/7mm按当地陆地面积，公开查询正确返回soil=5、standing=7；纯湿片返回null/null。fine查询标签为local land snow/local grounded ice，中文分别为当地陆地积雪/当地陆冰，实测translate与预期一致，结果见 [code-review-query-probe.json](code-review-query-probe.json)。此补丁只改查询返回值和标签，热/水演化源码哈希未变，原动力探针结论仍适用。

最终帮助文案补审：比较窗口现分别说明fine片有独立热量/水量库存、Classic细图来自粗格推算；fine地形与精度编辑保留热量、水量和时间，日期/物理参数改变重新初始化。sidebar中文按同一说明翻译，保留粗冰流/不模拟海冰漂移的限制。补丁仅修改这两处文案，其他审阅文件哈希均未变。

进一步范围限制：

- 改变父陆海mask改变热容量，实现用全局正温度比例补偿保住显热总账，会使未编辑父空气随之变化。这是保守编辑近似，不能表述为局地物理平衡重映射；quality-only时比例为1，空气不变。
- 缺失陆地/海域carrier时，冰冻库存转换为可承载的雪或海冰，土壤和非湖surface转海洋。这保住质量和相态焓账，但不模拟真实淹没或抬升过程中地质/海平面做功。
- 细地表仍接受父band日均太阳辐射与父大气水汽，局地温度/相态有独立库存，局地迎背风降水份额归一化；没有独立细大气。冰川水平流仍粗格。
- 浏览器FPS、长期真实地球预算及视觉一致性由其他独立审阅负责。内存统计若只加checkpoint顶层Float64Arrays，会漏partition/湖面积/显示缓存等；必须注明口径，不能称完整内存增量。

复现命令：

```powershell
node node_modules/esbuild/bin/esbuild docs/evidence/earth-climate-refinement-20261011/code-review-probes.ts --bundle --platform=node --format=esm --outfile=build/refinement/code-review-probes.mjs
node build/refinement/code-review-probes.mjs
node node_modules/esbuild/bin/esbuild docs/evidence/earth-climate-refinement-20261011/code-review-recheck.ts --bundle --platform=node --format=esm --outfile=build/refinement/code-review-recheck.mjs
node build/refinement/code-review-recheck.mjs
node node_modules/esbuild/bin/esbuild tests/refinement.test.ts --bundle --platform=node --format=esm --outfile=build/refinement/refinement.test.mjs
node --test build/refinement/refinement.test.mjs
node node_modules/esbuild/bin/esbuild docs/evidence/earth-climate-refinement-20261011/code-review-query-probe.ts --bundle --platform=node --format=esm --outfile=build/refinement/code-review-query-probe.mjs
node build/refinement/code-review-query-probe.mjs
```
