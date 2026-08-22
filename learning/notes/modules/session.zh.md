# session 学习笔记

状态：草稿 | 已对照验证（2026-08-22 对照 packages/core/session/README.zh.md、packages/core/session/src/index.ts、packages/core/session/src/surface.ts、packages/core/agent-loop/src/agent.ts、packages/core/agent-loop/src/invariant.ts、packages/client/ui-trajectory/README.zh.md）

## 事实源（链接，不复述）

- [packages/core/session/README.zh.md](../../../packages/core/session/README.zh.md) — 事件溯源会话日志 + 内存存储的公开 API 与模型体验
- [packages/core/session/src/surface.ts](../../../packages/core/session/src/surface.ts) — surface 层（有序投影）与逐事件投影规则
- [packages/core/agent-loop/src/agent.ts](../../../packages/core/agent-loop/src/agent.ts) — `deriveMessages()` 的消费方（请求组装）
- [packages/core/agent-loop/src/invariant.ts](../../../packages/core/agent-loop/src/invariant.ts) — 「模型可见 ⟺ logged」运行时断言
- [packages/client/ui-trajectory/README.zh.md](../../../packages/client/ui-trajectory/README.zh.md) — Trajectory 视图的数据源

## 它是什么（用自己的话）

`session` 是 core 七包里的事件溯源核心：`Session` 是一份**仅追加（append-only）的会话事件日志**，是 agent 全部交互的唯一真源；在这份日志之上维护一个 **surface 层**（只筛出「会产生消息」的 3 类事件、存它们的 seq 序号），`deriveMessages()` 从 surface 投影出要发给 LLM 的消息历史。`SessionStore`（`ctx.sessions`）创建并持有这些 `Session` 实例，持久化由订阅 `session/event` 的插件负责，本包不实现持久化。

## 关键实体（逐个链接到 home）

- `Session`（普通类，非 Service）：仅追加日志 + surface 管理器 + 派生消息缓存。
- `SessionStore`（`ctx.sessions`）：创建/持有 `Session`，`create`/`fork`/`get`/`list`/`flush`。
- `SessionSurface` / `SurfaceManager`：surface 层，`nodes` 只存 3 类消息事件的 seq 序号。
- `deriveMessages()`：从 surface.nodes 取序号 → 去 log 取消息 → 返回 `Message[]`。
- `deriveEventMessage(event)`：单个事件的投影规则（surface.ts 第 83–114 行）。
- `SessionEventMap`：可声明合并扩展的事件词汇（三项前置检查 ③ 的落点）。

## 我曾经的误解（原以为 → 实际是 → 修正来源）——本笔记的黄金内容

1. **原以为** 原始日志和 surface 是两个分开的存储；**实际是** 它们是**同一个 `Session` 对象里的「数据」和「索引」**——`log: SessionEvent[]` 存全部事件，`SurfaceManager.nodes` 只存 3 类消息事件的 seq 序号，`deriveMessages()` 用序号去 log 取消息。修正来源：src/index.ts 第 425–433、726–747 行。

2. **原以为** surface 的「3 类消息事件」是凭经验归类；**实际是** 源码硬编码 `SURFACE_EVENT_TYPES = ['user/message', 'assistant/message', 'tool/result']`，其余（chunk/边界/用量）永不进 surface。修正来源：surface.ts 第 15–19 行。

3. **原以为** `deriveMessages()` 的目的是「过滤掉不该给 LLM 看的日志」；**实际是** 它是「**投影**」（形态变换：事件 → 消息），过滤只是副作用之一。它做三件事：筛出 3 类消息事件、从事件 envelope 解包 `message`、跳过空 content 的 assistant/message。修正来源：surface.ts 第 83–114 行 `deriveEventMessage` 的 switch。

4. **原以为** `deriveMessages()` 只是「供请求组装调用」；**实际是** 它**还是「可重建」断言的规范动作**——`invariant.ts` 独立再调一次，拿结果和实际 `options.messages` 比对，不等即 fail（`log-reconstruction desync`）。修正来源：invariant.ts 第 39–42 行。

5. **原以为** Trajectory 和 Chat 看的是同一份数据的不同渲染；**实际是** Trajectory 读**原始事件日志**（`session.events`，含 chunk/边界/用量/被打断记录），Chat 读 **surface 投影**（`deriveMessages()`），是两条独立路径。修正来源：ui-trajectory/README.zh.md 第 5 行「Trajectory 既不读取也不改变 Chat 会话快照」。

## 与相邻单元的关系（依赖谁 / 被谁依赖）

- **依赖**：`scope`（`scopeTarget`/`scopeOf` 做作用域化分发）、`llm`（`Message` 类型、`deepFreeze`）、`typert`（类型图查找）。
- **被谁依赖**：`agent-loop` 是主要消费方——`step()` 里 `this.session.deriveMessages()` 组装请求、`append()` 写 `assistant/chunk`；持久化后端订阅 `session/event` 写盘。
- **与 surface 的分工**：本包拥有 surface 投影、替换校验、`replaceGeneration`；compaction seam 拥有「何时压缩」的策略，只调本包的 `append` 追加替换事件。

## 验证方式

- 源码级：`deriveMessages()` 的「读 nodes → 去 log 取消息」闭环见 src/index.ts 第 726–747 行；invariant 比对见 invariant.ts 第 39–42 行。
- 运行时级：`llm-inspector` 实验（experiments/002）里 `options.messages` 就是 `deriveMessages()` 的输出，可直接观察。

## 遗留问题（登记进 questions.zh.md）

- `replace` 操作（compaction）的具体触发链：`surfaceOp: { op: 'replace', start, end }` 由谁构造、`assertToolResultRewrite` 的「只改 content」不变式如何被 compaction seam 调用——待读 compaction 包时验证。
