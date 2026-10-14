# 当前工作状态

## 2026-10-13 最终交付状态（覆盖以下历史）

第三批六年积分及热力对照全年均已完成，无后台原生积分。`split-reference-seasonal` 105169步/3461.75秒、2001→2007，code0/source+inputs unchanged、原stock SHA4c665c...。第三批旧失稳没有重现，但不作任意状态稳定性的证明。

六年统计年：印度496.04838mm、JJA60.2954%、峰6月、月MAE62.36529，3/4；北澳1690.35014mm、DJF38.2369%、峰2月、MAE74.70676，2/4。年雨相对GPCC分别−56.41%/+71.46%。11区6回退。不能用同2006初态的一年分支两地均3/4替代这组长期结果。全年水+1.2325977/容限3.1496246mm；完整六年+7.9083662/18.7209321mm；陆水/干质量通过。全球TOA−55.63532W/m²，规定SST外部补热明确记账。三天逐步水峰仍约.06136mm，超过.05且各5/145步，未修好。

本轮有12组完整气候案例（9个同2006初态一年分支、3个完整六年），另保留第二批三次热力长期失败、两次首日主动终止及诊断RED。63个gzip，原862.118MiB/压缩448.710MiB。最新六年、区域误差/预算和第三批一年图均已目视检查。结论与执行细节见report.md；独立审查见final-review.md、v3-climate-review.md。

最终完整性由manifest.json与verification.json记录；科学验收与文件完整性分列，科学整体仍未通过。只读旧三轮核验683条绑定/550个独立文件，105原生源码不变；DEFAULT_THERMAL/WATER/ENVIRONMENT保持HEAD声明，正式earth-simulation.json保持SHA afb80a8ab730785eed0cb709a66d938ad20a9690b04ecfa1246d1deb393adca6。没有提交、推送或提升默认。

若继续下一轮，应新目录/新文件/新标签，不能覆盖本轮源码与证据。优先处理pressure/continuity/SI与M/Q共同时间推进、时间层/restart、正性和谱回投，再接水源；现有湿载体92+34机制GREEN但9接入RED，绝不能直接写回耦合模式。辐射耦合及区域雨量回退也仍需解决，不靠地区调参掩盖。初态投影只解决辅助谱约束，不解决水峰。

下方所有“运行中”“待完成”的描述均为当时进度，不表示目前仍有运行。

## 2026-10-13 16:26 权威更新（下方仅历史）

仍必须等待第三批六年 `split-reference-seasonal` 完成：session84916，monitor50970，最新约2005-03，72961/105169步。源/输入/协议冻结，不可改V3入口。完成前不能finalize或结束本轮。

热力单独一年 `thermal-split-reference-sensitivity` session55936已code0/source+inputs unchanged，17520步692.48秒，固定combined-implicit-split-reference。India618.4137mm/JJA70.7783%/峰7/月MAE46.8203；北澳1535.4758mm/DJF60.6057%/峰2/MAE54.7501，各3/4但年量失败，11区5回退。水+1.780735mm通过、陆水6.61e−13、干质量8.88e−16。TOA−56.418855W/m²，OLR256.4583，P4.32115mm/d。monsoon_diagnosis正在追加该机制对照，原10组快照保留。

全修正一年先已完成：India632.3357mm/JJA53.8175%/峰7/MAE51.3481，北澳1718.9425mm/DJF61.6202%/峰12/MAE61.0890，各3/4但年量失败；8月印度仅56.3对观测290.3，不能说整条季风曲线已准确。11组聚合已完成（9一年+2六年），57个gzip、原782.05MiB/压缩409.67MiB。图已生成且一年第三批目视检查；最近只改subtitle须终稿再生成。

载体研究已完成且冻结：wet-carrier-report.md、physics-moisture-carrier-review.md及各bindings；原型92机制+34双时间层GREEN、140复验通过，9接口RED。合法投影初态无物理无质量约束3步原生水+.0323236mm、空气+2.164075kg/m²、clip0/aux0。独立M/Q能守恒，但native压力一致性、RAW正性、谱回投都失败；未接coupled，不启动无意义长期。后续需压力/SI与Q共同时间积分设计，不能只加q wrapper或补水，也不表示必须重写所有温/动量核。

新final_acceptance_review以无历史只读审查报告/后处理/验收脚本，遵循requesting-code-review skill；等待其反馈及最终12组。最终manifest尚未运行。Root已在verify-evidence逐项重验DEFAULT声明SHA、分开失败climate driver与失败diagnostics；verify-preservation固定旧manifest原SHA。这些可改后处理不在任何子bindings/运行绑定内。

