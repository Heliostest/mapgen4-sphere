# 半隐式温度拆分：独立只读审查

2026-10-13。审查人未修改 `implicit-corrected.jl`、作者测试、运行入口或已冻结数据。结论：**当前 CPU / Float64 / Leapfrog / 二阶中心平流 / 纯 sigma 的 V2 使用范围内，无阻断发现。** 这不是对长期稳定性、气候质量或季风改善的验收。

审查绑定：

- `implicit-corrected.jl` SHA256 `1af4513f14c7f66a42a3253f7288df18e84d7d1c4757edff0aadfa43949275d2`。
- `implicit-test.jl` SHA256 `b5b6432ccd319e98a6606ef716b36df4f65632442be1d737b9055cfb7a8bc178`（作者最终运行状态记录与当前源码一致）。
- 只读检查的 `run-v2.jl` 快照 SHA256 `6ef15eb69c6ce44a9c1c04b9e98aed037cd5f81642eb986fd299016c69201802`；它不是本审查负责冻结的文件，后续入口修改应重新确认相关行。

## 算法与调用链

1. **L 矩阵对应原生核的 Jacobian。** 新文件 46–53 行按原生 sigma 半层质量通量构造 V：下界面系数为 `(sigma_half[k+1]−1[r≤k]) Δsigma[r]`，上界面为 `(sigma_half[k]−1[r<k]) Δsigma[r]`，温度差乘在整个通量系数上，符号为负。原生二阶中心平流核恰给出两界面温度差之和除以 `2 Δsigma[k]`。顶、底温度差和边界通量为零；等温场 V=0，垂直均匀 D 对应 w=0。新 74 行 `L=V+diag(L2)L3+diag(L4)` 加上原生干绝热项，单位为 K（作用于已按半径缩放的散度）。这是修复两个确定的原生拆分/矩阵问题，不是调整参数。
2. **背景补回一次。** 原生 `dynamics/tendencies.jl:137–174` 在竖直平流前减去 `implicit.temp_profile`，在动力过程末尾加回。原 `vertical_advection!` 因此只运送温度距平。新文件 102–112 行对同一个原生 `vars.dynamics.w` 平流水平常数参考温度，并在频谱温度倾向中补回。该 scratch 每次先清零；整个模型步的调用链在 dynamics 后、水平扩散前仅调用一次 `implicit_correction!`。没有第二处补回，也没有修改网格温度或预报场。physics-only 路径不调用隐式修正，故不存在关动力时凭空加背景项的问题。
3. **非线性与线性时间层分工正确。** w 由当前动力层计算，包含地形压力通量；因此背景平流中的非线性地形部分首先按当前层恢复。随后原生 implicit kernel 用 `L(D_old−D_current)` 把线性部分移至旧层，再进行隐式更新。新方案没有把完整 w 错当作纯线性散度项，也没有重复乘半径。
4. **半径与启动时步。** 新 86–95 行使用实际 `time_step`（启动时半步、一步、再两步）除以预报 scale；原生隐式 kernel 同样使用此比例。原生 w 与倾向已按半径缩放，102–112 行无需再乘/除半径。S inverse 的谱阶约定和原生相同，未使用的末行保留原生零处理。
5. **限定条件明确。** 初始化拒绝 GPU、非 Leapfrog、非二阶中心竖直平流、非纯 sigma 和非零顶部 sigma，避免把该离散 Jacobian 推广到不匹配的算子。未覆盖的 Enzyme/GPU 和其它坐标不属于当前候选。

## 独立执行检查

除阅读作者结果外，审查期间用 Julia stdin 运行轻量核级检验，未推进模型、未写检查点：

- 随机种子 1013，n=3/8/12，每个 n 一组随机非均匀半层和 15 个随机温度/散度列，共 45 个例子。将新 L*D 与**安装包的原生竖直平流核**加解析原生干绝热项直接比较：最大绝对差 `4.962359412274964e-10`，按响应量级归一化后最大相对差 `5.18421809854961e-14`。随机薄层造成较大绝对响应；首轮统一 `1e-10` 绝对阈值曾在 `1.4887e-10` 失败，之后使用 `2e-12` 相对尺度判据，源码未改。这是浮点比较尺度问题，不隐瞒为全精度逐位相同。
- 显式设置旧/当前两层散度不同，centering=0.7，dt/radius=3600/6371000，频谱阶 l=5，并加入独立 forcing；执行原生 `implicit_primitive_leapfrog_kernel!`。其完整 17 维 D/T/logp 更新与直接块矩阵求解 `(I−ατA)x_new=(I+(1−α)τA)x_old+τf` 的最大误差 `5.684341886080802e-14`。这补充了作者同层线性波测试，确认 `L(D_old−D_current)` 的时间层补偿没有漏项或重算。
- 用实际 `coupled-seasonal-statistics-start.jld2` 读取 2006 冻结参考状态，按 `run-v2.jl:212–215` 的方法重新初始化新算子。**原参考温度 profile 与 Δt=3600 s 逐值保留**，scale=6371000；新旧 L 最大差 `16.507907576653892`，说明确实重建了修复矩阵，而非复用旧矩阵。该探针最终退出码 0。首次仅加载包而未定义旧审计组件时，JLD2 对包含旧组件的 typed Dict 反序列化失败；加载冻结 physics-model 类型后成功，不是被审查驱动的失败。

