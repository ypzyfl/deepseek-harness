# agent-loop 学习笔记

状态：草稿 | 已对照验证（2026-08-22 对照 packages/core/agent-loop/README.zh.md、packages/core/agent-loop/src/agent.ts、packages/core/agent/README.zh.md）

## 事实源（链接，不复述）

- [packages/core/agent-loop/README.zh.md](../../../packages/core/agent-loop/README.zh.md) — 唯一具体循环实现与驱动器
- [packages/core/agent/README.zh.md](../../../packages/core/agent/README.zh.md) — `Agent` 接口与 `AgentFactory`（被 loop 实现）

## 它是什么（用自己的话）

`agent-loop` 是 core 七包里「唯一包含具体循环逻辑」的包：它实现 `Agent` 接口（`AgentFactory`），驱动 session/turn/step 的生命周期——「调用模型、运行工具、重复」。它是 harness 设计哲学「循环极薄、一切外挂」的体现：循环本体只做这一件事，其余全是扩展点插件。

## 关键实体（逐个链接到 home）

- `AgentLoop`（`ctx.agentLoop`）：循环服务，`create()`（同步，不 run setup）+ 实现 `AgentFactory`。
- `ReactLoopAgent` / inbox / 运行控制：**包内部实现**，不导出（第 56 行「包根只导出插件/服务/配置约定，不提供 `./src/*` 逃逸路径」）。
- 注入的 5 个服务：`agents`、`sessions`、`llm`、`tools`、`systemPrompt`（第 30 行）。

## 核心重点一：全篇最硬的一句话（第 7 行）

> 「这是 harness 中**唯一包含具体循环逻辑的包**。其他所有内容要么是抽象服务，要么是针对扩展点的插件：**新行为应放入插件，而不是这里**。」

这是七包学习全部内容的一句话收束：**循环极薄，一切外挂**。`agent-loop` 只做「调用模型、运行工具、重复」，其余（钩子/压缩/沙箱/subagent/持久化/UI）全在扩展点插件里。

## 核心重点二：实现 `AgentFactory`，闭合「接口/实现分离」（第 21 行）

> 「`AgentLoop` 还实现 `AgentFactory` 约定，并通过 `ctx.agents.setFactory(this)` 注册自身。」

闭合了 agent 包的「接口/实现分离」：`agent` 定义 `AgentFactory`，`agent-loop` 实现并注册，消费方走 `ctx.agents.create()` 而不碰 `agent-loop`。**这就是「loop 可替换」的机制落点。**

## 核心重点三：「插件负责的内容」清单（第 74–83 行，实战地图）

循环之外的每件事归哪个插件：

| 关注点 | 挂在哪个扩展点 |
|---|---|
| 钩子与策略 | `agent/*` + `tools/pre-execute`→`execute`→`post-execute`→`result` |
| 压缩 compaction | `agent/pre-step`（观测压力）+ `agent/request-error`（溢出修复） |
| 模型请求恢复 | `dsh-llm-retry` 在 `agent/request-error` |
| 沙箱/权限/计划模式 | `tools/pre-execute`（拒绝/询问）+ `tools.guard()`（单调策略） |
| subagent | `ctx.subagents` 提供方（循环外部） |
| 持久化 | `session/event`（延后写）+ `session/flush`（屏障） |
| UI | `session/event`（流）+ `agent/*`（控制） |

这印证了 llm-inspector 插件做的事：挂在 `llm/stream` 扩展点上的「模型请求观测」，完全符合「新行为放插件，不放 loop」。

## 核心重点四：回合流源码走通（`agent.ts`）

回合流从「入队」到「turn 结束」的完整方法链，落在 `packages/core/agent-loop/src/agent.ts`（`ReactLoopAgent`）：

```
send(message, target, wakeup)  →  inbox.splice
   ↓ wakeup
wakeDriver → phase: idle → running → kick()
   ↓
turn() ──────────────────────────────────────────┐
  ● append turn/start                              │
  while true:                                      │
    preStep()                                       │
      ○ inbox.claim()（取走消息）                   │
      ○ systemPrompt.assemble()                     │
      ◆ waterfall agent/pre-step（reject / enter）  │
    if reject → turnEnds=blocked, break             │
    ● append step/start                             │
    ● append user/message（每条）                    │
    step()：                                        │
      renderPrompt → system                         │
      buildRequest()：                              │
        ◆ waterfall agent/request（改配置）          │
        ● append request/header（system/tools）     │
        ● append request/context（变化时）           │
      llm.stream(request)：                          │
        ● append assistant/chunk（逐 chunk）         │
      ● append assistant/message（sourceEventSeqs）  │
      tool-call? → executeToolCalls → 工具流水线     │
      ◆ waterfall agent/request-error（失败恢复）    │
    ● append step/end                               │
    if turnEnds && nextStep 空 → ◆ serial agent/turn-stopping → break
    否则 target='next-step' 继续下一步              │
  ● append turn/end（finally，必落）                 │
  ─────────────────────────────────────────────────┘
  inbox 还有 pending → 返回 true（再来一轮）；否则 false
```

