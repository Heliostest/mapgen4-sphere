# Mapgen4 × ExoPlaSim 最小对接

在项目根目录执行 `npm run build`，随后执行 `node experiments/exoplasim/serve.mjs`，打开 <http://127.0.0.1:8017/experiments/exoplasim/>。

页面已包含实际运行的首年结果，选择月份、气温/降水/风场，再切换“现有模型 / ExoPlaSim”。两者使用同一个现有球体、相同镜头和固定色标。拖动旋转、滚轮缩放。无需访问外部服务或重跑模型即可查看。

点击球体放置**地点探针**，或在右侧输入经纬度定位。琥珀标记随球体旋转，在背面被遮挡；切换模型、图层、镜头和月份均保留选点。右侧同时显示两套模型的选月气温、降水量、降水率和风分量，以及12个月的降水柱图、气温折线和全年统计。点选图中的月份可同步切换全球月份，支持键盘 Enter / 空格；“查看12个月数值”及“下载该点全年 CSV”保留两套模型的完整数据。

这里的“当前”指**所选月的月平均**，不是即时天气。月降水量为降水率 × 实际采样秒数 / 86400，单位毫米；年温按实际时间加权，温度范围为最冷/最暖月均温。探针显示真实地形高程，但气候数值取自该点所在的48×24等面积显示格，并注明格中心与边界；它不能代表细地形尺度的点位气候精度。CSV为未裁剪、未四舍五入的月值。探针不推进或修改模拟状态。

本次默认输入是 `scenes/earth-land-sea/earth-simulation.json`，包含现有21.5万三角形物理地形和正式模型配置。页面先验证存档 SHA-256，地形改变后会要求重新运行。只读显示不写入模拟温度、降雨、水库或潜热账本。

实际输入、逐月指标、耗时和解释边界见 [REPORT.md](REPORT.md)，完整数值在 `result.json`。这是一年冷启动/重新初始化结果，不是多年平衡气候；两者初始温湿度、雪冰和物理闭合不同，不能把差值当作观测误差。Exo温度为2m气温，风为最低sigma层；原模型是现有单层变量。风速统计是月均矢量的模，不是逐时风速平均。

**初始化修正：** 旧版错误使用 `glaciers.enabled=false / initialHeightM=0`；原生初始化仍会在非零地形上植入冰川标记。现改为 `initialHeightM=-1` 并重新实跑全年，旧−10.58°C数据已撤销。实际WASM回归命令：`node experiments/exoplasim/audit.mjs production 2`；它读取实际输入文件和native checkpoint并检查无误植冰川。仍保留原生海温冷启动（271.25K），没有把诊断用的外部SST变成默认。见[输入诊断](INPUT-AUDIT.md)。

## 重跑

需要项目已有Node依赖、Chrome及Playwright。若环境中没有Playwright，可在独立工具目录安装它，并用 `PLAYWRIGHT_MODULE` 指向其 `index.mjs` 绝对路径；不需要给产品增加依赖。

首次下载上游：

```powershell
git clone https://github.com/Astervolans/web-exoplasim-qol.git "$env:TEMP/mapgen4-exoplasim-daface8"
git -C "$env:TEMP/mapgen4-exoplasim-daface8" checkout daface8c0846dfa2beeda9c98756b2cfc4350937
```

也可设置 `EXOPLASIM_SOURCE` 指向已有固定版本检出。构建会拒绝错误版本。上游源码、WASM和data只复制/编译到忽略的 `build/exoplasim`；不把上游模型源码写入当前产品。`exoplasim.data`含上游初始资源，运行时关闭Earth surface climatology并删除其`.sra`地表文件，再以本地地形生成海陆/位势边界。

```powershell
node experiments/exoplasim/build.mjs
node build/exoplasim/prepare.mjs prepare
# 另一个终端保持此服务运行：
node experiments/exoplasim/serve.mjs
# 回到原终端：
node build/exoplasim/baseline.mjs
node experiments/exoplasim/run.mjs
node experiments/exoplasim/finalize.mjs
npm run build
```

`prepare` 后面可传现有编辑器导出的**完整模拟存档**路径（地形文件本身缺少基线物理配置）。例：`node build/exoplasim/prepare.mjs prepare C:/worlds/my-world.json`。本原型仅支持近地球一日、顺行自转；其他自转会明确拒绝。导出时保留物理半径、重力、倾角、太阳通量和混合层深度，比较采用365日归一化圆轨道季节。大气成分与辐射参数并不能与原模型的有效发射率一一对应，保留两者配置，不作隐藏拟合。

当前模型按实际秒积分；Exo每个物理步发布，按末时刻样本对应的前一段时间归月，完整一年11680步。Gaussian输出原网格在结果里保留，显示使用面积守恒映射到48×24等面积格点。显示有8bit编码/固定色标饱和，统计与下载保留未裁剪浮点值。`baseline.json`记录本地固定步长最后不足一步的年末尾部。

如果输入存档在仓库外，finalize会复制到 `build/exoplasim/input-world.json` 供本地查看；清空build后需重新准备。默认地球存档直接使用仓库已有文件。结果页面无任意上传并续算功能，改变地形后通过脚本重跑。

## 许可与来源

ExoPlaSim浏览器移植固定在 `Astervolans/web-exoplasim-qol@daface8c0846dfa2beeda9c98756b2cfc4350937`，模型资源对应 ExoPlaSim `5f8dff4` 与其 `scripts/exoplasim-wasm/` 补丁。上游及编译资源声明GPL-2.0；生成目录保留 `EXOPLASIM-LICENSE.TXT` 和 `upstream.json`。这里的技术分隔不代表许可豁免，分发模型产物时应附对应许可、归属和完整对应源码/补丁。

本次使用本项目已有NOAA ETOPO/Natural Earth地形，未复制对方单独的地球DEM。数据来源继续见 [地球场景说明](../../scenes/earth-land-sea/README.md)。浏览器回归脚本：`node experiments/exoplasim/browser-check.mjs`；地点探针交互回归：`node experiments/exoplasim/probe-browser-check.mjs`（需运行上述服务及配置Playwright）。