实际保留的参考 profile 为 `[200.1440,226.3216,243.6487,255.5526,264.6453,272.1231,278.5906,284.3862] K`。它与检查点当时平均温度 profile 最大差 34.5891 K；此差异来自原生长期固定线性化参考策略。为了同初态比较保留旧参考是正确的，但线性波验证不证明大偏离参考的完整湿模式长期稳定。

## 作者证据复核

已读取最终 `implicit-fixed-final-green.log` 和对应 status JSON：1014 个矩阵/线性波断言、120 个网格拆分/地形/时间层/半径断言全部通过；退出码 0，前后 include 与安装包源 SHA 一致。网格测试覆盖两种 reference、重复调用、不同 old/current 场和 0/1200 m 地形；每次重建输入倾向，避免把 scratch 残留误判为补回。作者给出的最大矩阵误差约 `5.42e-14`、线性波更新误差约 `4.30e-13`，与本次独立检查一致。

## 非阻断限制

- `enabled=false` 或 `centering=0` 只关闭隐式求解，仍恢复完整温度的背景平流；不能把这个开关当作“完全原生”对照。当前 V2 未修复组选择原生 `ImplicitPrimitiveEquation`，此处使用正确。
- 构造/测试限制为 CPU；测试没有证明非线性强迫下永远稳定，也没有检查完整湿模式的能量积分闭合。三天两模式审计、重启一致性和同初态新对照仍必要。
- 2006 分支应继续保留旧 reference 和实际时步并只重建新 L/S。若入口改为重新取当时平均温度，必须把 reference 改变作为额外实验因子，不能仍称同样的单因素修复。

本次无需修改被冻结 include。可继续 V2 独立短审计与已规划的比较；任何季风结论须等待其实际结果。

## V2 实际已写入的 2006 初始检查点复核

主线程启动三个一年分支后，又只读加载其真实 `*-initial.jld2`，而非仅对准备脚本作静态推断。Julia 进程退出码 0，42 个断言通过：三个时钟均为 2006-01-01；涡度、散度、温度、湿度、压力的全部预报数组逐值等于旧 2006 初态；三组 reference profile 与 Δt 逐值等于旧组件。新隐式组的 L 和 S inverse **逐值等于独立按旧 reference 重建的矩阵**，蒸发单因素组则逐值保留原生矩阵。

| 实际初始检查点 | 陆面湿通量 | 隐式组件 | 长波传输 | 所有组共享的新组件 |
|---|---|---|---|---|
| evaporation-sensitivity | DewAwareLandHumidityFlux | 原生 | 原生 | ConservativeParcelConvection、CorrectedDiagnosticClouds(:full) |
| implicit-sensitivity | 原生 | ConsistentImplicitPrimitiveEquation | 原生 | 同左 |
| all-corrections-sensitivity | DewAwareLandHumidityFlux | ConsistentImplicitPrimitiveEquation | ReflectingLongwaveRadiativeTransfer | 同左 |

三个检查点 SHA256：

- `evaporation-sensitivity-initial.jld2`: `3502b4daf64dd3c6a645c091842184d7a42e84e3563417aac3b3e91ab6e6df7b`
- `implicit-sensitivity-initial.jld2`: `ef54c40b0a34fd7802ec5bd33ee590137b6a413e7d24df9e9050a6be419be6d6`
- `all-corrections-sensitivity-initial.jld2`: `0bf19dccfd5e001088030e297a15c7b74851d86dedc4cf65be896393234b3399`

因此实际启动的分项新组件没有被旧检查点覆盖，旧线性化 reference 也没有被 2006 当时平均温度替代。`run-v2.jl:24–33` 的通用 `restore(path)` 会恢复全部已存组件，适合同源物理的断点恢复；它不是更换物理的入口。当前一年分支实际执行 200–215 行的 `SENSITIVITY` 路径，该路径专门保留新组件并重建矩阵，使用正确。