图例：`●` = 持久会话事件（`session.append`，落日志）；`◆` = 实时扩展点（`dispatch.waterfall`/`serial`，不落日志）；`○` = 内部操作。

### 各方法职责与关键点

| 方法 | 职责 | 关键点 |
|---|---|---|
| `kick()`（第 210 行） | 驱动器入口，`while (await turn()) {}` | phase 收敛边界 |
| `turn()`（第 246 行） | 开一轮，while 循环跑多 step | `turn/start` 在循环前、`turn/end` 在 finally（**必成对**） |
| `preStep()`（第 225 行） | claim 输入、assemble 提示词、pre-step waterfall | `agent/pre-step` 是「请求推导前唯一串行链」 |
| `step()`（第 332 行） | 调模型 + 跑工具 | `assistant/chunk` 逐 chunk、`assistant/message` 带 `sourceEventSeqs` |
| `buildRequest()`（第 426 行） | 组装请求 + 落 request/header | **`EpochHeader.system` 的写入点**（canonicalHeader） |

### 三个精确点

1. **`turn/start` 与 `turn/end` 严格成对**：`turn/start` 在 while 循环前 append（第 255 行），`turn/end` 在 finally 块 append（第 319 行）——即使中间抛异常（catch 第 302–315 行），finally 也保证 `turn/end` 一定落。这是 session「turn/step 闭合」不变式在 loop 侧的保证。

2. **`max-tokens` 的 sticky 语义**（第 285–290 行）：一旦某步 hit max-tokens，后续步骤即使正常完成也不能把 turn 结果降级。

3. **`assistant/message` 带 `sourceEventSeqs: chunkSeqs`**（第 408 行）：引用它由哪些 `assistant/chunk` 组装而来——正是 session 笔记里 `sourceEventSeqs` 语义的落地。

### 持久事件 vs 扩展点（过关标准 ③ 的源码答案）

区分准则与完整回合流图见 [notes/mechanisms/event-persistence.zh.md](../mechanisms/event-persistence.zh.md)；此处只列本包回合流中实际 `append` 与 `dispatch` 的事件清单：

- **持久会话事件**（`session.append`）：`turn/start`、`step/start`、`user/message`、`assistant/chunk`、`assistant/message`、`request/header`、`request/context`、`step/end`、`turn/end`。
- **实时扩展点**（`dispatch.waterfall`/`serial`/`emit`，不落日志）：`agent/pre-step`、`agent/request`、`agent/request-error`、`agent/turn-stopping`、`agent/status`、`agent/inbox/*`。

## 我曾经的误解（原以为 → 实际是 → 修正来源）——本笔记的黄金内容

1. **原以为** `agent-loop` 是「核心代码最厚、逻辑最复杂」的包；**实际是** 它是「循环逻辑唯一所在地，但刻意极薄」——一切行为外挂，loop 只做「调模型、跑工具、重复」。修正来源：README 第 7 行。

2. **原以为** 配置创建的 agent 和编程创建的 agent 一样拥有 persona/setup；**实际是** 配置 agent **没有逐 agent persona 字段或 setup 钩子**，只用部署 persona；只有编程式 `create()`/`resume()` 支持带作用域 persona/工具组合。修正来源：README 第 133 行。

3. **原以为** `agent-loop` 的 `create()` 和 `ctx.agents.create()` 是同一件事；**实际是** `ctx.agentLoop.create()` 是同步、不 run setup、随 fiber dispose（配置驱动路径），`ctx.agents.create()` 是异步、run setup、返回 `AgentHandle`（编程路径）。修正来源：README 第 19、23 行。

## 与相邻单元的关系

- **依赖**：`agents`、`sessions`、`llm`、`tools`、`systemPrompt`（5 个接口服务，第 30 行）。
- **被谁依赖**：无人直接依赖它（扩展插件依赖 `agent` 接口，不依赖 `agent-loop`）——这是「loop 可替换」的关键。

## 设计红线

- **包内部实现不导出**（第 56 行）：`ReactLoopAgent`、inbox、运行控制是包私有，不提供 `./src/*` 逃逸路径；生命周期拥有方通过 `ctx.agents` 创建 agent，不点名构造驱动器内部。
- **插件失败结束当前轮次，不是结束循环**（第 70 行）：失败会进入 `agent/request-error`，可重试；middleware/工具失败直接关闭轮次，但循环继续。

## 验证方式

- 运行时级：llm-inspector 实验触发的是 `agent-loop` 的 `step()` 里的 `llm/stream` 调用。
- 源码级：`send()`/`followup`/`steer`/`inject` 的领取时机见 README 第 58 行；`AgentFactory` 实现见第 21 行。

## 遗留问题（登记进 questions.zh.md）

- 回合流（`kick`/`turn`/`preStep`/`step` 调用链）已走通（见「核心重点四」）；**循环状态机/竞态**（phase 流转、取消收敛窗口、wake latch、并发工具池）留待阶段 3 之后的专项（需先读 defensive-patterns）。
