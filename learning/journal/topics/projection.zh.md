# 主题：投影（日志派生状态）

一句话定位：从「日志三层模型」到「三套投影」再到「series 分段」——对 harness「从 append-only 日志派生状态」这条横切主线的历次理解（surface / request-header / sessionProjections 三套投影，以及 replaceGeneration 的触发链）。

按时间：

- [2026-08-22-01-stage3-log-event-flips.md](../2026-08-22-01-stage3-log-event-flips.md) — 日志三层模型（真源 / surface / deriveMessages）+ 两套重建投影（surface→deriveMessages、request-header→foldRequestHeader）+ 系统提示词「不进 surface 但进 request/header」的翻转
- [2026-09-01-01-session-projection-fold-vs-log-organization.md](../2026-09-01-01-session-projection-fold-vs-log-organization.md) — 第三套投影 sessionProjections：「折叠」≠「组织日志」（账本算余额；turn 边界是算出来的派生状态）
- [2026-09-01-02-request-header-series-not-batching.md](../2026-09-01-02-request-header-series-not-batching.md) — request/header 的 series：不是批处理，是「分段标记」（以存储换精确重建）

相关笔记（认知增量沉淀处）：

- [notes/mechanisms/log.zh.md](../../notes/mechanisms/log.zh.md) — 日志机制（三套投影 + series 语义 + replaceGeneration 触发链路）
- [notes/mechanisms/session-projection.zh.md](../../notes/mechanisms/session-projection.zh.md) — 会话投影机制（三角色、eager drive、turnBoundary 实例）
- [notes/mechanisms/event-persistence.zh.md](../../notes/mechanisms/event-persistence.zh.md) — 事件持久性（`surfaceOp` 标记的详细说明）
