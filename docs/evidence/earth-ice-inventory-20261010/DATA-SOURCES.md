# 冰盖初始化的数据来源与采样审查

核对日期：2026-10-10。本次使用可公开读取的实际冰厚与分类产品，保留既有 ETOPO 冰面地形；没有把两个高程产品的差直接当成冰厚。冰库、热模型、长期积分与浏览器结果见同目录主报告。

## 选用产品

采用 Abrykosov、Ince 与 Foerste 发布的 **GDEMM2024 原始 2024 版本**，从 [GFZ Data Services 正式 DOI](https://doi.org/10.5880/GFZ.1.2.2024.002) 所指的[官方文件目录](https://datapub.gfz-potsdam.de/download/10.5880.GFZ.1.2.2024.002-Veebui/)读取 `GDEMM2024_ICE.1m.tif`、`LTM.1m.tif`、`BED.1m.tif` 与 `SUR.1m.tif`。这是作者正式发布的全球产品，厚度与冰分类是其独立字段。

[原始论文](https://www.nature.com/articles/s41597-024-03920-x)的构建步骤 e 明确说明：极地被冰覆盖的格点用 **BedMachine Greenland v5 / BedMachine Antarctica v3** 的 surface、bedrock、ice、geoid、mask 替换对应字段。ICE 因而来源于冰厚产品，而非本应用计算的 ETOPO surface–bed 差。GDEMM 并非 2026 年的最新观测；NSIDC 当前已提供更高版本的 BedMachine，这里选择 2024 正式产品是为了明确、可复现地使用公开数据。

| 项目 | 核对内容 |
| --- | --- |
| 原始产品分辨率 | 30 角秒；本次用作者附带的 1 角分方便版本 |
| 文件尺寸与排列 | 21600 × 10800，全球经纬度，北到南；Int16、小端、未压缩，每条纬向行一个 TIFF strip |
| 水平坐标 | WGS84 (G1150)，EPSG:9055；不是南、北极投影。源像元为面积注册，中心经度 `-180+(x+.5)/60`，纬度 `90-(y+.5)/60` |
| 垂直坐标 | SUR/BED 为相对 EIGEN-6C4 geoid 的米；ICE 是米制垂直厚度，不是冰面绝对高程 |
| 许可 | CC BY 4.0，可分享与改编，保留数据与论文引用 |
| 缺测值 | ICE/BED/SUR 为 -32767；LTM 为 -127；冰类中的缺测会停止采样，不会变成零厚度 |
| 原始掩膜 | 0 海洋、1 无冰陆地、2 内陆湖、3 陆地冰盖、4 浮冰架、5 冰下湖（Vostok） |
| 海冰 | 产品没有提供季节海冰；本次进口库存不替代季节海冰模型 |

这些格式、坐标、许可与字段含义同时由[官方 readme](https://datapub.gfz-potsdam.de/download/10.5880.GFZ.1.2.2024.002-Veebui/2024-002_Abrykosov-et-al_readme_GDEMM2024.txt)、TIFF 标签与[论文表 1](https://www.nature.com/articles/s41597-024-03920-x/tables/1)交叉核对。TIFF 实际 nodata 与像元注册也在采样代码中断言。

引用：Abrykosov, Oleh; Ince, E. Sinem; Foerste, Christoph (2024): GDEMM2024: 30 Arcsec Global Digital Elevation Merged Model 2024, a suite for Earth relief. GFZ Data Services. [DOI](https://doi.org/10.5880/GFZ.1.2.2024.002)。论文：Ince, E. S., Abrykosov, O. & Förste, C. (2024), Scientific Data 11, 1087, [DOI](https://doi.org/10.1038/s41597-024-03920-x)。所继承的厚度产品：[Greenland v5](https://nsidc.org/data/idbmg4/versions/5)、[Antarctica v3](https://nsidc.org/data/nsidc-0756/versions/3)。

## 语义及高程处理

LTM=3 进入大陆冰库存；LTM=4 进入独立浮冰架库存，厚度不进入季节 sea ice。LTM=5 的 ICE 仍是实际冰厚，下面的水柱不在 ICE 中；它进入大陆冰盖库存类别，但这不代表 Vostok 上方冰层与湖底岩石直接接触。产品 BED 被独立保存，能够显示冰下水层而不把水层计为冰量。[论文表 1](https://www.nature.com/articles/s41597-024-03920-x/tables/1)对冰架、冰下湖明确给出 `BED < SUR - ICE` 的关系；对普通大陆冰则为等式。

既有地形来自 [NOAA ETOPO2022 ice surface](https://www.ncei.noaa.gov/products/etopo-global-relief-model)，其高程基准为 EGM2008，而 GDEMM 的 SUR/BED 基准为 EIGEN-6C4。两者还有观测与重采样差异，故不能直接用 GDEMM BED 取代当前地形后再叠加冰厚。模型保留当前 authored surface，并为普通大陆冰采用 `model bed reference = authored surface - imported thickness` 以保证第 0 天表面高度不变；这个兼容参考不是声称经过地质观测验证的真实基岩。浮冰架的同样差值是**冰底面参考**，不是海床。产品 BED 只作独立来源诊断，真实海底仍由现有 DEM 表达。完整动力学是否使用与保留这些字段由主报告说明。

不采用 ETOPO surface–bed 差初始化冰量的理由有三点：ETOPO 不附 grounded/shelf 冰分类；冰架下差值可能包含海水腔；原始 surface 与 bed 高程来源、基准转换及采样处理需要核对。NOAA 的 [2022 用户手册](https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/docs/1.2%20ETOPO%202022%20User%20Guide.pdf)和[2025 作者论文](https://essd.copernicus.org/articles/17/1835/2025/)对 BedMachine 子版本的记录也不同，不能从名称相似推断精确厚度。

## 可复现采样与校验

`scenes/earth-land-sea/sample-ice.py` 使用原生 TIFF 结构与 HTTP 206 字节范围读取必要的官方源行，不下载整个 445 MiB 栅格。`ice-source.json` 保存每个实际读取的 header/scanline 范围、SHA256、总文件长度、ETag、Last-Modified；这些是**实际使用字节的校验值，不是整文件校验值**。重新生成会先校验每个缓存范围再解码，远程源或缓存改变会报错。

输出为与应用一致的 96 × 49 surface grid，`u=(x+.5)/96`、`v=y/48`。先用最近邻取离散 LTM 分类，再只在同类的源像元角点之间双线性采样厚度和产品高程，避免将接地冰插值到海洋或岩石格点。两极在对应类别的源极行取均值，消除极点任意经度。掩膜缺测或有冰处厚度/高程缺测会抛出错误。未采样的无冰类产品高程用 `null` 表示，不能解读为海拔零。

`ice-samples.json` 保存 groundedThicknessM、shelfThicknessM、产品 bedrockM、sourceSurfaceM、原始掩膜、类别与 missing。库存采用物理米制厚度；转换为 kg/m² 时应使用模型采用的冰密度，不能把米制冰厚当成毫米水当量。源掩膜和真实海陆掩膜边界不完全相同；运行时应保留分类，并用本地面积权重聚合质量，不能把已聚合的质量重复乘陆地比例。

本次格网仍会概化窄冰缘、冰舌、岩石露头和小岛；1 角分源产品更不等于 3.75°运行时分辨率。GDEMM ICE 只包含南极与格陵兰冰盖，青藏与喜马拉雅控制点输入零库存不表示现实中当地不存在山地冰川。控制点的作用是检查本次进口数据没有凭空创建数百米的高原冰层。

源点掩膜与既有 Natural Earth 面积海陆聚合存在具体冲突：533 个大陆冰种子点中有 6 个对应旧 `localLand=0`，41 个冰架点中 12 个对应部分陆地面积。坐标与厚度列于 `source-coastline-mismatches.json`。掩膜类别是**源点的类型**，不是整个运行格的面积比例；不能用一次类别覆盖整个混合格而凭空扩大岛屿，也不能忽略面积规则而声称导入了完整原始冰盖体积。运行时处理与被排除的源点须在主报告实测中公开。

实际源检查点及 ETOPO/GDEMM 表面差异统计存于 `scenes/earth-land-sea/ice-source.json` 的 `checks`、`gridStatistics`、`surfaceComparison`。96 × 49 种子包含 533 个大陆冰类点和 41 个冰架点，缺测为 0；最大采样大陆冰厚 4001.50 m、冰架厚 1202.50 m。这里的点数包含极点行，不是冰盖面积；质量与面积必须按真实球面权重另行统计。

| 原始产品检查点 | 类别 | ICE 厚度 m | 产品 SUR m | 产品 BED m | 当前 ETOPO 冰面 m |
| --- | --- | ---: | ---: | ---: | ---: |
| 南极内陆 85°S / 0° | 大陆冰 | 2177.75 | 2572.50 | 395.50 | 2574.50 |
| 南极点 | 大陆冰 | 2885.41 | 2856.92 | -24.19 | 2833.73 |
| 格陵兰 72°N / 40°W | 大陆冰 | 3185.00 | 3102.50 | -81.00 | 3100.26 |
| Ross 81°S / 175°E | 冰架 | 334.50 | 34.00 | -628.00 | 46.91 |
| Filchner-Ronne 78°S / 50°W | 冰架 | 426.00 | 44.50 | -460.75 | 55.65 |
| Vostok 77.5°S / 106°E | 冰下湖上方大陆冰 | 4125.00 | 3494.00 | -1205.50 | 3520.56 |

罗斯点 `SUR-BED=662 m`，但 ICE 仅 334.5 m；将两个 DEM 差当冰厚会把约 327.5 m 的水腔一并注入冰库。Vostok 点也有约 574.5 m 的冰下水层差。这两个实测检查直接支持独立 ICE 字段的选择。

574 个有冰种子点上，`ETOPO surface - GDEMM SUR` 平均 -5.08 m、RMS 36.53 m、范围 -326.29 至 +408.20 m；差值包含两套 geoid 和地形来源、岸线、采样分辨率差异，不能称作单一基准校正。GFZ 的 1 角分整数网格也存在米级至数米的 SUR/BED/ICE 内部残差，因此模型用当前冰面减厚度建立兼容参考，并保留原始产品 BED，而不强求三个独立栅格形成精确等式。

青藏 33°N / 87°E、喜马拉雅 28.25°N / 86.85°E 的原始 LTM=1，本次进口库存 0；北极点、85°N / 0° 和南大洋 60°S / 0° 的 LTM=0，本次大陆冰与冰架库存均为 0。后两类海洋的季节海冰由运行模型产生与消融。

验证：源生成断言通过；使用校验后的缓存重新生成通过；`tests/earth-ice-data.test.ts` 三项测试通过。样本文件自身 SHA256 同时保存到 `ice-source.json`，普通测试也校验该文件，避免发布时数据与来源记录脱节。
