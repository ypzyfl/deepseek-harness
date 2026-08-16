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
| 0 | `session` | 日志头：版本 0、会话 id、cwd、委派深度 |
| 1 | `permission/preset` | 安全插件启动时把策略写进日志（danger-full-access） |
| 2 | `sandbox/mode` | 同上（danger-full-access） |
| 3 | `approval/policy` | 同上（never） |
| 4 | `agent/inbox/spliced` | 用户输入插入 inbox（inserted） |
| 5 | `turn/start` | 开启第 1 个 turn |
| 6 | `agent/inbox/spliced` | 从 inbox 认领走消息（removedCount:1） |
| 7 | `step/start` | 第 1 个 step |
| 8 | `user/message` | 用户输入正式落为会话事件 |
| 9 | `user/message` | system-prompt 插件写入运行时上下文快照（source.kind=plugin，role 仍是 user） |
| 10 | `session/title` | 兜底生成会话标题（messageSeqs:[7]） |

（注：上表 seq 是我按实际文件重排后的正确编号；对话中一度把 inbox 的"插入/移除"次序讲反，已在此纠正。）

## 我的理解修正（本轮最重要的收获）

原理解有四处偏差，修正后：

1. **seq 3 就是"用户输入"入史的第一个化身**，不存在"日志之外更早的输入时刻"。
2. **turn 不是"被输入触发"，是"输入唤醒 loop、loop 开 turn"**：`send` 塞 inbox → `wakeDriver` 唤醒 → `turn()` 开 turn → `preStep` 认领。loop 是"拉"模型，输入只是"敲门"。
3. **seq 7–8 是"记"（落日志），不是"组装 prompt"**：真正的 prompt 组装在 seq 10 的 `request/header`，那里才是装配结果。先 logged，再 model-visible，顺序不可颠倒。
4. 安全策略（seq 1–3）之所以写进日志，是为了"模型可见⟺logged"——模型需要知道当前能否改文件、是否要审批。

**两句要记住的话**：

1. 输入不触发 turn，turn 主动认领输入（loop 是"拉"模型）。
2. 消息先落日志（logged），组装 request 时再投影（model-visible）。先记后投影，顺序不可颠倒。

## 待办

- 第二段（seq 10–20：请求装配 + 第一次模型调用 + 工具调用）尚未精读。
- 第三段（seq 21–31：step 2 继续 + turn 结束）尚未精读。
- 实验三问（tool/result 的 role、step 2 为何存在、chunk 与 message 关系）尚未正式作答。
