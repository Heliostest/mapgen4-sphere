# 独立 SpeedyWeather 海温边界对照回放

页面读取三组真实积分的 2006 年 1–12 月平均，在现有地球 Renderer 上显示 8 层 sigma 大气的风场或气温。默认选中 `seasonal`，其海温来自规定季节边界，边界热量单独记账。三组共同标识的是 **2001 初始大气与陆地库存**；2006 库存和预算分别由各组积分确定。页面明确保留“只读回放、气候未验收、正式默认保持不变”的状态。

页面不启动大气、水文或正式环境运行时，不写正式场景或默认值。播放每 1.5 秒切换一个已经计算好的月份，12 月后暂停。切换配置保留月份、大气层、显示图层、选中格点和视角；播放期间切换配置继续播放。视角仅由手动导航改变。

## 构建与打开

在 `mapgen4-sphere` 根目录执行：

```powershell
node docs/evidence/earth-speedy-budgets-sst-20261012/build-viewer.mjs --test
node docs/evidence/earth-speedy-budgets-sst-20261012/build-viewer.mjs
node docs/evidence/earth-speedy-budgets-sst-20261012/verify-bundle.mjs
```

局部类型检查使用仓库一致的 `strict:false`，只选本次入口与合同：

```powershell
node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict false --target es2022 --module esnext --moduleResolution bundler --allowImportingTsExtensions --skipLibCheck --lib dom,webworker,es2022 docs/evidence/earth-speedy-budgets-sst-20261012/preview.ts docs/evidence/earth-speedy-budgets-sst-20261012/comparison-contract.ts
```

从仓库根目录的现有 HTTP 服务打开 `build/earth-speedy-budgets-sst/index.html`，例如现有 8000 端口服务对应 `http://localhost:8000/build/earth-speedy-budgets-sst/index.html`。生成页的 `<base href="../../">` 使脚本与 worker 从服务根目录解析；CSS 已内联以兼容现有简单服务器的 MIME 表。不要直接打开源码目录的 `viewer.html`。

依赖现有 `build/_worker.js`、原地球 `scenes/earth-land-sea/earth-simulation.json` 和数值任务产出的 `build/earth-speedy-budgets-sst/comparison-display.json`。构建不重建主程序或 worker，不复制旧数据冒充新配置，不生成对照 JSON。真实数据缺失或不满足合同会显示错误并保留控件禁用。

真实对照 JSON 到位后，可在不启动浏览器的情况下验证完整字段：

```powershell
node docs/evidence/earth-speedy-budgets-sst-20261012/verify-display.mjs
```

它使用本次构建导出的 `comparison-contract.mjs`，写入 `build/earth-speedy-budgets-sst/viewer-display-verification.json`，记录真实文件 SHA256、模型日期、各组 sigma、温度范围、超色标值数量和风分量最大绝对值。任何风分量超出 ±100 m/s 会拒绝整个文件并报告具体配置、月份和层；应将该真实范围问题反馈给数值负责人。

## 冻结的数据合同

`comparison-contract.ts` 严格校验 `speedyweather-sst-comparison` v1 外层、三组顺序和标识、标签与说明，以及共同初始库存 SHA：

```text
4c665c83b08918fad6f8b67968fae472539c8796515afc93a22099d682b44a68
```

各组 `data` 复用旧 `display-contract.ts` 的只读 `speedyweather-earth-display` v1 解码。旧文件不修改。模型必须为 SpeedyWeather 0.23.0 / T32 / 8 层 / Float64，统计从 `2006-01-01T00:00:00Z` 到 `2007-01-01T00:00:00Z`，网格必须是 48×24、等面积、北优先、经度从 −180° 开始，包含按 1–12 月排列的 12 个 `monthly-mean` 帧。各组 sigma 必须精确为 `[0.0625,0.1875,0.3125,0.4375,0.5625,0.6875,0.8125,0.9375]`。每组必须声明 `formalDefaultUnchanged:true`、`regionalClimateAccepted:false`。

