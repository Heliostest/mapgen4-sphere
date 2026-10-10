# 连续演化证据复现

在仓库根目录安装现有项目依赖后运行：

```powershell
node docs/evidence/earth-ice-inventory-20261010/bundle-integrate.mjs --baseline --run
node docs/evidence/earth-ice-inventory-20261010/bundle-integrate.mjs --run
```

第一条命令通过 esbuild 的加载插件，从固定提交 `be7460963bec88be82eac11a6f4dcc62e7a5c188` 读取物理模型源码和原始地球存档；统计入口使用当前 `integrate.ts`。第二条命令编译当前实现，并读取正式地球场景 `scenes/earth-land-sea/earth-simulation.json`。两者都逐步调用真实模型的 `sync`，从第0天连续推进到第170天和第350天，保留原场景全部配置、地形径流、冰川和动态大气，不修改季节滑块或重新生成中途参考场。

省略 `--run` 只编译；与 `--run` 一同添加 `--initial-only` 只保存第0天。运行会覆盖对应的 `before-continuous.json` / `after-continuous.json` 及 `build/earth-ice-inventory/` 内的日0、170、350存档。统计含等面积物理库存、独立水量和焓预算、显示网格估计及温度层次；显示覆盖面积不能替代守恒库存。

如需固定另一个第0天存档和明确来源，可在运行前设置：

```powershell
$env:ICE_EVIDENCE_INPUT='build/earth-ice-inventory/after-day0.json'
$env:ICE_EVIDENCE_SOURCE='待审实现；统计文件记录实际bundle SHA256'
node docs/evidence/earth-ice-inventory-20261010/bundle-integrate.mjs --run
```

每个保存点都会严格编码并解码存档；独立水量和能量检查失败或严格解码拒绝时直接终止。统计文件中的 `bundledCodeSha256` 标识实际运行的整个模型包，`inputSha256` 标识输入存档。原始 DEM、offsets 和 constraints 的三个哈希可核对前后地形一致性。

## 重新生成观测库存与正式场景

源采样需要 Python 与 NumPy。首次读取官方源时需网络；已保存的 `ice-samples.json` 可直接用于离线重建。缓存字节段逐项校验，不会默默改用缺失值。

```powershell
python scenes/earth-land-sea/sample-ice.py
node docs/evidence/earth-ice-inventory-20261010/bundle-integrate.mjs --baseline
node node_modules/esbuild/bin/esbuild scenes/earth-land-sea/rebuild-ice.ts --bundle --platform=node --format=esm --outfile=build/earth-ice-inventory/rebuild-ice.mjs
node build/earth-ice-inventory/rebuild-ice.mjs
node node_modules/esbuild/bin/esbuild scenes/earth-land-sea/verify.ts --bundle --platform=node --format=esm --outfile=build/earth-ice-inventory/verify.mjs
node build/earth-ice-inventory/verify.mjs
npm test
npm run typecheck
npm run build
```

`rebuild-ice` 始终读取固定旧版第0天档案；不会把已改版的正式场景作为新基线。正式 `earth-simulation.json` 和 build 中 after-day0 会被重建覆盖。初始化是新初始条件，记录新的initialEnthalpy；连续演化守恒以该新初态为参考。

浏览器只使用8002。完整季节存档在build目录（可由上文积分命令重建）；打开场景「保存与恢复」导入对应JSON。依次选南极、北极、青藏、美洲、格陵兰，保持12×起伏和surface图层，可核对全部同镜头截图。`/tests/gpu-surface-lighting.html` 与 `/tests/terrain-water-render.html` 分别运行真实GPU夹具。
