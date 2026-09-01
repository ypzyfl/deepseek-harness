# request/header 的 series：不是批处理，是「分段标记」——以存储换精确重建

日期：2026-09-01

## 起因

读 [log.zh.md](../notes/mechanisms/log.zh.md) 里补的「request/header 的 series 语义」小节时，对 `series` 这个词冒出一个猜测：它是不是为了提高效率（类似批处理，把多个请求打包处理）？这个猜测反了——series 是「分割」不是「合并」。

## 澄清：series 是「分段标记」，不是「批处理开关」

`model-message series` = 一段连续的模型消息（中间没被替换过）。`reason: 'series'`（或 `change` + `startsSeries: true`）在日志里打一个界标：「从这里开始是新的连续段」。它把一个会话切成若干连续段，而不是把多段合并成一批。

它填补的信息缺口（这才是它的存在理由）：**compaction 替换历史消息时，surface 变了，但 header（信封）没变**。

- compaction 把前几步的历史替换成摘要 → `surface.replaceGeneration` 递增（消息历史变了）。
- 但 `request/header` 里的 config/system/tools 还是老样子（信封没变）。

如果日志只记 header 快照，下游就**无法知道「消息历史在哪一刻被替换过」**——因为 header 是「信封」，与「消息历史」是两套正交的东西。`series` 标记补上的正是这个信息。

官方原文（session README）一句话定性：「supports partial-window rendering and exact reconstruction **at the cost of growth per message series**」——**以存储增长为代价**，换「局部窗口渲染 + 精确重建」。

## 关键认知

1. **series ≠ 批处理**：它是「分割/划界」，不是「合并/打包」。方向相反。
2. **以空间换正确性**：每个 message series 都要存一份完整 header 快照，series 越多日志越大；换来的是「每个消息序列都能独立精确重建 + 局部窗口渲染」。
3. **两个触发来源**：① surface replacement（compaction 隐式触发）；② 显式声明 `startsRequestSeries: true`（agent 的 `PreStepDecision` 声明「从这里开始新序列」）。
4. **同一 series 内继承**：同一序列里的后续 step、retry、普通 turn 都继承最新快照，不重复记。
5. **消费者是 UI**：`ui-chat` 的 `request-prompt.ts` 用 `reason !== 'change' || startsSeries === true` 决定提示词节点的显示/分段。

## 事实源

- [packages/core/session/src/types.ts](../../packages/core/session/src/types.ts) — `RequestHeaderReason` 的 JSDoc（四种 reason 的权威定义）
- [packages/core/session/README.zh.md](../../packages/core/session/README.zh.md) — 「请求 header」节（「以每个消息序列增加存储为代价，支持局部窗口渲染与精确重建」）
- [packages/core/agent-loop/src/agent.ts](../../packages/core/agent-loop/src/agent.ts) — `buildRequest` 里 `startsSeries` 的判定
- [packages/core/agent/src/runtime-types.ts](../../packages/core/agent/src/runtime-types.ts) — `startsRequestSeries` 的声明
- [packages/client/ui-chat/src/client/conversation-nodes/request-prompt.ts](../../packages/client/ui-chat/src/client/conversation-nodes/request-prompt.ts) — series 的 UI 消费方
- [.agents/notes/implemented/simplification/2026-07-12-simplify-session-log-representation.zh.md](../../.agents/notes/implemented/simplification/2026-07-12-simplify-session-log-representation.zh.md) — series 语义的设计决策

## 遗留

- `surface.replaceGeneration` 的调用方（compaction 何时、在哪触发 surface replace）仍未追到——它决定 series 的隐式触发，与 [journal 01](2026-09-01-01-session-projection-fold-vs-log-organization.md) 的遗留同源，留待下篇。
