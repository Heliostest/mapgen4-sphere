# SpeedyWeather 排水、干空气质量与季节海温实验

本目录只实现独立实验。正式场景 JSON、DEFAULT_THERMAL/WATER/ENVIRONMENT、已有实验、Julia 包源均保持原状。参数与门槛先固定于 [protocol.md](protocol.md)。结论见 [report.md](report.md)，完整数值见 [acceptance.json](acceptance.json)。

## 配置和真实库存

Julia 1.12.7、SpeedyWeather 0.23.0、CPU Float64、truncation=32、3168 Gaussian 点、8 个等厚 sigma 层、1800 s 原生步长。使用上一轮 `annual-initial.jld2` 在 2001-01-01 首个物理步之前保存的状态。大气与陆地库存 SHA 为 `4c665c83b08918fad6f8b67968fae472539c8796515afc93a22099d682b44a68`，另核对物理温湿风压、SST、海冰逐值差为零。

从 2001-01-01 连续积分到 2007-01-01，五年预热、2006 全年统计，各组 105169 次真实推进。原配置 reference 是上一轮冻结的真实积分；slab 和 seasonal 使用相同排水诊断与质量固定器，后者在每一步原生 slab/海冰响应后维持规定的季节 SST，维持热量单独记账。2006 的各组库存来自各自的积分，不宣称它们仍相同。

## 预算含义

下层超额土壤水独立计为深层排水，保留原 upper runoff。负土壤水裁剪和正积雪上限移除也记账。雪负候选的裁剪抵消未实现融雪，不是物理新增水源；其计数不重复扣入物理陆地预算。包装器与原生 bucket 的土壤/upper runoff 演化逐值一致。

干空气库存是面积积分 `ps/g−W`；总湿气柱 `ps/g` 随水汽交换变化。初始干空气约束只改变全局压力零阶模式，保存原候选漂移；当前物理层的水、显热代理变化独立记录。RAW 记忆层另列模式诊断，不重复当作当前物理通量。其余大气水残差仍保留。这个实验没有重写成严格守恒的动力核。

规定 SST 使用固定包的 `sea_surface_temperature.nc`，元数据没有给出原始气候平均时期，不能称作新获取的 1991–2020 海温观测。12 月场按真实公历月中心插值，海水冻点 271.35 K。海洋表面显热账包含表面通量、冻点温度夹限调整与外部 SST 维持热量。模型没有有限海水库存或海冰厚度/潜热库存，所以不宣称完整地球水/能量守恒或 NSIDC 海冰预报通过。

## 同网格观测与季风诊断

GPCC v2022 1991–2020 使用原 11 区和固定有效陆地支持。原生雨+雪守恒映射到 48×24 等面积格点；原生陆地体积和映射体积单独核对。重点印度 JJA 与北澳 DJF；南半球夏季为 DJF，跨赤道区不强加夏冬标签。

海洋诊断区域预先固定为印度外海 5–15°N、60–90°E 与北澳外海 10–2°S、110–140°E。海温梯度由原生海洋权重的温度平面拟合得到；陆海温差用上层土壤温度和海洋 SST，不与 SST 空间梯度混称。水汽汇聚来自原生每步 `Σ(q u Δσ)ps/g`、`Σ(q v Δσ)ps/g` 的月平均，再经球面格面差分。它是粗网格空间诊断，不是原生精确水闭合。

## 复现

从仓库根目录运行，使用已固定的私有 Julia 环境；Node runner 保存真实 native 退出码和启动/完成源码 SHA。

```powershell
node docs/evidence/earth-speedy-budgets-sst-20261012/run-julia.mjs docs/evidence/earth-speedy-budgets-sst-20261012/corrections_test.jl
$env:SPEEDY_CASE='restart_test'
node docs/evidence/earth-speedy-budgets-sst-20261012/run-julia.mjs docs/evidence/earth-speedy-budgets-sst-20261012/restart_test.jl
$env:SPEEDY_CASE='slab'; $env:SPEEDY_SMOKE='0'
node docs/evidence/earth-speedy-budgets-sst-20261012/run-julia.mjs docs/evidence/earth-speedy-budgets-sst-20261012/run.jl
$env:SPEEDY_CASE='seasonal'
node docs/evidence/earth-speedy-budgets-sst-20261012/run-julia.mjs docs/evidence/earth-speedy-budgets-sst-20261012/run.jl
```

`analyze.mjs` 需 esbuild 打包其现有 TypeScript 诊断依赖后执行。`plot.py` 读取真实 acceptance.json。`build-viewer.mjs` 生成独立页面，`verify-display.mjs` 校验真实数据。存档下一步一致性由 `restart_test.jl` 对五类容器、时钟和累计账本逐值核对。`manifest.mjs` 保存输入/源/显示依赖绑定与 11 个 gzip 真实数据存档，`verify-final.mjs` 检查存档完整性和浏览器验收证据；其 PASS 不代表区域气候验收通过。

回放地址为 `/build/earth-speedy-budgets-sst/index.html`。它只恢复地理底图，不启动旧物理求解器；配置切换和播放只更换已积分的月场，视角固定，手动拖动仍可旋转地球。

## 2026-10-13 续接验收

两组六年积分已经完成；当前源码重建分析与恢复出的结果逐字节一致。最终报告及机器验收文件见上方链接。当前入口为 http://localhost:8001/build/earth-speedy-budgets-sst/index.html 。

续接复测保存在 `resume-corrections-test-native-status.json`、`resume-restart-test-native-status.json` 与 `resume-probe-native-status.json`；旧日志保留。probe 只新增累计蒸发、降水和原门槛输出，生产积分源码不变。两组启动三天大气水验收仍失败，`final-verification.json` 的 PASS 仅指证据与本轮限定修复的实现检查。

最终分析可执行 `node docs/evidence/earth-speedy-budgets-sst-20261012/resume-analysis.mjs` 重建并核对字节一致性；浏览器原始读取见 `browser-observations.json`，用 `verify-browser-observations.mjs` 核对真实月数据。
