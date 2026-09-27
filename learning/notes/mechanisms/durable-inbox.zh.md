# durable inbox（agent 待处理输入的持久化队列）学习笔记

状态：草稿 | 已对照验证（2026-09-24 对照 packages/core/agent-loop/src/inbox.ts、src/assistant-stream.ts、packages/core/agent/src/types.ts、src/runtime-types.ts、packages/session/session-projection/src/index.ts、.agents/notes 的 claimed-pre-step-inbox-lifecycle 决策笔记）

## 事实源（链接，不复述）

- [packages/core/agent-loop/src/inbox.ts](../../../packages/core/agent-loop/src/inbox.ts) — `inboxProjectionDefinition`（投影）+ `ReactLoopInbox`（命令 facade）
- [packages/core/agent-loop/src/assistant-stream.ts](../../../packages/core/agent-loop/src/assistant-stream.ts) — `AssistantStreamAttempt`（流内嵌写入端）
- [packages/core/agent/src/types.ts](../../../packages/core/agent/src/types.ts) — `InboxTarget` / `InboxState` / `agent/inbox/spliced` 事件定义
- [packages/core/agent/src/runtime-types.ts](../../../packages/core/agent/src/runtime-types.ts) — `Inbox` 接口契约
- [packages/session/session-projection/src/index.ts](../../../packages/session/session-projection/src/index.ts) — `cellFor` 惰性折叠（恢复的机制落点）
- [决策笔记 claimed-pre-step-inbox-lifecycle](../../../.agents/notes/implemented/architecture/2026-07-31-claimed-pre-step-inbox-lifecycle.md) — claim 原子性 + durable 化动机

## 它是什么（用自己的话）

Inbox 是 agent 的「待处理输入队列」（两个有序列表 `next-turn` / `next-step`），从内存队列改造成了**事件溯源机制**：每一次变更落成一个 durable 事件 `agent/inbox/spliced`，由投影重放这些事件重建当前队列——崩溃/重启后 pending 输入不丢。它是 `sessionProjections` 这套「第三套投影」首次承载**有持久语义的输入状态**的实例（不再只是派生 UI 状态）。

## 关键实体（三件套）

| 部件 | 是什么 | 关键点 |
|---|---|---|
| `agent/inbox/spliced` 事件 | 唯一真源，**一次规范化 splice** 的增量记录 | `{ target, start, removedCount?, inserted, outcome?: 'canceled' }`；普通删除带 `outcome:'canceled'`，claim 删除不带 |
| `inboxProjectionDefinition` | 投影单元（key `inbox`） | `apply` 用 `toSpliced` 重建列表；校验 splice 合法性 + 消息 id 跨两列表不重复；**带 wire 视图**（客户端可读） |
| `ReactLoopInbox` | 命令 facade（实现 `Inbox` 契约） | 所有操作走 `mutate()`：读投影 → 规范化 splice → `append` → 派发通知 |
| `InboxState` | `{ 'next-turn': UserMessage[], 'next-step': UserMessage[] }` | `next-turn` = 一条消息一个独立 turn；`next-step` = 当前 turn 内的下一个 step |
| 三个 live 事件 | `agent/inbox/inserted` / `claimed` / `discarded` | 跟随单条消息的观察者用；**不带 placement/outcome**（durable splice 已拥有这些事实） |

## 机制

### 1. `mutate()` 的核心循环（所有命令的统一入口）

```
读投影当前值 current()          → projections.stateOf(session, 'inbox')
  → 规范化 splice（truncate start/deleteCount、负索引、clamp 越界）
  → 校验消息 id 跨两列表不重复
  → session.append('agent/inbox/spliced', splice)   ← 落盘（唯一真源）
  → 派发 live 通知（inserted / discarded）
```

**关键心智**：`current()` 读的是投影状态（唯一真源），内存里没有第二份 inbox 数据。「先读当前值 → 算规范化 splice → 落增量」——和 `log.zh.md` 的「索引指向数据，不是两份数据并存」同一原则。

### 2. 落盘是间接链路，不是直接写文件

`session.append` 只进内存日志；写文件是持久化后端的职责：

```
ReactLoopInbox.mutate()
  → session.append('agent/inbox/spliced', splice)   // 进内存日志 + 广播 session/event
  → 持久化后端（session-persistence-jsonl）订阅 session/event → 写 session.vN.jsonl
```

没挂持久化后端时，spliced 只在内存，崩溃就丢——「durable」只在有持久化后端时成立。

### 3. claim 的原子性（所有权转移）

