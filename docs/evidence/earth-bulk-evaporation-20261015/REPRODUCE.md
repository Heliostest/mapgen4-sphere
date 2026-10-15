# 复现

从仓库根目录执行，使用 `pnpm-lock.yaml` 中的依赖。以下 npm 命令只调用已有脚本，不重新安装依赖。所有生成文件写入 `build/earth-bulk-evaporation/`；既有证据只读。

```powershell
npm test
npm run typecheck
npm run build
npx esbuild docs/evidence/earth-bulk-evaporation-20261015/screen.ts docs/evidence/earth-bulk-evaporation-20261015/full.ts --bundle --platform=node --format=esm --outdir=build/earth-bulk-evaporation --out-extension:.js=.mjs

foreach ($profile in @('control','bulk','cold-open-water','transport','transport-bulk03','transport-bulk06','transport-bulk')) {
    $env:PARAM_PROFILE=$profile
    node build/earth-bulk-evaporation/screen.mjs
    if ($LASTEXITCODE -ne 0) { throw "Screen failed: $profile" }
}
foreach ($profile in @('control','bulk')) {
    $env:PARAM_PROFILE=$profile
    node build/earth-bulk-evaporation/full.mjs
    if ($LASTEXITCODE -ne 0) { throw "Full terrain failed: $profile" }
}
Remove-Item Env:PARAM_PROFILE
```

`screen.ts` 共同使用粗排水及海洋补偿累加，记录 0/90/180/270/轨道年终的预算，并对整个积分轨道做月通量累加。七个初始库存哈希应相同。改变 `PARAM_DT` 可做额外步长敏感性实验；本轮保存结果固定为 1800 s。

`full.ts` 保持正式地形与排水配置，生成 0/10/30 天可加载的完整 JSON 及小型结果摘要。只提交摘要，避免重复提交大型地形存档。结果中的秒数依机器和并行负载而变；数值结果应一致。

启动 `npm start` 后，在浏览器打开 `http://localhost:8000/tests/planet-controls.html`，页面应显示 `PASS`、32 checks。`npm test` 构建此 fixture，但不会执行浏览器断言。

打开 `http://localhost:8000/scenes/earth-land-sea/index.html`，进入「行星与气候 → 水循环」，开启实验海面蒸发，点击播放。修改交换系数或关闭开关会暂停并保留当前可见状态。完整模拟存档包含该选项；重新载入默认地球页面仍使用旧方案。

本轮不重新下载观测资料。GPCC、NSIDC 来源及预处理沿用输入文件所属证据目录中的说明。所有统计是第一轨道年的瞬变比较，不能替代多年度平衡气候验证。
