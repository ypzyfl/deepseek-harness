# 实验 003：逐事件追踪 session.expected.jsonl（回合流）

- 日期：2026-08-22
- 状态：已完成
- 前置：阶段 3 第 2 步（七包已读）+ 回合流源码走通（`agent-loop/src/agent.ts`）
- 材料：[examples/headless-agent/tests/snapshots/headless-profile/session.expected.jsonl](../../../examples/headless-agent/tests/snapshots/headless-profile/session.expected.jsonl)（keyless 快照日志，33 行）
- 对应路线：阶段 3 第 3 步「逐事件追踪」动手任务；过关标准 ③

## 假设

对照回合流源码（`agent-loop/src/agent.ts`），一份会话日志应能逐事件复现「入队 → turn/start → step → turn/end」的完整序列；其中**持久会话事件**落日志（带 seq），**实时扩展点事件**不落日志（只能从源码推断其位置）；surface 事件在日志里带 `surfaceOp` 标记。

## 追踪框架

- `●` 持久会话事件（`session.append`，落日志、带 seq）
- `◆` 扩展点事件（waterfall/serial/emit，**不落日志**，故不出现于 jsonl）
- `○` 非事件元数据行（文件头）

## 逐事件追踪（按 seq 顺序）

### 文件头与生命周期

| seq | type | 属性 | 说明 |
|---|---|---|---|
| — | `session` | ○ 文件头 | 版本 `0`、id、cwd、delegationDepth，非事件 |

### 会话级状态（seq 0–2）

| seq | type | 属性 | 说明 |
|---|---|---|---|
| 0 | `permission/preset` | ● | 沙箱权限策略 `danger-full-access` |
| 1 | `sandbox/mode` | ● | 沙箱模式 |
| 2 | `approval/policy` | ● | 审批策略 `never` |

### 入队 + turn/start（seq 3–6）

| seq | type | 属性 | 说明 |
|---|---|---|---|
| 3 | `agent/inbox/spliced` | ● | `inserted`：用户消息入队 `next-turn`（对应 `send` → `inbox.splice`） |
| 4 | `turn/start` | ● | `turn:1` 开轮（源码 `turn()` 第 255 行） |
| 5 | `agent/inbox/spliced` | ● | `removedCount:1`：`preStep()` 的 `claim` 取走消息（第 229 行） |
| 6 | `step/start` | ● | `turn:1 step:1`（第 279 行） |

> **注意**：`agent/inbox/spliced` 名字带 `agent/`，但**是持久事件**（落日志、带 seq）。不能靠名字前缀判断持久性，要看它是否被 `session.append`。它是 inbox 状态投影的持久化。

### 用户消息 + runtime-context（seq 7–10）

| seq | type | 属性 | 说明 |
|---|---|---|---|
| 7 | `user/message` | ● + **surface** | 用户消息，`surfaceOp:"append"` |
| 8 | `user/message` | ● + **surface** | runtime-context 快照（`source.kind: plugin`）——**`inject` 注入的上下文**，也进 surface |
| 9 | `session/title` | ● | 会话标题（`messageSeqs:[7]`） |
| 10 | `request/header` | ● | `EpochHeader`：`config`+`adapterDefaults`+`system`+`tools`，`reason:"initial"`（`buildRequest` 第 485 行） |

### 标题 LLM 请求（seq 11–12）

| seq | type | 属性 | 说明 |
|---|---|---|---|
| 11 | `request/context` | ● | 路由元数据（provider/model） |
| 12 | `session/title-llm-request` | ● | 标题生成的**独立** LLM 请求（`maxTokens:64`），与主对话不同 |

### 主模型调用 step 1（seq 13–18）

| seq | type | 属性 | 说明 |
|---|---|---|---|
| 13–17 | `assistant/chunk` ×5 | ●（**非 surface**） | `block-start` → `tool-call-delta` → `block-end` → `usage` → `finish(tool-calls)` |
| 18 | `assistant/message` | ● + **surface** | **聚合**：`sourceEventSeqs:[13..17]` 引用 5 条 chunk；`surfaceOp:"append"` |

### 工具调用（seq 19–20）

| seq | type | 属性 | 说明 |
|---|---|---|---|
| 19 | `tool/call` | ●（**非 surface**） | `callId:"cli-smoke-call"` |
| 20 | `tool/result` | ● + **surface** | `sourceEventSeqs:[19]`，`surfaceOp:"append"` |

### step 结束 + step 2（seq 21–23）

| seq | type | 属性 | 说明 |
|---|---|---|---|
| 21 | `step/end` | ● | step 1 结束 |
| 22 | `step/start` | ● | `turn:1 step:2`——工具调用后 loop 再问一次模型 |
| 23 | `request/header` | ● | `reason:"change"`：`reasoningEffort` 从 `high`→`off`，header 变化 |

### 主模型调用 step 2（seq 24–29）

| seq | type | 属性 | 说明 |
|---|---|---|---|
| 24–28 | `assistant/chunk` ×5 | ● | text 块：`block-start`→`text-delta`→`block-end`→`usage`→`finish(stop)` |
| 29 | `assistant/message` | ● + **surface** | 最终回复，`sourceEventSeqs:[24..28]` |

### turn 结束（seq 30–31）

| seq | type | 属性 | 说明 |
|---|---|---|---|
| 30 | `step/end` | ● | step 2 结束 |
| 31 | `turn/end` | ● | `reason:"completed"` |

## 观察（关键印证）

1. **`inject` 的产物进 surface**：seq 8 的 runtime-context 快照是 `inject` 注入的，它 `surfaceOp:"append"`——注入的上下文会进模型历史。
2. **chunk 与 message 分离**：seq 13–17 的 5 条 `assistant/chunk` 不进 surface（保回放），seq 18 的 `assistant/message` 进 surface（聚合 + `sourceEventSeqs` 引用 chunk seq）。
3. **`tool/call` 不进、`tool/result` 进**：工具调用本身不进 surface，工具结果进（产生 ToolResultMessage 给模型）。
4. **header 变化才重落**：seq 10 `reason:"initial"`、seq 23 `reason:"change"`——`request/header` 只在变化时重新 append。

## 结论

- **过关标准 ③ 已验证**：持久事件（`turn/start`、`step/*`、`user/message`、`assistant/*`、`tool/call`、`tool/result`）在日志里「看得到」（带 seq）；扩展点（`agent/pre-step`、`agent/request`、`llm/stream`、`tools/*`、`agent/turn-stopping`）在日志里「看不到」，只能从源码推断位置。
- **「持久 vs 扩展点」的区分准则**已提炼至 [notes/mechanisms/event-persistence.zh.md](../notes/mechanisms/event-persistence.zh.md)（位置 × 作用，不靠名字）。
- **`surfaceOp` 标记**已提炼至 [notes/mechanisms/log.zh.md](../notes/mechanisms/log.zh.md)（「日志里的 surface 标记」小节）。

## 文件改动清单

无（纯日志阅读实验，不改代码）。
