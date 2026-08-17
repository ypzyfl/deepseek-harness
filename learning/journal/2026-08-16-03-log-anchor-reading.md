# 日志精读：概念澄清与第一段逐行精读

日期：2026-08-16

## 起因

实验 001 第 3 步"精读日志"，从"这个文件是会话日志吗、和我理解的 session log 对不上"的困惑开始。

## 概念澄清：这份文件是什么

`examples/headless-agent/tests/snapshots/headless-profile/session.expected.jsonl` **就是会话日志（session log）**，第一行 `{"type":"session","version":0,...}` 是明证。但它是一种特殊形态：

- **是"事件流"而非"对话文本"**：每行一个结构化事件（`turn/start`、`assistant/chunk`、`tool/call`…），是机器视角的完整投影，不是一问一答的聊天记录。
- **是"mock 生成的期望快照"而非"真实运行日志"**：provider/model 是 `cli-mock`；`{{sessionId}}` 等是占位符、`time:0` 是归零值，为了比对时结果确定。
- **不是"运行时落盘的那份"**：运行时由 `session-persistence-jsonl` 落盘到 `dshHomePath('sessions')`，格式相同但值是真实的。

一句话：它是 session log 的**测试快照版本**，不是**生产运行时版本**。

## 第一段逐行精读（seq 0–9）

| seq | 事件 | 在做什么 |
|---|---|---|
| （无 seq，日志头） | `session` | 日志头：版本 0、会话 id、cwd、委派深度 |
| 0 | `permission/preset` | 安全插件启动时把策略写进日志（danger-full-access） |
| 1 | `sandbox/mode` | 同上（danger-full-access） |
| 2 | `approval/policy` | 同上（never） |
| 3 | `agent/inbox/spliced` | 用户输入插入 inbox（inserted） |
| 4 | `turn/start` | 开启第 1 个 turn |
| 5 | `agent/inbox/spliced` | 从 inbox 认领走消息（removedCount:1） |
| 6 | `step/start` | 第 1 个 step |
| 7 | `user/message` | 用户输入正式落为会话事件 |
| 8 | `user/message` | system-prompt 插件写入运行时上下文快照（source.kind=plugin，role 仍是 user） |
| 9 | `session/title` | 兜底生成会话标题（messageSeqs:[7]） |

（注：seq 号以 json 里的 `"seq":N` 字段为准，恒有 seq = 行号 − 2——第 1 行日志头 `session` 不占 seq；对话中一度把 inbox 的"插入/移除"次序讲反，且首版把日志头误算进 seq、整体错位 +1，均已在此纠正。）

## 我的理解修正（本轮最重要的收获）

原理解有四处偏差，修正后：

1. **seq 3 就是"用户输入"入史的第一个化身**，不存在"日志之外更早的输入时刻"。
2. **turn 不是"被输入触发"，是"输入唤醒 loop、loop 开 turn"**：`send` 塞 inbox → `wakeDriver` 唤醒 → `turn()` 开 turn → `preStep` 认领。loop 是"拉"模型，输入只是"敲门"。
3. **seq 7–8 是"记"（落日志），不是"组装 prompt"**：真正的 prompt 组装在 seq 10 的 `request/header`，那里才是装配结果。先 logged，再 model-visible，顺序不可颠倒。
4. 安全策略（seq 1–3）之所以写进日志，是为了"模型可见⟺logged"——模型需要知道当前能否改文件、是否要审批。

**两句要记住的话**：

1. 输入不触发 turn，turn 主动认领输入（loop 是"拉"模型）。
2. 消息先落日志（logged），组装 request 时再投影（model-visible）。先记后投影，顺序不可颠倒。

## 第二段逐行精读（seq 10–20）

按三幕组织：请求装配 → 第一次模型调用 → 工具调用。

### 第一幕 · 投影（seq 10–12）

| seq | 事件 | 在做什么 |
|---|---|---|
| 10 | `request/header` | 主请求头：声明 provider/model/config + `system`/`tools`（占位符）；`reason:"initial"` 表示本轮第一次组装 |
| 11 | `request/context` | 区分「想用哪个 provider」vs「实际落在哪个 provider」 |
| 12 | `session/title-llm-request` | 并行的一次独立 LLM 请求：起标题，只投影 seq 7（用户消息） |

### 第二幕 · 模型吐话（seq 13–18）

| seq | 事件 | 在做什么 |
|---|---|---|
| 13 | `assistant/chunk` | `block-start`：一个 tool-call block 开场 |
| 14 | `assistant/chunk` | `tool-call-delta`：工具名 + 参数的增量 |
| 15 | `assistant/chunk` | `block-end`：完整参数的最终值 |
| 16 | `assistant/chunk` | `usage`：token 消耗报告 |
| 17 | `assistant/chunk` | `finish`：`reason.kind:"tool-calls"`（模型想调工具） |
| 18 | `assistant/message` | 把 13–17 聚合成完整消息，`sourceEventSeqs` 钉住原始碎片 |

### 第三幕 · 工具执行（seq 19–20）

| seq | 事件 | 在做什么 |
|---|---|---|
| 19 | `tool/call` | 工具 bash 真的被调（callId 贯穿「模型说要调 → 真的调」） |
| 20 | `tool/result` | 结果落日志；`role:"user"` 但 `source.kind:"tool"` |

