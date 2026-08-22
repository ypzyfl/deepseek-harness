# agent 学习笔记

状态：草稿 | 已对照验证（2026-08-22 对照 packages/core/agent/README.zh.md、docs/subsystems/core.zh.md、packages/core/agent-loop/src/agent.ts）

## 事实源（链接，不复述）

- [packages/core/agent/README.zh.md](../../../packages/core/agent/README.zh.md) — Agent 接口、注册表、发起方作用域、`agent/*` 事件词汇
- [docs/subsystems/core.zh.md](../../../docs/subsystems/core.zh.md) — `Agent` 接口的 `send`/`followup`/`steer`/`inject` 签名与 inbox 语义
- [packages/core/agent-loop/src/agent.ts](../../../packages/core/agent-loop/src/agent.ts) — `preStep()` 里 `inbox.claim()` 的消费方

## 它是什么（用自己的话）

`agent` 是 core 七包里的「接口层」：它定义 **`Agent` 接口 + `AgentRegistry`（`ctx.agents`）+ `AgentFactory` 接口 + `agent/*` 事件词汇**，但不实现具体的循环。所有插件（UI、钩子、编排器、subagent）都面向 `Agent` handle 编程，因此**循环可以替换**——这是「接口/实现分离」的根源。

## 关键实体（逐个链接到 home）

- `AgentRegistry`（`ctx.agents`）：跟踪实时 agent，`register`/`create`/`resume`/`get`/`list`/`roots`。
- `Agent`（handle）：`inbox`/`followup`/`steer`/`inject`/`cancel`/`whenIdle`/`session`/`status`/`ctx`。
- `AgentFactory`：`create`/`resume` 的抽象接口，由 `agent-loop` 实现、`setFactory` 注册。
- `AgentHandle = { agent, dispose() }`：**消费方能力**——持有 handle 才能 teardown，裸 `Agent` 只能看。
- `agent.ctx`：agent 的作用域上下文（`dsh-scope`，键 = 该 agent）。

## 核心重点：入队三兄弟（`followup` / `steer` / `inject`）

### 底层真相：`send()` 的两个维度 × 三个预设

三个方法不是三个独立 API，而是底层 `send(message, target, wakeup)` 的两个维度（`target` × `wakeup`）的三个预设组合（core.zh.md 第 59、118、179 行）：

| 方法 | target | wakeup | 本质 |
|---|---|---|---|
| `followup` | `next-turn` | ✅ 唤醒 | 新轮次 + 唤醒 |
| `steer` | `next-step` | ✅ 唤醒 | 中途引导 + 唤醒 |
| `inject` | `next-step` | ❌ 不唤醒 | 上下文 + 不唤醒 |

没有「`next-turn` + 不唤醒」这个预设（新 turn 必须靠唤醒来开）。

### 三个方法的区别、目的、作用

| 维度 | followup | steer | inject |
|---|---|---|---|
| 投递边界 | next-turn（新轮） | next-step（当前轮内） | next-step（当前轮内） |
| 唤醒驱动器 | ✅ | ✅ | ❌ |
| 开新 turn 吗 | 开新 turn | idle 才开，running 融进当前 | 不开（搭顺风车） |
| 目的 | 新对话轮次 | 中途引导改方向 | 注入上下文 |
| 类比 | 用户发新消息 | 中途插话「顺便看看 X」 | 后台塞背景材料 |

关键语义（core.zh.md 第 121–144 行）：

- **`followup`**：该消息成为「它自己那个 turn 的唯一普通消息」——`next-turn` 是「每轮领一条」的边界。
- **`steer`**：不结束当前 turn，在**当前轮次内部**插入「下一步该考虑什么」。`agent/turn-stopping` 里监听器反对关轮时，就调 `agent.steer()` 再续一步（core.zh.md 第 1011 行）。
- **`inject`**：纯上下文注入，不主动开启任何东西。可能赶不上「pre-step 已认领完批次」的请求（第 141 行），因为不唤醒、只能搭下一次唤醒的顺风车。