剩余：六年完成后验code/source/inputs与初库存→12组compare+fields→归档新6年→monsoon独立复核追加6年→plot/report并目视→保存最终审查/状态→旧366/native105只读核验→make-manifest --finalize→verify-evidence。不可跑旧verify-final.mjs，不提交、不提升默认。最终明确科学验收是否通过，而不能以证据完整性替代。

## 2026-10-13 15:59 新结果

第三批一年`split-reference-sensitivity`已完成17520步、1007.79秒、code0/source+inputs unchanged，session77551结束。全年水残差+1.368046mm、原容限约3.1811mm；陆水/干质量通过。全球P4.35364mm/d、TOA−57.18135W/m²、OLR257.0154，原物理框架局限还在。统计区域compare进程session96060正在生成10组；summarize已更新10组，归档52个/原712.93MiB/gzip372.75MiB。agent monsoon转做新v3-climate-review.md（此前projection证据冻结）。六年session84916继续、monitor50970继续，当前约2002初，不能final。

投影3天`audit-projected-initial-v3`完成code0/source+inputs unchanged，各145步aux全0，峰slab .06139591905/seasonal .06138822975mm，仍各5步越.05。干质量target较raw多5.69695e−5kg/m²，导入水−1.7578e−6mm单列。报告scalar-initial-projection-audit.md已冻结。make-report已加入它和三批audit。

wet-carrier新研究在进行：原始冻结初态关闭物理（dynamics_only）且不注册mass/SST的前三步native RED：空气+0.349588/+1.040866/+2.163796kg/m²、水+.00356031/+.01041622/+.03232107mm，原q正且clip0。vertical将另对合法projected初态验证，不能混aux影响；共同M/Q源关闭原型尚在审查，未接coupled。physics独立17反例证明RAW(logp,q)不保乘积、共同M/Q与不同nativep不相容、中心通量/RAW不保正、clip可注水；均构造例不作真实.061归因。

make-manifest/verify-evidence新增startupAudits及climateAndStartupAcceptancePassed关联physicsFix，node语法过；仍未finalize。DEFAULT3项刚只读对HEAD相同、regex有效。不可修改冻结V3文件/旧源，后处理可继续。

## 2026-10-13 15:42 最新运行状态（覆盖下方）

第三批真实启动：`split-reference-sensitivity` session77551（原2006一年）、`split-reference-seasonal` session84916（原2001六年），读进度monitor session50970。均PHYSICS_FIX=all-corrections-split-reference、MASS/MOISTURE/MIXING=fixed、30min。根V3model/include/driver/launcher/v3-protocol现全部冻结，**不可修改**。最终include=`implicit-split-reference-v2.jl`，SHA22f9ef9c91190285d6aafc543abce8c6e706d11662a907a3eab4dd6cd02bfcfd。自测651、独立2796+16启动+1074湿场+36实际放大矩阵均GREEN；影子参考3启动阶段差0。短窗原版仍单独保留。相关报告与agent binding现冻结，后续研究写新文件。

根3天audit session99901已code0/source+inputs unchanged，两模式各145步且原stock SHA4c665c...。峰0.061368830/0.061360944mm，仍各5步越0.05；离散终点0.021093910/0.021292302，矩形终点−0.013076024/−0.009894128，物理最大5.42e−20。不得称湿质量已修好。

三代理继续独立新文件：vertical_mixing与physics_review开展Q=p*q载体时间推进可行原型/独立数学审查，禁止全局补水或改口径；monsoon_diagnosis投影helper已112GREEN，源码SHA572893f6eacdb9594160638b320e44fd5da6fd047dcec94ae58f19a5f3e3109c，正重载验证并另建audit-projected-initial-v3三天双海温对照。2006旧grid1 q保持至自然轮转，其他历史依据证明扣aux；两个真实步已通过辅助0/旧grid轮转/有效谱位相同。投影与原V3长期仍完全分离。

root已扩展make-report.mjs/plot.py支持V3案例和audit，但待输出后重新生成。新watch-progress.mjs仅读新case月进度与完成状态。完成后对所有case调用compare(bundle)/summarize/archive，不要覆盖旧三轮证据；final manifest仍未运行。

## 2026-10-13 15:30 权威更新

以下旧时间线仅作历史，不表示仍运行。根线程所有第一/第二批运行已结束：9组完整结果（7个一年分支、2个六年），3组V2热力长运行失败。47个gzip归档已完成，最终manifest尚未运行。正式默认、旧366绑定和105原生源码保持不动。root目前没有原生运行会话。