## 我的理解修正（第二段收获）

1. **发送 = 投影，不需要专门 send 事件**：进模型的是「旧内容」（已 logged），出模型的是「新内容」（要新 logged），所以日志里「返回」密集、「发送」稀疏。
2. **投影不只是「挑内容」，还「重排顺序」**：日志顺序（seq 7 用户在前、seq 8 system 在后）= 事件发生先后；请求顺序（system 在前、历史在后）= 模型 API 排列惯例。两者靠投影衔接。
3. **流式 = 一个 block 拆成多个 chunk**：`block-start → delta → block-end` 是一个完整内容单元的诞生；chunk 保流式保真，message（seq 18）是聚合投影。
4. **`role:"user"` 的两种不同原因**：seq 8 是「来源通道」（走 user/message 记进来）；seq 20 是「去路约束」（工具结果要进模型 messages，而 messages 无 tool role，只能借 user）。二者殊途同归都叫 user，但一个管「怎么记」、一个管「往哪去」。

**一句要记住的话**：

> 日志的三板斧：`surfaceOp:"append"`（只增不改）、seq 号引用（指回不复制）、`sourceEventSeqs`（聚合体 → 原始碎片）。而 `role` 与 `source.kind` 分离——前者标记「去路身份」，后者标记「来源身份」，共同服务「模型可见⟺logged」。

## 实验三问作答（第 1、3 问）

- **第 1 问（tool/result 的 role 为何是 user）**：模型 API 的 messages 只有 `system`/`user`/`assistant` 三种 role，无 `tool`；工具结果要作为历史消息发给模型，只能借 `user` 身份。日志靠 `source.kind:"tool"` 保真实来源，`role:"user"` 标记去路形态，两者不冲突。
- **第 3 问（chunk 与 message 的关系）**：seq 13–17 是原始流（保流式保真），seq 18 是聚合投影（可读的完整消息）；`sourceEventSeqs:[13,14,15,16,17]` 用 seq 号把聚合体钉回原始碎片，保证可追溯。
- **第 2 问（seq 21 后为何还有 seq 22）**：step 1 的模型以 `finish.reason="tool-calls"` 结束，表示「我要调工具」；工具跑完、结果落日志（seq 20）后，这些结果必须作为历史消息喂回模型，所以 loop 开 step 2。step 2 的模型以 `finish.reason="stop"` 结束，不再要求动作，turn 随之结束。`tool-calls` 与 `stop` 的对比，就是 glossary 里 turn/step 继续条件的实物。

## 第三段逐行精读（seq 21–31）

| seq | 事件 | 在做什么 |
|---|---|---|
| 21 | `step/end` | step 1 结束 |
| 22 | `step/start` | step 2 开始（要给模型喂回工具结果） |
| 23 | `request/header` | 第二次请求，`reason:"change"`（messages 追加了 seq 18 + seq 20） |
| 24–26 | `assistant/chunk` | text block 三段（start → delta → end） |
| 27 | `assistant/chunk` | usage 报告 |
| 28 | `assistant/chunk` | `finish`，`reason.kind:"stop"` |
| 29 | `assistant/message` | 聚合的最终回答 |
| 30 | `step/end` | step 2 结束 |
| 31 | `turn/end` | turn 结束，`reason.kind:"completed"` |

## 我的理解修正（第三段收获）

1. **agent-loop 的继续条件 = 模型上一步是否要调工具**：`finish.reason = "tool-calls"` → 工具跑、结果落日志 → 必须再开 step 把结果喂回模型；`finish.reason = "stop"` → turn 结束。
2. **`initial` vs `change` 兑现**：step 1 的 request 是 `initial`（全新），step 2 的 request 是 `change`（messages 历史追加了 seq 18 + seq 20）。上一轮 logged 的内容，成为下一轮 model-visible 的输入——这就是 loop 的「喂回」。
3. **step 的结构对称**：step 1 = request(initial) → tool-calls → 工具跑 → tool/result → step/end；step 2 = request(change) → text/stop → step/end。一个 step = 一次「模型决定 + 可能的工具执行 + 结果落日志」的循环，一个 turn = 若干个 step，直到 `stop`。

## 运行时日志形态（第 5 步补充观察）

真实运行后，会话日志落盘到 `~/.dsh/sessions/session.jsonl.zstd`，是 zstd 压缩的运行时形态：

- **`session.expected.jsonl`（快照）** = 归一化 + 占位符化（`{{sessionId}}`/`{{cwd}}`/`{{system}}`）+ 归零值（`time:0`）+ 未压缩展开，用于逐字节比对。
- **`session.jsonl.zstd`（运行时）** = 真实值（真实 session id、真实 cwd、真实 system 内容、真实时间戳）+ zstd 压缩，由 `dsh-session-persistence-jsonl` 落盘。

同一份会话日志的两种物理呈现：内容结构一致、值不同（占位符 ↔ 真实值）。测试里 `readPersistedLog` 先解压 zstd（`scanZstdFrames`/`decompressZstdFrame`）再比对，正是把「压缩运行时形态」还原成「可读形态」去对齐快照。

## 待办

（清空——33 行日志精读完毕，三问全部作答。）
