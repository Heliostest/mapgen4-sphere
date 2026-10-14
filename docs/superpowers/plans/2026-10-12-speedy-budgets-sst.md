# SpeedyWeather 排水 / 质量 / SST 对照 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 修复并验证独立湿大气的排水账本、干空气质量约束，以同初始大气/陆地库存比较 slab 与规定季节 SST，重点诊断印度和北澳。

**Architecture:** 以本地实验 Julia 扩展新增 audited soil component、opt-in 全局压力零阶模式约束和月中心 SST 边界。原生包及上轮实验冻结。真实积分后保守映射并复用只读地球 Renderer。

**Tech Stack:** Julia 1.12.7、SpeedyWeather 0.23.0、JLD2/JSON3、Node/esbuild、原有 WebGL Renderer。

**Spec:** docs/evidence/earth-speedy-budgets-sst-20261012/protocol.md

## Global Constraints

- 正式场景 SHA afb80a8ab730785eed0cb709a66d938ad20a9690b04ecfa1246d1deb393adca6 及 DEFAULT_* 保持不变。
- 不修改已绑定的旧实验、Julia 包源或旧物理求解器；不提交/推送。
- 同一初始存档；T32/8 层/1800 s；真实六年积分；原 GPCC 支持和门槛不改。
- 质量固定器候选漂移与数值水/热影响公开；SST 外部交换不算封闭海洋预算。

## Review Focus

- 两个 Leapfrog 光谱时间层、当前/前一物理格点时间层不可混淆：真实积分/续算完全一致测试。
- 混合陆海格点、超容量及负水裁剪：解析两层水账本及原生 bucket 逐值一致测试。
- Dec→Jan、月长度与闰年：月中心插值连续且中心返回原月场测试。
- 规定 SST 与 slab 分配尺寸不同：逐项初始大气/陆地 SHA 相同测试。
- 用约束隐藏漂移或用海温边界冒充海洋预报：原始指标/数值修正/外部交换必须在输出中有字段。

### Task 1: 数值扩展与真实短期验收

Create 本实验目录下 corrections.jl、corrections_test.jl、components.jl、probe.jl。

- [x] 为排水、负值裁剪、干空气压力约束、月中心插值写解析 RED 测试。
- [x] 实现最小纯函数并 GREEN；用原生组件核对土壤状态与 upper runoff 无变化。
- [x] 读取冻结初始存档，验证不同 SST 组初始大气/陆地物理数组一致。
- [x] 真实短期积分分开验证排水与压力约束；保存未约束候选漂移、水/热数值影响与源元数据。
- [x] 存档续算下一步一致；冻结生产脚本和软件/输入 SHA。

### Task 2: 完整积分、GPCC、回放

Create run.jl、analyze.mjs、report/manifest/verification，独立 preview 与 display contract。

- [x] corrected-slab / corrected-seasonal-sst 同初始库存各连续六年，统计2006；逐日预算、月场和统计年账本。
- [x] 校验原 reference 初始库存，三组诊断口径一致；固定 GPCC 支持及保守映射总量。
- [x] 输出印度/北澳雨季与水汽/低层风/海温诊断，其它区域回归，失败结果保留。
- [x] 审查后独立只读配置切换地球回放，WebGL 格点对照/固定视角/截图。
- [x] 相关测试、构建、源码/资产/原始存档 SHA、正式默认复核及报告完成。