### inbox 读写闭环（生产者 → 队列 → 消费者）

- **生产者**：外部（用户/插件/UI）调 `followup`/`steer`/`inject`，往 `agent.inbox` 的两个队列（`nextTurn` + `nextStep`）加 `UserMessage`。
- **队列**：`inbox` 是「持久 `agent/inbox/spliced` 事件的投影」，两个队列。
- **消费者**：**`agent-loop` 的 `preStep()`** 调 `inbox.claim(target, turn)`（agent-loop/src/agent.ts 第 229 行）——这是**唯一**从 inbox 取消息的地方。

`claim()` 是**纯删除 splice**（取走而非复制），逐条发 `agent/inbox/claimed` 通知。完整闭环：

```
外部（用户 / 插件 / UI）
   │  followup / steer / inject（= send(message, target, wakeup)）
   ▼
agent.inbox（nextTurn + nextStep 两队列，持久化为 agent/inbox/spliced）
   │  claim(target, turn) —— 纯删除 splice（取走，非复制）
   ▼
agent-loop 的 preStep()（唯一消费方）
   │  claimed 消息
   ▼
agent/pre-step waterfall（reject / enter）
   │  enter
   ▼
进入 step（user/message 落日志）
```

## 我曾经的误解（原以为 → 实际是 → 修正来源）——本笔记的黄金内容

1. **原以为** `followup`/`steer`/`inject` 是三个独立 API；**实际是** 它们是底层 `send(message, target, wakeup)` 的**三个固定预设**（target × wakeup 两个维度）。修正来源：core.zh.md 第 59 行「`followup`、`steer` 与 `inject` 是固定预设的别名方法」。

2. **原以为** `steer` 和 `inject` 的区别只是「是否唤醒」；**实际是** 还有「投递边界」和「是否开新 turn」的差别——`steer` 唤醒且 idle 时开新 turn，`inject` 不唤醒且永远不开 turn。修正来源：core.zh.md 第 127–144 行。

3. **原以为** inbox 是「谁都能读的队列」；**实际是** 只有 `agent-loop` 的 `preStep()` 通过 `claim()` 消费它，且 `claim` 是「删除式领取」。修正来源：agent-loop/src/agent.ts 第 229 行。

## 与相邻单元的关系（依赖谁 / 被谁依赖）

- **依赖**：`scope`（`agent.ctx` 是作用域上下文）、`session`（inbox 投影为 `agent/inbox/spliced` 持久事件）。
- **被谁依赖**：`agent-loop`（实现 `AgentFactory`，通过 `setFactory` 注册）；UI/ACP 桥/subagent（面向 `Agent` handle 编程）。
- **与 agent-loop 的分工**：`agent` 定义接口 + 注册表 + 事件词汇（不依赖 loop）；`agent-loop` 实现工厂 + 引擎。这是「loop 可替换」的根源。

## 设计红线

- **`AgentHandle` 是消费方能力**：`create()/resume()` 返回带 `dispose()` 的 handle，`get()` 返回裸 `Agent`（只能看不能关）。谁持 handle，谁拥有 teardown 能力。
- **`reject` 不保留消息**：pre-step 的 `claim` 已把候选消息从 inbox 删掉，`reject` 不会让它们回到队列（core.zh.md 第 55 行、README 第 55 行）。

## 验证方式

- 源码级：`inbox.claim()` 消费方见 agent-loop/src/agent.ts 第 229 行；三兄弟签名见 core.zh.md 第 118–144 行。
- 运行时级：llm-inspector 实验里 `messages` 中的注入上下文（runtime-context 快照、AGENTS.md 指令）就是 `inject` 进来的。

## 遗留问题（登记进 questions.zh.md）

- `withInitiator`/发起方作用域（`AsyncLocalStorage`）的进程内身份传递机制——待读发起方作用域 Agent Note（2026-07-15）时验证。
