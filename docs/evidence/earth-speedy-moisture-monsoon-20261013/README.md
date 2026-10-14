# 湿过程修复实验

[结果报告](report.md)包含四组对照、启动与全程预算、印度／北澳雨季及全部11区回归。[机制说明](implementation-notes.md)记录修复推导和局限。

在仓库服务器运行时打开：

[四组月平均回放](http://localhost:8001/build/earth-speedy-moisture-monsoon/index.html)

本轮只修改独立实验，未替换正式地球默认。区域气候仍未验收。原始统计、网格、检查点和逐步审计压缩存于raw/，源文件快照存于source-archives/；manifest.json同时绑定未压缩产物与压缩归档。

## 复现

从仓库根目录运行，先按仓库原实验环境准备Julia1.12.7和SpeedyWeather0.23.0。使用同一冻结初态；不要在积分中修改源文件。

```powershell
$env:MASS_IMPLEMENTATION='fixed'
$env:SPEEDY_SMOKE='0'
$env:SPEEDY_MODE='seasonal'
$env:SPEEDY_CASE='moisture-seasonal'
node docs/evidence/earth-speedy-moisture-monsoon-20261013/run-julia.mjs docs/evidence/earth-speedy-moisture-monsoon-20261013/run-ablation.jl
$env:SPEEDY_CASE='coupled-seasonal'
node docs/evidence/earth-speedy-moisture-monsoon-20261013/run-julia.mjs docs/evidence/earth-speedy-moisture-monsoon-20261013/run.jl
$env:SPEEDY_MODE='slab'
$env:SPEEDY_CASE='coupled-slab'
node docs/evidence/earth-speedy-moisture-monsoon-20261013/run-julia.mjs docs/evidence/earth-speedy-moisture-monsoon-20261013/run.jl
node docs/evidence/earth-speedy-moisture-monsoon-20261013/run-analysis.mjs
node docs/evidence/earth-speedy-moisture-monsoon-20261013/build-viewer.mjs
```

这些命令重新执行真实六年积分；不能跳过预热或把月均回放当作在线积分。
