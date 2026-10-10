# 复现共享水汽实验

从仓库根目录执行，使用现有Node依赖。以下工具只写build实验快照与本目录证据，保留正式地球与DEM。单次全年积分约需数分钟；初始化和半步核对也有明显计算开销。

```powershell
npm test
npm run typecheck
npm run build
node docs/evidence/earth-moisture-climate-20261010/bundle-integrate.mjs --baseline
node node_modules/esbuild/bin/esbuild scenes/earth-land-sea/rebuild-moisture.ts --bundle --platform=node --format=esm --outfile=build/earth-moisture-climate/rebuild.mjs
node build/earth-moisture-climate/rebuild.mjs
node docs/evidence/earth-moisture-climate-20261010/bundle-integrate.mjs --baseline --run
node docs/evidence/earth-moisture-climate-20261010/bundle-integrate.mjs --run
node node_modules/esbuild/bin/esbuild docs/evidence/earth-moisture-climate-20261010/reference-validation.ts --bundle --platform=node --format=esm --outfile=build/earth-moisture-climate/reference-validation.mjs
node build/earth-moisture-climate/reference-validation.mjs
node docs/evidence/earth-moisture-climate-20261010/browser-harness.mjs
node docs/evidence/earth-moisture-climate-20261010/audit-evidence.mjs
```

每条命令须成功后再执行下一条。基线bundle的所有模型导入均用git show读取固定c84e725源码，不能只换旧JSON而运行新模型来冒充基线。实验生成器也从这个固定场景开始，用严格恢复路径规范化后写不可变experimental-input.json。全年积分写after-day0/90/180/270/365.json；原始输入和输出分开，避免重复运行逐步改变输入。完整JSON较大，仅构建文件留在build；已提交的是统计、观测、日志和截图。

参考初始化两个真实轨道，标准/半步的共同网格、行星、轨道和闭合参数固定；JSON记录实际步长、步数、残差和输入/代码包SHA。原始数据包含失败结果；audit核对守恒、输入、地形和正式场景隔离，**不将区域气候失败改判通过**。数值对照由audit脚本生成，人工结论在REPORT.md。

最后一次全年记录运行的输入路径是build/earth-moisture-climate/after-day0.json，随后同SHA字节副本固定为build/earth-moisture-climate/experimental-input.json；工具现默认后者，最终参考核对也已使用后者。路径变更不改变物理初态。代码包SHA会随统计入口中的路径文字变化，原始运行SHA仍保留在证据中。

浏览器：在PowerShell设置 `$env:PORT=8002` 后执行 `npm start`（若端口被已有任务占用则选空闲端口），打开 `/build/earth-moisture-climate/before-day365.html` 与 `after-day365.html`。包装页保留既有严格导入逻辑，只替换fetch目标并设置相同资源base。确认加载完成、第365天且暂停，然后选择相同视角与图层截图；不要编辑时间输入。截图使用12倍起伏，既有场景的overhead=60与outline_strength=3，暂停状态保持原存档季节。

GPU页面为 `/tests/gpu-wind.html` 和 `/tests/gpu-surface-lighting.html`，读取页面实际PASS/失败列表保存报告。观测解析使用 `python docs/evidence/earth-moisture-climate-20261010/extract-gpcc.py`，只需Python标准库；原始GPCC gzip已固定版本与SHA，不参与模型生成。
