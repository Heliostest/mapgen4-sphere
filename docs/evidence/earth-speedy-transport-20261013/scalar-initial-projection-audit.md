# V3 三天独立初态投影对照

使用相同 all-corrections-split-reference 模型配置、原 2001 输入和原生启动过程；在导入后、启动前调用一次冻结 scalar-initial-projection helper。两模式各 145 步、相同时钟；之后每步仅断言辅助行零，无重复投影。保留原审计 register_mass!(v,m) 的语义：各自初态 dry 库存成为各自质量约束 target，投影后 target 因而略变。这是派生初态效应的一部分，不能称所有控制量完全相同。原 V3 raw 初态入口、审计和长期试验均未更改。

| 模式 | 原残差峰 mm | 投影后峰 mm | 原第145步残差 mm | 投影后第145步残差 mm | 原/新 >0.05 mm 步数 |
| --- | ---: | ---: | ---: | ---: | ---: |
| slab | 0.06136883026 | 0.06139591905 | 0.02109391024 | 0.02107168591 | 5/5 |
| seasonal | 0.06136094401 | 0.06138822975 | 0.02129230199 | 0.02121103769 | 5/5 |

残差采用既有 Leapfrog/RAW 离散通量账，保留所有原数值系数。初态投影的大气水变化单列为导入差额，初始库存从投影后状态起算，没有把它加入降水或蒸发。

**slab**：原/新峰所在时刻 2001-01-01T03:00:00（第7步） / 2001-01-01T03:00:00（第7步）。

导入 ΔW=-0.000001757801499 mm，ΔM=0.00005521174899 kg/m²。逐步同钟水库存最大差 0.009889758145 mm；累计蒸发最大差 0.001088591753 mm；累计降水计数最大差 0.009646874520 mm；离散残差最大差 0.0001222260085 mm。

原 dry-mass target 9885.345173 kg/m²；投影后 target 9885.345230 kg/m²；差 0.00005696954941 kg/m²。没有把新 target 强制改回旧 target，也没有另作首次约束来隐藏这项差额。

投影试验逐步温度范围 182.4669129–309.5503341 K，最大风速 66.21939934 m/s；全程标量辅助行精确零，最大参数化水残差 3.388131789e-20 kg/m²/s。

原 stock SHA：`4c665c83b08918fad6f8b67968fae472539c8796515afc93a22099d682b44a68`；投影 stock SHA：`2b1bbf5955da5d88ff770605b945b19fb2c8cf1ff172bc7fa2d80d20ad5fbdaa`。

**seasonal**：原/新峰所在时刻 2001-01-01T03:00:00（第7步） / 2001-01-01T03:00:00（第7步）。

导入 ΔW=-0.000001757801499 mm，ΔM=0.00005521174899 kg/m²。逐步同钟水库存最大差 0.01469432199 mm；累计蒸发最大差 0.001118196479 mm；累计降水计数最大差 0.009829958978 mm；离散残差最大差 0.0001652720415 mm。

原 dry-mass target 9885.345173 kg/m²；投影后 target 9885.345230 kg/m²；差 0.00005696954941 kg/m²。没有把新 target 强制改回旧 target，也没有另作首次约束来隐藏这项差额。

投影试验逐步温度范围 182.4706824–309.5438672 K，最大风速 66.22306982 m/s；全程标量辅助行精确零，最大参数化水残差 5.421010862e-20 kg/m²/s。

原 stock SHA：`4c665c83b08918fad6f8b67968fae472539c8796515afc93a22099d682b44a68`；投影 stock SHA：`2b1bbf5955da5d88ff770605b945b19fb2c8cf1ff172bc7fa2d80d20ad5fbdaa`。

原三天 audit 未保存逐步温度范围，不能从该 JSON 虚构新旧温度差；只能给出原运行通过有限/正温断言，以及本次新增的绝对范围。

本试验验证辅助行导入修复在完整短积分中持续有效，不能证明季风、全年气候或长期稳定性已修复；残差峰及所有越线步数如实保留。

## 绑定

- `build/earth-speedy-transport/audit-all-corrections-split-reference.json`：`d02f81bccd281cedb200d63f39a02d305a0a2c3407ae570863d222bbc80ec32d`
- `build/earth-speedy-transport/audit-all-corrections-split-reference-projected-initial.json`：`3f76d726edc98cc49e42889d7af031fc8e666f1c9a4ff3df29d17093c30a2c52`
- `docs/evidence/earth-speedy-transport-20261013/audit-projected-initial-v3-native-status.json`：`aeefe86761aa35befa8c7d1dd3aa1136299d9fe7cb5b777656655ee835322b0a`
- 比较脚本 SHA：`ae833c1c331a269a46375d33b8ccb589a7965eede9c97d76b830e4f4910ac0b3`
- 全部逐步差异：`build/earth-speedy-transport/readonly-projection-audit-comparison.json`
- run-v3-julia 报告 code=0、sourceUnchanged=true、inputsUnchanged=true；源代码和原始初态/SST/环境均已哈希绑定。