三名现有agent在继续：vertical_mixing执行SplitReferenceImplicit的真实故障前48h短窗，并修正新鲜启动时的参考profile刷新语义；physics_review独立验证新核与非零背景的完整RHS；monsoon_diagnosis实现独立辅助谱初态投影helper并处理RAW旧格点历史。

新SplitReferenceImplicit的650项自测和2796项独立blocksolve/RAW已通过，源SHA224ce07c9552709f31c2e74521e3624ae5894c2a7319ca404faed59c11124d31。其已被短窗绑定的implicit-split-reference.jl永久保留。发现其首次初始化后固定Tdyn，而V2在启动counter0/1/2分别从真实平均T刷新；agent将另建implicit-split-reference-v2.jl恢复V2语义，原版不改。2006固定dt短窗不受这项区别影响。

根已准备v3-protocol.md、transport-v3-model.jl、run-v3.jl、audit-v3-candidate.jl、run-v3-julia.mjs。尚未运行/冻结；model目前include旧split-reference，启动前须改到经过审查的v2新文件。第三批使用原Tdyn和原组件已有288K求解参考Tsi，配对压力old/current线性项；不改原初态辅助行。先短窗/三天账，再新split-reference-sensitivity与split-reference-seasonal，分别原2006一年、原2001六年。不得将单测或局部线性稳定当气候通过。

辅助谱来源已确定：Spectrum(33,32)的l_index33是degree32辅助行，有效<=32。原生PressureOnOrography→set!(grid)→transform产生非零辅助；水平扩散只清倾向，Leapfrog保留原状态。2001至2007 T/p/ζ/D辅助逐位不变，q仅随质量修正缩放。质量约束只改p常数模，不是来源。清压力副本aux消除curlgrad/divgrad恒等式误差；FullGaussian同样存在，非ring alias。详见readonly-reference-review.md。

投影实验严格分离：两个谱层各自清五标量aux、有效谱保持位相同，记库存改变与新SHA。RAW后的spectral step1不等于旧grid1物理历史，不能直接重建旧grid1；root已同意保留旧grid历史，仅在贡献可追溯时删除对应aux，否则等自然轮转并明确限制。当前grid2可重建但记录原不一致差额。原V3继续用原初态，不混入投影。

make-report.mjs已加入三次失败、独立稳定性机制、辅助行来源和第三批待完成；生成报告尚需继续更新。新comparison/fields目前9组。所有V2/第一批入口和source冻结，新增修复均新文件新标签。下一步等新wrapper GREEN/独立审查/真实短窗，再启动第三批长期验证；其他后处理与最终完整性工作见下文，必须使用只读旧证据校验工具，禁止旧verify-final.mjs。

## 早前时间线（已经过时，以本页顶部为准）

更新：2026-10-13 14:41（Asia/Shanghai）。本文件替代更早的WORKING-NOTES进度，非验收声明。

重要新失败：implicit-sensitivity、all-corrections-sensitivity均exit1，原生垂直混合`sigma_conductance`检测`virtual temperature must be positive`，最后月进度分别2006-02/03。源码/输入未变，不能视为已完成气候结果。vertical_mixing负责独立复现首次坏值与过程；physics_review独立审查非线性/Leapfrog配对。冻结源码不改；all-corrections-seasonal仍运行至2001-05。没有截断温度或放宽门槛。

14:48补充：evaporation-sensitivity已code0/source+inputs unchanged，17520步；印度253.33mm/JJA15.91%/峰3月/MAE90.54，北澳1645.89mm/DJF25.46%/峰10月/MAE96.42；季风仍未过，11区8区MAE比旧coupled更高。聚合现6组。新增longwave-sensitivity（combined-longwave）session28178，14:46启动，用冻结V2入口分离灰体反射效应。physics_review已找到真实2006 West Siberia剖面的SI+RAW+原生HyperDiffusion计算模态λ−1.00234627、l18、e-fold8.89天；连续系统中性，参考矩阵正常。正在扫描真实列/参考分解等价与稳定数值参考候选，vertical_mixing复现实际首次坏值。

14:50更新：all-corrections-seasonal session64272也exit1、同非正虚温错误，最后月进度2002-02/19009步，source+inputs unchanged。V2热力方案未过长期稳定性，报告已列三次失败，不能作为完成气候候选。下一版需新文件新标签，V2仍被longwave分支绑定冻结。新make-manifest.mjs和verify-evidence.mjs已准备但未运行，须等全部实验/报告落定后finalize。

