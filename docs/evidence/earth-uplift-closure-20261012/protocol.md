# 水汽输送与抬升闭合的因果对照

用户要求：优先查明陆地积雪扩大、喜马拉雅过湿、西南澳季节反转；保持正式默认不变；同库存真实积分、独立预算、GPCC 和 NSIDC 对照。

## 冻结的比较口径

- 控制组为上轮 mix4cool：发射率 0.58、热扩散 0.8、水汽扩散 4e6 m²/s，海洋输送 0.3 m/s；transport、独立陆海热库与反照率、导热海冰和冰下输送、补偿海洋累加均相同。
- 不重新生成气候、不更换初温、库存或地形，不改变蒸发率、冻结温度、雪/冰覆盖函数、NSIDC 支持或观测区域。
- 完整积分共同从 `build/earth-lakes-freeze-temperate/lake-day0.json` 恢复 215348 三角形地形及有限湖泊库存；初值水、路由水量、全部温度、显热、焓的哈希必须相同。粗路由另有共同初值，不能混称完整地形验收。
- 积分一个真实物理轨道年。1800 s 和 900 s 实际末步超过年末不足一个 dt；观测累计截到精确物理年，库存账本包括所有实际末步，不能将两者混算。历法初相位为 3 月 20 日。
- 水汽逐格独立计算 `final - initial - evaporation + precipitation - netTransport`；雪账独立计算 `final - initial - snowfall + melt + compaction`。海水与路由分配、全水库存、显热+潜热焓也分别验算。
- 完整地形至少每物理日审核一次，五种降水机制加和独立等于陆地总雨量；JSON 保存恢复后的下一步与连续积分完全一致。
- 因果驱动的月平均值在 water.step 结束、环境回加凝结潜热之前采样。RH 是实际逐步比值的时间平均；rhFromMeanState 则只是月平均温湿状态重算的比值，二者不混用。
- GPCC v2022 1991–2020 共有效陆地支持；年总量、月雨、DJF/JJA 分开公开。NSIDC G02202 v2 1981–2010 共海域支持，固定 15% 范围和 0.5 m 海冰诊断。NSIDC 海冰不能充当陆地积雪观测。

## 预先提出与检验的原因

1. 扩散的两路湿度交换被同时当成迎坡运动；大 K 是否制造地形雨与冷地降雪？用无风山坡回归测试、advective / eddyFront 年积分和输送来源诊断检验。
2. 冷空气推进是否漏掉对暖湿驻留气柱的排开与抬升？用干冷供体和有限暖湿受体的失败测试检验，再做 coldFront / eddyCold 年积分。排开比例必须来自同一面风，降水只扣实际暖湿受体，不能重复抬升全柱。
3. 混合海陆气柱高度修正与热辐射是否不同？consistent 对照采用热模型的面积加权四次方发射律；不会改变初温和库存。
4. 对流的绝对 290 K 门槛是否导致冬季缺雨？buoyant 对照只去除绝对地温门槛，保留相对浮力、湿度、太阳加热与有限供水；失败候选同样保留。
5. 积雪是降雪来源增加还是融雪不足？mix1 与 control 只改变混合；实际 snowfall/melt/compaction 逐格全年累计。不通过压小显示覆盖或强制融雪来掩盖来源问题。

## 有限的结构修复

`upliftScheme: advective` 将标量扩散和机械抬升完全分开。`eddy-front` 保留原温度锋面上的两路有限涡旋气团交换，但不让这项交换同时产生山坡抬升。真实迎坡风保持降雨与雨影。两种方案都是明示的实验，不存在区域雨量目标或地理掩码。

`coldFrontDisplacement: true` 补齐相反锋面路径：冷的实际迎面风用 `1-exp(-|windRate|*dt/2)` 排开暖受体的有限比例，使用与原暖锋相同的固定直减率抬升近似；不要求冷供体自带湿气。水汽扣自受体，记为本地锋面雨，面输送只记真正过面的水；凝结与冻结潜热仍由原环境账各记一次。零面风、零热对比、零驻留湿气均没有这项雨。

模型仍没有垂直温湿廓线、预报干空气质量和气压、锋面位置或 CAPE/CIN；固定直减率和高度平均是近似。守恒、正性和小步长差异只证明数值一致，不能证明季风、雨影或冬雨的区域接受。

## 复现

`node docs/evidence/earth-uplift-closure-20261012/setup.mjs` 使用保存的 screen.ts / full.ts 构建 Node ESM。设置 `PARAM_PROFILE` 后运行对应 bundle；`PARAM_DT=900` 用同初值半步长。不要在运行时重写 bundle，输出记录它的 SHA256。setup 不再从旧 harness 生成丢失末步/压实记录的探针。

年度完整对照使用 control、coldFront、eddyCold 三个 profile 和 PARAM_DT=1800。半步长粗对照使用 coldFront900、eddyCold900 和 PARAM_DT=900，单独文件名避免覆盖 1800 s 的完成结果。causes.ts 使用 CAUSE_STAGE=full 或 screen；restore.ts 直接读取三个完整地形年末 JSON，校对保存端点与积分雪/水汽账、再保存/恢复并比较下一实际步。

首批未保存的探针只因雪账包装器遗漏粗模型压实和末步截断而停止；修正的是诊断账本，物理步骤没有重设。保留的各结果均在修正后的雪账下完成全年并通过断言。

物理依据：[Met Office 锋面](https://weather.metoffice.gov.uk/learn-about/weather/atmosphere/weather-fronts)、[澳洲气象局副热带高压脊](https://www.bom.gov.au/resources/learn-and-explore/climate-knowledge-centre/climate-factors/subtropical-ridge)、[IFS 物理过程](https://www.ecmwf.int/en/elibrary/74362-ifs-documentation-cy38r1-part-iv-physical-processes)。这些支持过程区分与冬雨机制，不为简化模型系数提供观测标定。
