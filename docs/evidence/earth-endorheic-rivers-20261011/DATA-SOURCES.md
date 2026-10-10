# 闭流流域数据与物理证据核对

核对日期：2026-10-11。这里记录数据采样与资料研究；浏览器演化、守恒测试及最终代码验收由同目录的 `REPORT.md` 记录。

## 实际采用的数据

| 数据 | 版本与尺度 | 投影与许可 | 用途 |
|---|---|---|---|
| [HydroBASINS standard](https://www.hydrosheds.org/products/hydrobasins) 全球 9 区 level 4 | v1.c，技术文档 2014-07；由 15″ HydroSHEDS 派生，赤道约 500 m；level 4 是流域层级，不是 500 m 网格 | WGS84 经纬度；HydroSHEDS v1 许可，免费科学、教育及商业使用，附再分发条件 | 采样闭流集水区身份与终点子流域；不替换 ETOPO 高程 |
| [Natural Earth Lakes + Reservoirs](https://www.naturalearthdata.com/downloads/50m-physical-vectors/50m-lakes-reservoirs/) | 1:50m，v5.0.0；地图概化比例尺，不是 50 m 像元 | WGS84 经纬度；[公共领域](https://www.naturalearthdata.com/about/terms-of-use/) | 使用 `Lake`、`Alkaline Lake`，排除 `Reservoir`，辅助确认封闭负高程水体 |
| 已有 Natural Earth Land | 1:50m，v4.1.0，与已有海岸线导入一致 | WGS84 经纬度；公共领域 | 自动提取全部逆时针内部水体环，补充湖泊图层未列出的内陆海 |
| 已有 NOAA ETOPO 2022 ice-surface DEM | 原源 15″；本项目下载 stride 24，即 0.1° 采样后插值到球面 mesh | EGM2008 米制高程；保持原场景来源记录 | 保留物理高程、鞍部与真实水库计算；闭流标签不会改高程 |

HydroBASINS 的空间单位、字段及许可见 [v1.c 官方技术文档](https://data.hydrosheds.org/file/technical-documentation/HydroBASINS_TechDoc_v1c.pdf)。原始 `.shp/.dbf` 等 GIS 文件只保存在被忽略的 `build/earth-relief/drainage/`；正式场景保存与本应用 mesh 绑定的整数分类及来源元数据。源数据权益继续服从 [HydroSHEDS v1 原许可](https://data.hydrosheds.org/file/technical-documentation/HydroSHEDS_TechDoc_v1_4.pdf)，不因软件仓库的许可证变成可无限制再分发的独立 GIS 产品。许可 §2.1.2、§2.2 与 Exhibit B 涵盖集成衍生产品发行、终端用户保护及署名；本采样只作为应用的一部分发行，并保留来源、版权及原许可入口。

本产品 mapgen4-sphere 纳入经许可使用的 HydroSHEDS v1 数据，版权归 World Wildlife Fund, Inc.（2006–2022）。WWF 未评估本应用修改并纳入的数据，不保证其准确性、完整性、时效性或特定用途适用性。原数据部分权益属于 USGS、NASA、ESRI、CIAT、UNEP-WCMC、WWF、澳大利亚联邦及英国王室；完整原文与权利声明见原许可 Exhibit B。建议科学署名：Lehner, B. and Grill, G. (2013), *Hydrological Processes* 27(15), 2171–2186；数据来源 www.hydrosheds.org。Natural Earth 图层为公共领域，仍在元数据保留来源。

也核对了 [HydroATLAS](https://www.hydrosheds.org/hydroatlas)：数据库整体为 CC-BY 4.0，个别属性仍受自身 CC-BY/ODbL 条件约束；BasinATLAS 保留 HydroBASINS 拓扑字段。其全球包体积约数 GB，当前下载入口在本机返回 403。本任务使用可直接取得的 9 个官方 HydroBASINS level 4 小包，没有用 HydroATLAS 属性或改称其许可。

## 字段语义与可复现性

`ENDO=0` 表示源数据未归为闭流区，`ENDO=1` 表示闭流区内部，`ENDO=2` 表示内部终点子流域。`NEXT_SINK` 用于聚合真正连接到同一终点的集水区。终点上的 `NEXT_DOWN>0` 可以只是人为提供的拓扑查询虚拟连接；它不是物理出口，也不能用于把湖水倒向海洋。不同于 BasinATLAS/HydroBASINS 的三值 `ENDO`，RiverATLAS 的 `ENDORHEIC` 只有 0/1；本次没有混用。[官方字段说明](https://data.hydrosheds.org/file/technical-documentation/HydroBASINS_TechDoc_v1c.pdf)，[HydroATLAS 技术文档附录 1–2](https://data.hydrosheds.org/file/technical-documentation/HydroATLAS_TechDoc_v10_1.pdf)。

`scenes/earth-land-sea/sample-drainage.py` 手工解析 DBF、Polygon Shapefile，先核对完整下载 SHA-256，再以实际三角形中心做包含孔洞的奇偶判定。输出 `drainage-samples.json`：

- `mesh`：与 `elevation-samples.json` 完全相同的 mesh 身份，包括 fingerprint；当前 107,676 regions、215,348 triangles。
- `basinId`：长度 215,348 的非负整数。0 为源数据外流/未分类区，正整数为按 `NEXT_SINK` 排序的闭流组；原十位 HYBAS_ID 保留在 `groups`，避免 Int32 溢出。
- `terminal`：同长度的 0/1 数组，表示 `ENDO=2` 子流域；不是湖岸、观测水位或精确终点坐标。
- `inlandLakeId`：同长度的 0/正整数数组，表示经辅助图层确认的封闭负高程水体连通分量；详情映射于 `inlandLakes`。

当前 9 个 HydroBASINS 压缩包总计 **39,341,154 字节**，得到 **11,050** 个闭流三角形、**9,083** 个终点子流域三角形和 **193** 个被 mesh 解析到的闭流组。所有已解析组均有终点三角形。Natural Earth 湖泊包 **252,615 字节**，SHA-256 为 `f28d42c286d96b57a17aac2cbeb432f8c65532c20063495711fbc64e24666df3`。9 个全源 SHA、源投影 WKT、源记录数、最终样本 SHA 都保存在 `drainage-source.json`。运行脚本 `--check` 会重新采样并逐字节核对正式样本，同时核对完整来源记录；本次检查通过。

## 里海特殊例外与补充分类

这次对原始 DBF/Polygon 的核对发现：里海湖面在 HydroBASINS level 4 没有 polygon；伏尔加上游示例 polygon `2040292690` 的 `ENDO=0`，其 `NEXT_SINK=2040068680`；伏尔加三角洲示例 `2040067750` 为 `ENDO=0, COAST=1`。所以只读取 `ENDO` 无法处理里海，不能把这种源数据例外当成自然外流。Natural Earth 湖泊图层也不列里海；[官方 Coastline 文档](https://www.naturalearthdata.com/downloads/50m-physical-vectors/50m-coastline/) 明确说明技术上属于湖的里海被包含在海岸线中。

补充算法扫描全部 Natural Earth Land 内环与非水库湖泊多边形，再对当前 mesh 所有负高程三角形做邻接连通分量分析。只有整个分量都受湖泊/内环确认、且不连通到主要外洋时，才写入 `inlandLakeId`。内环使用与既有海岸采样相同的 0.1° 纬度扫描线，以免来源边界取整在 mesh 上制造缺口。没有按地名或地区坐标写条件，也没有仅用“最大水体为海、其余为湖”的规则。

当前实际 mesh 有 **169** 个负高程连通分量，其中只有 **166 个三角形**的完整水体分量被确认；它对应 Natural Earth Land 的唯一内部水体环，即里海。其余沿海小分量均未确认。里海中心示例（42°N、51°E，最近 triangle 195865）的 DEM 仍为 **−567.68 m**，`inlandLakeId=1`，没有把湖床抬为陆地或注入初始湖水。缺少观测初始水位意味着不能声称模型显示出真实里海湖面；本次分类的作用是阻止其入流、蒸发借用无限外洋库存，并为参考河网提供内部终点。

## 地球事实及验收案例

| 案例 | 一手/官方依据 | 当前 mesh 可核对的分类与限制 |
|---|---|---|
| 里海 | [NASA MODIS](https://modis.gsfc.nasa.gov/gallery/individual.php?db_date=2016-06-22) 说明多条河流流入、无外流口，蒸发使盐分积累；[NASA 水位资料](https://science.nasa.gov/earth/earth-observatory/does-dust-affect-water-levels-of-the-caspian-sea-88165/) 说明水位受降水、取水、蒸发等控制 | HB 本身的例外由通用内环分类补充；−567.68 m 湖床保留，初始湖库存未由观测标定 |
| 咸海 | [NASA JSC 影像说明](https://esrs.jsc.nasa.gov/Collections/EarthFromSpace/printinfo.pl?PHOTO=STS51F-36-59) 说明阿姆河、锡尔河汇入且无出口；[NASA World of Change](https://science.nasa.gov/earth/earth-observatory/world-of-change/aral-sea/) 记录灌溉引水与湖体缩减 | 45.5°N、59°E 最近 triangle 192262：闭流组 107，源终点 `4040050220`；参考标签不能恢复被人类取水改变的湖水 |
| 塔里木/罗布泊 | [NASA The Wandering Lake](https://science.nasa.gov/earth/earth-observatory/the-wandering-lake-2046/) 说明塔里木、孔雀河水曾汇于内流盆地，面积随来水与蒸发变化；[NASA 2011 影像](https://science.nasa.gov/earth/earth-observatory/lop-nur-xinjiang-china-51039/) 记录干湖床与人工蒸发池 | 塔里木 40°N、84°E 与罗布泊 40.5°N、90°E 均为组 106，终点 `4040050210`；不能用蓝线或人工灌水冒充现今罗布泊湖岸 |
| 乍得湖 | [NASA JSC](https://eol.jsc.nasa.gov/Collections/EarthFromSpace/printinfo.pl?PHOTO=AS07-8-1932) 说明无出口，边界与深度随季节和年际变动 | 13.1°N、14.4°E 最近 triangle 190397：组 1，终点子流域，源 `1040040190`；这里只核对闭流属性，未使用历史湖面积作现代初值 |
| 图尔卡纳湖 | [ILEC 世界湖泊数据库](https://wldb.ilec.or.jp/Lake/AFR-20) 说明无出口，水位取决于河流/地下水输入与蒸发；[UNESCO](https://whc.unesco.org/en/list/801/) 核对其含盐湖与干旱背景 | 3.6°N、36.1°E 最近 triangle 177717：组 8/终点，源 `1040040260`；模型没有独立地下水与盐分预算 |
| Kati Thanda–Lake Eyre | [澳大利亚 DCCEEW](https://www.dcceew.gov.au/water/policy/national/lake-eyre-basin/about) 明确属于不接海的内部排水系统，通常少水或无水；降雨后短期河流、洪水及强蒸发使多数来水不能到湖 | −28.4°、137.3° 最近 triangle 63925：组 152，源 `5040087590`；已有海岸约定把低于海面的陆地压到 +1 m，绝对盐湖盆底仍未解析 |
| 亚马孙、刚果控制组 | 外流控制用于检查改动是否维持现有 DEM 路由连续性 | −3°、−60° 最近 triangle 152931 与 −2°、22° 最近 triangle 178608 均为 `basinId=0, inlandLakeId=0` |

这些坐标只用于资料/样本查询与报告，不参与分类算法。最近三角形距资料查询点约 15–35 km，故不能声称准确追踪每条真实河道。

## 物理边界与算法建议

现有 `TerrainWater` 本来就以真实边缘鞍部和接收水位的较大值为出流门槛，并以供体库存限制转移量，因而正确的闭流身份应接入这一守恒结构。参考网络只提供年径流示意：在真实闭流组的终点子流域内选择可解析低点，使用同一边缘鞍部图构建无环参考排水树；普通外流网络保留局部洼地及溢流路径。观测闭流身份不意味着把边缘删除成永久无限高坝；只有实际水位越过真实鞍部时，物理 solver 才能溢流。

HydroBASINS 与 ETOPO 具有不同高程来源。50 km 量级球面三角形不可能保留 500 m 水文图的所有分水岭、狭窄出口、支流或湖岸。level 4 还会漏掉更细层级的嵌套内流区；小 basin 可能没有任何中心采样，终点区域在粗 mesh 上也可能分裂。北纬 60°以北源数据使用较粗 HYDRO1k，质量较低；南极不在此源覆盖。源数据只提供身份约束，实际物理出口、水位与库存仍必须由当前 DEM/mesh 和守恒水库确定。[HydroSHEDS 分辨率与局限](https://data.hydrosheds.org/file/technical-documentation/HydroSHEDS_TechDoc_v1_4.pdf)。

本次数据没有引入观测初始湖水位、人工灌水、引水工程或盐分守恒模型；干涸和真实溢流必须通过既有来水、蒸发及水位预算体现。河宽、显示流量阈值及参考年径流都不能增加、移除或搬运真实水库存。