每层包含 `temperatureK`、`windEastMps`、`windNorthMps`；每个地表帧包含 `pressurePa`、`seaIceConcentration`、`rainMmDay`。所有数组必须有 1152 个有限数值；温度与气压为正、降水非负、海冰覆盖率在 0–1。输入数值解码到独立 Float64Array，探针使用原值。`timeS` 仅供显示太阳相位，不反馈求解器或正式时钟。

地理存档只提取并解码 `terrain` 成员，使用 `decodeTerrainDocument` 与现有地形 worker 恢复底图。完整 `decodeSimulationDocument` 会构造旧 ThermalRuntime，因此不进入本次 bundle。参考河流只作为地理信息。

## 显示、缓存与探针

控件保留 `month`、`level`、`layer`、`play`、`previous`、`next`、`mapgen4`；新增配置下拉框 `case`，默认值为 `seasonal`。纹理缓存键包含配置、月份与层，切换不会继续使用另一组的数据。

气温色标沿用 193.15–333.15 K（−80–+60 °C）；超色标只影响颜色，并显示本层超范围格点数量。风分量采用现有 `128 + round(1.27 × m/s)` 字节编码，任何分量超出 ±100 m/s 都拒绝而非静默裁剪。风速颜色在 0–30 m/s 变化，风箭头由编码后的分量决定。探针报告原始温度、东西/南北风分量与合成风速，另含 `sigma × 当地地表气压` 的层气压、地表气压、海冰覆盖率和降水；sigma 不映射为固定高度。

冻结的 `window.speedyWeatherReplay` 对象只提供诊断 getter，供 RootCDP 读取：

- `ready`、`playing`、`caseId`、`caseLabel`、`caseDescription`、`caseIds`。
- `initialAtmLandSHA`、`initialStockYear`（2001）、`statisticsYear`（2006）、`acceptance`、`source`。
- `frameIndex`、`levelIndex`、`month`、`sigma`、`layer`、`presentedTimeS`、`temperatureSaturated`。
- 冻结的 `orientation`（x/y/zoom），`probeCell` 和原始单位的冻结 `probe` 快照。

`probe` 包含配置、月份、层、sigma、格点、经纬度、温度 K、风 m/s、层与地表气压 Pa、海冰覆盖率和降水 mm/d。它不暴露可写数组或操作求解器的方法。浏览器 QA 应通过页面控件切换配置、月份和层，观察读数来自对应真实组，且播放和切换不会自动旋转地球。

## 验证记录与限制

合成数据仅存在于明确标注的测试夹具，未写入 `comparison-display.json`。首轮 RED 有 11 项新增合同断言失败，旧显示打包验证通过；实现后全部 12 项通过。第二轮探针 RED 的 2 项失败记录在 `viewer-probe-red.log`，随后总计 14 项通过，最终 GREEN 记录在 `viewer-contract-green.log`。

独立 bundle 验证确认现有 Renderer、terrain-only 解码和地形 worker，排除旧 ThermalRuntime、WaterModel、simulation document、时钟恢复、控制器与绘画入口；生成页内联 CSS，worker 路径保持 `build/_worker.js`。本子任务局部类型检查通过。

本子任务遵循调度范围，没有运行全局构建或测试，没有修改生产源文件、旧证据、包源或 npm 文件，没有提交，没有操作浏览器。前端完成时真实对照 JSON 尚未生成，因此本次 bundle 报告明确为 `browserChecked:false`、`realMonthlyDataChecked:false`。真实积分、预算闭合、GPCC 对照和最终浏览器截图由数值负责人完成，前端测试不作为区域气候验收。

### 续接后的实际浏览器验收（2026-10-13）

上述“前端完成时”记录保留为历史阶段。现已生成三组真实数据，`viewer-display-verification.json` 的 `realMonthlyDataChecked` 为 true；独立 `browser-verification.json` 核对了三组一月/七月、八层、风温、126 个原值探针字段、播放中切换、自动/手动暂停及视角保持。控制台无 warning/error。截图、观察记录和最终源/资产绑定均在本实验目录。最终页面保持明确的只读实验标识，未测 FPS，区域气候仍未验收。
