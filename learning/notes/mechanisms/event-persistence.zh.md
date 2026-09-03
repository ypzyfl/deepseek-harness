# 事件持久性（event persistence）学习笔记

状态：草稿 | 已对照验证（2026-08-22 对照 experiments/003-turn-trace.zh.md、packages/core/agent-loop/src/agent.ts、packages/llm/llm/src/index.ts）｜已对照 0.1.2-alpha.4（2026-09-02：扩展点语义与持久/扩展判据无变化；agent.ts/llm index.ts 行号随 seq/log-offset 重构漂移，已刷新）

## 事实源（链接，不复述）

- [experiments/003-turn-trace.zh.md](../../experiments/003-turn-trace.zh.md) — 本笔记认知的**核心证据**：其中「逐事件追踪（按 seq 顺序）」一节，用一份 33 行真实日志逐条标注了每个事件的「持久/扩展点」属性，是本笔记「结论一/二/三」的**直接验证素材**。要验证某事件到底持久还是扩展，看那张表的对应 seq 行。
- [packages/core/agent-loop/src/agent.ts](../../../packages/core/agent-loop/src/agent.ts) — 回合流中扩展点的触发位置（结论二的源码依据）
- [packages/llm/llm/src/index.ts](../../../packages/llm/llm/src/index.ts) — `llm/stream` waterfall 定义

## 事件持久性是什么（用自己的话）

harness 的事件分两类，本质不同：**持久会话事件**是「已经发生的事实」的记录（落日志、带 seq、可回放重建），**实时扩展点**是「正在做的决定」的邀请（不落日志、只活在进程内、供同进程插件当场参与）。区分它们**不能靠看事件名字**，必须理解事件在回合流中的「位置」和「作用」。

## 核心证据：逐事件追踪表

本笔记的「结论一 / 二 / 三」都建立在一份**真实日志的逐事件追踪**之上——[experiments/003-turn-trace.zh.md](../../experiments/003-turn-trace.zh.md) 的「逐事件追踪（按 seq 顺序）」一节。

那份表用 33 行 keyless 快照日志（`session.expected.jsonl`），**逐条（按 seq）**标注了每个事件的：

- **type**（事件类型，如 `turn/start`、`assistant/chunk`、`tool/result`）
- **属性**（`●` 持久 / `◆` 扩展点 / `○` 元数据；以及是否带 `surfaceOp`）
- **说明**（它记录了什么、对应源码回合流的哪一步）

它是「持久 vs 扩展点」这个抽象判断的**直接落地证据**：任何一个具体事件到底持久还是扩展，不用背，去那张表里找它对应的 seq 行即可。下文三个结论，都是对这张表的提炼。

## 结论一：持久事件 vs 扩展点——靠「位置和作用」，不靠「名字」

**核心结论：光看事件名字无法准确判断，必须理解它在回合流中的「位置」和「作用」。**

### 为什么「看名字」一定会失效

1. **名字是约定，不是本质**。`agent/inbox/spliced` 名字带 `agent/`（像扩展点域），但它是**持久事件**（记录「inbox 发生了一次 splice」这个已发生的事实）。`agent/request` 名字像「记录一次请求」，但它是**扩展点**（邀请插件在发出前改配置）。

2. **同一个动作，可能同时需要「记录」和「决策」两个事件**。比如「请求」这件事：harness 既需要**持久记录**「这次请求用了什么 header」（`request/header`，持久），又需要**实时钩子**「让插件在发出前改配置」（`agent/request`，扩展点）。同一个「请求」，分裂成两个名字相近、本质相反的事件。

### 真正的判据：位置 × 作用

判断一个事件是持久还是扩展点，问自己两个问题：

1. **位置**：它发生在「事情完成之前」还是「事情完成之后」？
2. **作用**：它是「让人当场参与决策」，还是「把结果固化下来供未来追溯」？

- 出现在「**结果已产生**」之后、用于「**固化事实**」的 → **持久事件**（记进账本，供未来回放/重建/审计）。
- 出现在「**决策关口**」、用于「**让人当场插嘴**」的 → **扩展点**（活在当下，供同进程插件参与）。

### 用「位置」重新理解那对「名字陷阱」

`agent/request` 和 `tool/result` 名字很像（都像「记录某件事」），但位置完全不同：

```
（工具执行完毕，结果已产生）── tool/result（● 持久：固化结果）
（请求即将发出，尚未发出）── agent/request（◆ 扩展点：等人拍板）
```

- `tool/result` 诞生时，工具**已经执行完**了 → 记录结果 → 持久。
- `agent/request` 诞生时，请求**还没发出**（正被各插件改配置）→ 邀请决策 → 扩展点。

### 一个「删掉看后果」的检验（最本质）

- 删掉 `tool/result`：模型永远不知道工具返回了什么 → **历史断层**，无法重建上下文 → 必须持久。
- 删掉 `agent/request` 扩展点：请求照样发（只是没人能在发之前改配置）→ **过程少个「插嘴点」**，历史没断 → 只是实时钩子。

**持久事件删了会「丢历史」；扩展点删了只是「少个钩子」。**

### 放进回合流，位置自明