15:04更新：所有根线程气候运行已结束。第一批parcel-seasonal/combined-seasonal code0各105169步，source+inputs unchanged；完整六年水残差−0.5512/−0.9010mm（原容限12.8547/12.4911），陆水/干质量通过；印度146.66/101.95mm、夏20.63/23.53%、峰2/4月，北澳1785.39/1678.28mm、夏25.16/22.73%、峰均8月，两地区均0/4季风门槛。11区8/7区MAE回退。longwave-sensitivity也code0，正在并入9组完整结果，root后处理session9294。此前8组图已视觉检查。raw目前42档，加入longwave后47档。所有V2文件继续冻结以保留可复现版本。

接下来主要是热力失稳修复：vertical已逐值复现两次真实失败（thermal #2795/2006-02-28 05:30、all #3107/03-06 17:30，北太平洋中层），物理在加热而动力候选温度已负。old/current振荡和垂直速度先增长；CFL诊断用3600s整段跨度，常规30min CFL须除2，别误判阈值。physics_review全列稳定性扫描发现等温参考虽消除强负计算模态仍有22列弱复模态；原参考缩步450s仍5列弱增长，不能声称全稳定。其old=current物理动力reference不变性检验T/vor/div差异未解释，monsoon_diagnosis也在独立排查最高辅助谱行、向量梯度curl恒等式或fixture。未授权部署任何等温参考实现，须先厘清差异。

用户已授权继续。正式默认与旧三轮证据不修改；旧366绑定已验。全部运行源码/include/launcher/protocol冻结，所有新文件在本目录及build/earth-speedy-transport。

已完成：第一批5个一年分支均code0、source/inputs unchanged，年度水/陆水/干质量通过，季风完整四门槛均失败；印度年雨baseline183、cloud-precip172、cloud-full162、parcel126、combined118mm，观测1138。基线复现2,851,224数值误差0；逐过程复放17520步/12个月温湿风雨误差0。对流1497通过，独立12344抬升检查；云117/119通过。

第二批新增已冻结：背景温度垂直平流与一致半隐式矩阵1134通过；陆面正蒸发/真实露水346通过且独立审查；灰体长波反射175通过。源SHA依次1af4513f14c7f66a42a3253f7288df18e84d7d1c4757edff0aadfa43949275d2、8258dab6422c7ea2a245492e94c8c9eb06fad5244a0cbef851ee43094e048db0、b047709d264a07e057152af95a6f9f1d6e1b78550441909dbc51935fd1053785。

all-corrections两模式三天audit已完成145步/模式，code0/source+inputs unchanged，物理水余项最大4.24e−20；离散峰0.063190/0.063182mm，原0.05门槛仍失败；末态矩形−0.013960/−0.012138，离散+0.023618/+0.023775。没改任何水库存以补差。

## 在运行，必须等结果

| case | session | 起点/时长 |
|---|---:|---|
| combined-seasonal |12947|2001六年，第一批气块+云|
| parcel-seasonal |96871|2001六年，第一批气块|
| all-corrections-seasonal |64272|2001六年，第二批全修复|
| evaporation-sensitivity |48331|2006一年，第一批组合+蒸发|
| implicit-sensitivity |63976|2006一年，第一批组合+热力|
| all-corrections-sensitivity |17027|2006一年，第二批全修复|

14:32前两组到2004-05；其余14:30启动。进度读build中*-progress.json。所有长积分仍T32/8层/30min，2001→2007、5年预热和2006统计，原初态/SST/支持/门槛。

vertical_mixing agent独立跑30/15/7.5min同2001初态三天收敛，校验145/289/577步与共同30min采样，不替代30min气候协议。physics_review核对implicit随机原生核及2006旧参考profile恢复；monsoon_diagnosis蒸发独立审查已完。

## 后处理

1. 每组结束验code/source/inputs/起止/calls/初态SHA；compare-sensitivity.mjs须esbuild bundle再跑。给所有完成case，聚合会覆盖。
2. summarize-candidates.mjs、plot.py、make-report.mjs更新全部结果；补完整六年预算（不能只列统计年）、11区回归及失败门槛。当前报告是草稿。
3. archive-outputs.mjs已归档第一批5组25文件345MiB raw/184MiB gzip，追加新完成组。
4. 最终verify-preservation.mjs和check-native-sources.mjs只读旧366绑定、正式场景、105原生源；创建新manifest/verification。不跑旧verify-final.mjs，它写旧证据。
5. 正式默认不提升，除非完整季风与预算验收通过。灰LW不随云/湿度反馈是理想化设计限制；缺有限海冰库存、完整统计restart仍明列。现实土壤吸附不等于本bucket错误露水扩展。

最早baseline-sensitivity/clouds-full-sensitivity首日因目标质量恢复舍入差7e−12主动停止，保留日志，不算结果。任何冻结源若需改，先停依赖运行、留日志，再新标签重跑。
