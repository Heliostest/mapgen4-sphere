# 本轮工作记录（进行中，不代表验收通过）

## 13:55 更新

- 一年原生诊断复放结束：17520 步、12 个月，月均雨量及四个三维场与冻结连续积分逐值相同（最大误差 0）。`replay-summary.json` 已生成；过程键名已明确换成每日期望单位。
- 无改动分支 `baseline-sensitivity-v2` 结束：2,851,224 个数值逐值相同、最大误差 0。证明本轮分支/统计入口没有改变轨迹。
- 对流最终 1497 GREEN，独立 12,344 次边界抬升检查；相关报告和原包/冻结代码校验已落盘。
- 合并修复三天独立 audit 结束：两模式各 145 步，逐物理水量闭合最大约 4.1e-20 kg/m²/s；离散全模式最大仍约 0.06254 mm，不宣称逐步水预算通过。
- 从冻结 2001 初态启动 `parcel-seasonal`、`combined-seasonal` 两组连续六年积分，选择依据写入 `candidate-selection.md`。全部一年敏感性分支保留。
- 比较脚本导入 TS 须先 esbuild：`node node_modules/esbuild/bin/esbuild docs/evidence/earth-speedy-transport-20261013/compare-sensitivity.mjs --bundle --platform=node --format=esm --outfile=build/earth-speedy-transport/compare-sensitivity-bundle.mjs`，随后运行该 bundle。直接 node 的 strip-only 或不存在的 tsx 均不能运行，不涉及模拟失败。
- 六年运行完成前继续冻结 `run.jl`、`transport-model.jl`、物理 include、`run-julia.mjs`、`protocol.md`，不要编辑。

用户授权继续解决印度/北澳季风、区域降水回归与启动残差。所有新产物在本目录和 `build/earth-speedy-transport`，旧 `earth-speedy-moisture-monsoon-20261013` 清单 366 项已重新核验未变。正式默认未改。

## 已证实的问题

- 原生气块跨 LCL 把整段视为饱和湿抬升，可能产生不存在的水汽。新 `convection-corrected.jl` 正在完成回归与独立复核，尚未宣布气候通过。
- 云量降水项 m/s→mm/day 用除 1000，正确为乘 1000。层积云 G 缺少位势归一化且反号。`cloud-correction.jl` 已由原生真红检验；precip_only 117/117、full 119/119 通过。实现冻结 SHA `544322dbc709ccf37233cfe2932d337ed1f7191d0c14c385f5061595a45c613f`。
- 启动 −0.22 mm 峰值主要是矩形通量累计与 Leapfrog/RAW 口径不同。新逐操作归因到舍入精度，真实剩余主项来自半隐式压力校正；未改水汽补差。离散口径最差仍约 +0.06259 mm，有 5/145 步超过 0.05 mm。详见 startup-*。

## 正在运行

- `replay-diagnostics.jl`：从冻结 2006 初态复放原联合规定海温组，完整逐过程温湿倾向、对流 Pq/PT 与发生频率、原生 sigma 速度；终点需与旧年平均输出逐值比较。此复放通过旧 run.jl 的 restore，不改模型代码。
- `run.jl`：新组合 driver。SPEEDY_SENSITIVITY=1 时从上述 2006 冻态接着积分一年；=0 时从原 2001 冻态连续六年。候选 `PHYSICS_FIX=baseline/parcel/clouds-precip/clouds-full/combined`，元数据明确区分敏感性与六年平衡结果。
- 首次 baseline-sensitivity / clouds-full-sensitivity 在首日主动终止：检查发现新 Observer 初始化时从格点重新计算干质量目标，与原保存目标有约7e-12 kg/m²舍入差。为保持无改动控制的相同轨迹，修正为读取冻结目标，再用新标签运行，原终止日志保留、不当作结果。物理候选未改。
- `run-julia.mjs` 在候选模型运行时只绑定实际选择的 include 文件，保存源码和输入 before/after SHA。诊断复放于 launcher 自身 hash 绑定增强前启动，它仍绑定 collector 及其递归源码；不要追称 launcher/新增 inputsBefore 自校验已在这次早先启动生效。

## 运行后步骤

1. 复放结束运行 summarize-replay.mjs，验证17520步/12个月与旧场匹配，解释印度 JJA 水汽、深浅对流和混合预算。
2. baseline-sensitivity 全年月均须与旧 coupled-seasonal 对照到数值精度，证明新诊断/统计 driver 没改基线轨迹。
3. 对流修复通过并冻结后启动 parcel 与 combined 同初态一年对照，必要时补 clouds-precip；全部通过原水账/陆水/干质量检查。
4. 用 compare-sensitivity.mjs 列出11区和旧季风四门槛。月MAE门槛基准仍为 before-seasonal，另列相对上一轮 coupled-seasonal 的变化。
5. 根据机制和短对照选择候选六年独立积分，多年结果未通过前不替换正式默认。报告明确所有失败和剩余局限。