一旦把回合流装进脑子，每个事件的位置和作用就自动清楚，无需背「谁持久谁扩展」：

```
（入队） send → inbox.splice
（claim） preStep(): inbox.claim
              ◆ agent/pre-step        ← 决策关口：这一步进不进？
              ● step/start            ← 事实：步骤开始
              ● user/message          ← 事实：输入已定
（组装） systemPrompt.assemble / renderPrompt
              ◆ agent/request         ← 决策关口：请求怎么配？
              ● request/header        ← 事实：信封已定（system/tools/config）
              ◆ llm/stream            ← 决策关口：模型调用怎么流？
              ● assistant/chunk ×N    ← 事实：模型吐出的每段字
              ● assistant/message     ← 事实：聚合结果
（工具）   ◆ tools/pre-execute        ← 决策关口：工具能不能跑？
              ◆ tools/execute         ← 决策关口：怎么跑？
              ◆ tools/post-execute    ← 决策关口：结果怎么定？
              ● tool/call             ← 事实：调用已发出
              ● tool/result           ← 事实：结果已返回
              ● step/end              ← 事实：步骤结束
              ◆ agent/turn-stopping   ← 决策关口：这一轮停不停？
              ● turn/end              ← 事实：轮次结束
```

图例：`●` = 持久事件（固化事实）；`◆` = 扩展点（决策关口）。

**规律一目了然**：`●` 都出现在「某个动作已经发生」之后，记录的是「结果」；`◆` 都出现在「某个动作即将发生」之前，邀请的是「决定」。这正是「位置决定性质」——也解释了为什么阶段 3 的过关标准要求「**对照 Turn flow 图追事件**」，而不是「背事件清单」。

## 结论二：扩展点事件的「存在位置」从源码回合流推断

扩展点**不落日志**，所以不在 jsonl 里；它们的位置只能从源码回合流精确推断：

| 扩展点 | 源码位置 | 触发时机（相对持久事件） |
|---|---|---|
| `agent/pre-step` | `agent.ts` 第 243 行 `dispatch.waterfall` | seq 5（claim）后、seq 6（step/start）前 |
| `agent/request` | `agent.ts` 第 478 行 `dispatch.waterfall` | seq 10（request/header）前 |
| `llm/stream` | `llm/src/index.ts` 第 1059 行 `ctx.waterfall`，由 `agent.ts` 第 364 行 `llm.stream(request)` 触发 | seq 10（header）后、seq 13（chunk）前 |
| `tools/pre-execute`→`execute`→`post-execute` | tools 包内，agent-loop 经 `executeToolCalls`（`tool-calls.ts`）调用 `ctx.tools.execute()` | seq 19（tool/call）后、seq 20（tool/result）前 |
| `agent/request-error` | `agent.ts` 第 392 行 `dispatch.waterfall` | 模型请求失败时 |
| `agent/turn-stopping` | `agent.ts` 第 305 行 `dispatch.serial` | seq 30（step/end）后、seq 31（turn/end）前 |

## 结论三：surface 事件带 `surfaceOp` 标记

带 `surfaceOp:"append"` 的事件恰好是 5 条（见 experiments/003 的 33 行日志），**正好是 3 类消息事件**：

- seq 7 `user/message`（用户消息）
- seq 8 `user/message`（runtime-context，`inject` 产物）
- seq 18 `assistant/message`（step 1 聚合）
- seq 20 `tool/result`（工具结果）
- seq 29 `assistant/message`（step 2 最终回复）

一个不多一个不少，精确对应 `SURFACE_EVENT_TYPES = ['user/message', 'assistant/message', 'tool/result']`。

## 我曾经的误解（原以为 → 实际是 → 修正来源）——本笔记的黄金内容

1. **原以为** 判断持久 vs 扩展点看「是否被 `session.append` 落盘」（代码倒推）；**实际是** 那是「结果」不是「判据」，真正的判据是「位置 × 作用」（结果后固化 vs 关口决策）。修正来源：experiments/003 的讨论。

2. **原以为** 看「事件名字」能区分（名词=持久、动词=扩展点）；**实际是** 名字是约定不是本质，`agent/request` 和 `tool/result` 名字像但本质相反，`agent/inbox/spliced` 名字带 agent/ 但却是持久事件。修正来源：experiments/003 的讨论。

3. **原以为** 分类是「背出来的规则」；**实际是** 分类是「懂流程的自然结果」——位置决定性质，这正是过关标准 ③ 要求「对照 Turn flow 追事件」而非「背事件清单」的原因。

## 与相邻单元的关系

- **与 `log.zh.md`**：`log.zh.md` 讲「日志怎么组织/重建」（surface/投影），本笔记讲「哪些事件进日志、为什么」（持久 vs 扩展点）——本笔记是 log 的上游问题。
- **与 `agent-loop.zh.md`**：回合流源码（`agent.ts`）是「扩展点位置」的载体；本笔记是「事件性质」的横切准则。

## 验证方式

- [experiments/003-turn-trace.zh.md](../../experiments/003-turn-trace.zh.md) — 用 session.expected.jsonl 逐事件验证「持久事件带 seq、扩展点不落日志」。