每个 step 开始前，`preStep()` 先 `inbox.claim(target, turn)` **原子认领整批**（清空全部 `next-step`，若 target 是 `next-turn` 再取一条），记录**纯删除事件**（无 outcome），派发 `claimed`。随后单一 `agent/pre-step` 决策：`reject`（关一个平衡空 turn，不回填）或 `enter`（整批作为 `user/message` 进 step）。**消息一旦 claim 就离开队列，绝不隐式回填**——与 session format 的「旧世代永不回退」同源哲学：操作不可逆，状态靠事件重放精确重建。

### 4. 崩溃恢复闭环

```
写：mutate() → append(spliced) → 持久化后端 → session.vN.jsonl 文件
                                        ↑                        ↓
读：current() ← 投影惰性折叠重放 spliced ← seed 重建 Session ← handle.read（迁移链 v0→v4）← 同一个文件
```

resume 读文件（`handle.read` 内部走 session format 迁移链把旧格式迁到当前），把历史事件作为 seed 重建 Session；投影 cell 首次触碰时**惰性地从 `init` 折叠全量日志**（`session-projection` 的 `cellFor`），逐个 `apply` 每个 spliced 事件用 `toSpliced` 重建队列。**恢复靠重放增量，不靠读回快照**。

**什么会恢复、什么不会**：还在队列（未被 claim，只有 spliced 记录）的输入 ✅ 恢复；已被 claim（变成 session 历史里的 `user/message`）的不再回 inbox，转由 `interruptedTurnClosers` 补 turn 结束。

## 与 assistant-stream 的关系（v2 流内嵌写入端）

`AssistantStreamAttempt` 一个模型 attempt 双喂：`accumulator`（`AssistantStreamAccumulator`）累积紧凑流（最终成为 durable 事件的 `stream` 字段）+ `assembler`（`BlockAssembler`）组装消息块，同时发布瞬时帧 `start → chunk×N → end`。`settle(eventType, append)` 先执行 durable append 再发布 `committed` 终帧，失败则 `abandon()`——保证「模型可见 ⟺ logged」：瞬时帧的 `committed` 永远对应已落盘的 durable 事件。这正是 session format v2「`assistant/chunk` 内嵌进 `assistant/message`」在写入端的实现。

## 与相邻单元的关系（依赖谁 / 被谁依赖）

- **依赖**：`dsh-session-projection`（`ctx.sessionProjections` 驱动投影 + 惰性折叠）、`dsh-session`（`Session.append`）、`dsh-agent`（`Inbox` 契约 + `AgentEventDispatch`）。
- **被谁依赖**：`agent-loop` 的 `ReactLoopAgent`（构造 `ReactLoopInbox`，`preStep`/`send`/`followup`/`cancel` 使用）；`AgentLoop` 服务注册 `inboxProjectionDefinition`（服务生命周期，冷读可用）。
- **与 session-projection 的关系**：`inbox` 是第三套投影的第一个「有持久数据依赖」的实例（turnBoundary 是纯派生 host 状态，inbox 的投影值本身要跨进程存活）。

## 我曾经的误解（原以为 → 实际是 → 修正来源）

1. **原以为** inbox 是「内存队列」；**实际是** 它是「以 durable `agent/inbox/spliced` 事件为唯一真源、投影重建」的事件溯源机制——内存里没有独立队列，投影值才是 truth。修正来源：inbox.ts 的 `ReactLoopInbox.current()` → `stateOf`。
2. **原以为** `agent/inbox/spliced` 直接写 session 文件；**实际是** `session.append` 只进内存日志，写文件是持久化后端（订阅 `session/event`）的职责，一条间接链路。修正来源：inbox.ts 第 235 行 + session-persistence-jsonl。
3. **原以为** 崩溃恢复是「读回一个队列快照」；**实际是** 恢复靠**重放增量事件**——resume 读文件（顺带走 session format 迁移链）→ seed 重建 Session → 投影惰性折叠重放 spliced → 重建队列。修正来源：session-projection 的 `cellFor`/`buildCell` + agent-loop 的 `resumeWith`。

## 验证方式

- 源码级：`inbox.ts` 的 `mutate()`（读投影→append→派发）+ `inboxProjectionDefinition.apply`（toSpliced + 校验）；`session-projection` 的 `cellFor`（惰性 `buildCell` 折叠全量日志）。
- 决策笔记：`claimed-pre-step-inbox-lifecycle` 的 Verification 段（claim 原子性、durable 投影、恢复、非法坐标拒绝的测试覆盖）。

## 遗留问题（登记进 questions.zh.md）

- `interruptedTurnClosers`（崩溃修复的另一半：如何判定哪个 turn「被打断」、补哪些合成关闭事件）尚未精读。
- `wakeDriver` 的 wake-latch 机制（维护期/已中止驱动器如何暂存唤醒、收敛时重放）尚未深入，与 inbox `hasPending` 相关。
- `agent/pre-step` 的 reject/enter 决策里，插件如何在「改写整批消息」与「直接 mutate inbox」之间选择，仅 README 层面理解。
