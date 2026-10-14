# 独立 SpeedyWeather 月平均回放

此页面读取真实积分产生的 2006 年 1—12 月平均数据，显示 8 层 sigma 坐标的风场或气温。页面不会启动热力、水文或环境运行时，也不会写入正式地球场景或默认值。播放只是每 1.5 秒切换一个已计算的月份，12 月后暂停；视角仅因手动导航改变。

## 构建与打开

在 `mapgen4-sphere` 根目录执行：

```powershell
node docs/evidence/earth-speedyweather-20261012/build-viewer.mjs --test
node docs/evidence/earth-speedyweather-20261012/build-viewer.mjs
node docs/evidence/earth-speedyweather-20261012/verify-bundle.mjs
```

隔离类型检查采用与仓库一致的 `strict:false`：

```powershell
node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict false --target es2022 --module esnext --moduleResolution bundler --allowImportingTsExtensions --skipLibCheck --lib dom,webworker,es2022 docs/evidence/earth-speedyweather-20261012/preview.ts docs/evidence/earth-speedyweather-20261012/display-contract.ts
```

使用仓库根目录的 HTTP 服务打开 `build/earth-speedyweather/index.html`，例如现有 `npm start` 服务对应的 `http://localhost:8000/build/earth-speedyweather/index.html`。不要直接打开源码目录的 `viewer.html`。生成页面含 `<base href="../../">`，脚本与地形 worker 从仓库根目录解析。样式已内联，兼容现有简单服务的 MIME 类型表。

页面需要现有 `build/_worker.js`、原字节不变的 `scenes/earth-land-sea/earth-simulation.json`，以及协调者提供的真实 `build/earth-speedyweather/display.json`。独立构建脚本不重建现有主程序或 worker，不生成模拟数据。

## 数据与显示边界

`display-contract.ts` 校验冻结的 `speedyweather-earth-display` v1 契约，包括 SpeedyWeather 0.23.0 / T32 / 8 层 / Float64、2006 年统计范围、48×24 等面积北优先网格、12 个月与 sigma 严格递增顺序、各字段尺寸与有限数值。原始数组解码为独立 Float64Array，用于格点读数。区域气候未验收、正式默认保持不变的状态必须与本实验一致。可选附加字段不参与显示。

地理存档仅恢复并校验 `terrain` 成员：完整的 `decodeSimulationDocument` 会构造旧 ThermalRuntime，因此这里直接复用 `decodeTerrainDocument`。地形 worker 重建原有地理与参考河流。参考河流不作为 SpeedyWeather 水文结果。

风场沿用现有渲染器：每个分量按 `128 + round(1.27 × m/s)` 编码，任一分量超出 ±100 m/s 就拒绝整个数据，不静默裁剪。箭头朝向气流，颜色在 0—30 m/s 范围变化。气温沿用 193.15—333.15 K 色标，色标饱和会在图例注明，原值保持不变。sigma 层标签不映射为固定高度或固定气压；探针给出当前格点地表气压乘以 sigma 的层气压。

`timeS` 仅传给显示太阳相位，不影响数据，不反馈求解器，不写正式时钟。页面只提供风场与气温图层；降水和海冰浓度作为格点地表读数，未制作地表覆盖重建。

## 验证记录与限制

契约测试使用明确标识的合成夹具，从缺失实现的 10 项预期断言失败到 10 项通过。`viewer-contract-red.log` 保留 RED；`viewer-contract-green.log` 保留 GREEN。独立 bundle 依赖检查确认没有旧热力、水文、存档运行时、控制器或绘画入口。

本子任务不运行全局构建/测试，不改变 npm 文件、正式场景或 Git 状态，不进行浏览器操作。真实年度积分、预算、观测对照和最终浏览器验证由协调者完成。数值层实际值、月份与视角可通过浏览器中冻结的 `window.speedyWeatherReplay` getter 检查；该对象不提供启动模型或修改正式场景的方法。
