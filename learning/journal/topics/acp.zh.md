# 主题：ACP（Agent Client Protocol）

一句话定位：对 harness「对外标准自动化面」的历次理解——从 server 侧的准入/结算/取消两段式生命周期与「仅面向自动化」定位，到客户端侧的统一适配层方向辨析（多场景封装 vs 多后端适配）。

按时间：

- [2026-09-03-01-acp-admission-settlement-cancel.md](../2026-09-03-01-acp-admission-settlement-cancel.md) — 准入/结算/取消两段式生命周期（分界线 `messageQueued`）+「ACP 不是 UI，是仅面向自动化的协议传输层」定位翻转
- [2026-09-03-02-acp-client-adapter-directions.md](../2026-09-03-02-acp-client-adapter-directions.md) — 客户端统一适配层方向辨析：「统一」的两个正交方向（A 多场景封装 vs B 多后端适配）+ 仓库三处客户端写法已重复的事实
- [2026-09-03-03-acp-adapter-layer-architecture.md](../2026-09-03-03-acp-adapter-layer-architecture.md) — 方向 B 落定：背靠背架构（对后端 ACP client / 对前端 ACP server + TS SDK 双投影）+ 统一内核（最小公分母 + 能力协商）+ 转换矩阵清单 + 假后端先行验证的落地顺序
- [2026-09-03-04-acp-hub-design-finalized.md](../2026-09-03-04-acp-hub-design-finalized.md) — 设计 v1 定稿 + M0 启动：四决策（独立 repo acp-hub / 两面同步 / 仅 stdio / 命名）；「所有后端都说 ACP」使转换层收缩为能力协商降级器；SDK ActiveSession/in-process 直连两大发现

相关笔记（认知增量沉淀处）：

- [notes/modules/acp.zh.md](../../notes/modules/acp.zh.md) — ACP 认知单元（关键实体、准入/结算/取消机制）
- [guide/acp-minimal-client.zh.md](../../guide/acp-minimal-client.zh.md) — 最小客户端操作手册（已实测）
- [experiments/005-acp-minimal-client.zh.md](../../experiments/005-acp-minimal-client.zh.md) — 最小客户端跑通实验（含 DSH_HOME 沙箱绕过旧缓存）
