# 提交与合并记录

基线：`be7460963bec88be82eac11a6f4dcc62e7a5c188`。

- 实施提交：`431dac5eb15855e248da0f345ee4b93bd0e93d31`，分支 `codex/earth-ice-inventory`。
- main 合并提交：`9e594444e0b8f49baa4620fe7e44988a13b1ddbc`，普通 `--no-ff` 合并，无冲突。
- 合并后的 main 再跑全套测试183/183通过、typecheck通过、工作树与diff检查通过。
- 发布目标仅为 `origin/main`：`https://github.com/Heliostest/mapgen4-sphere.git`。使用普通推送，无force push，不推upstream。

本记录和合并测试日志为随后独立的文档提交；其提交号可由Git日志确定。代码/正式场景内容与上述已验收合并相同，未重新调整物理配置。最终远端一致性由推送后的 `git rev-parse HEAD origin/main` 及 `git ls-remote origin refs/heads/main` 核对。

实现、实际截图、数据来源、独立审阅和未解决的海冰校准问题见 [REPORT.md](REPORT.md)。
