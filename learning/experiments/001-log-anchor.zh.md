# 实验 001：一条会话日志建立全局锚点

- 日期：2026-08-16
- 状态：已设计，待执行
- 前置：无 `DEEPSEEK_API_KEY` 也可完成（材料是 keyless 快照期望输出）
- 对应路线：阶段 0（learning-path"读者与前置"一节指向本实验）；同时是阶段 1 架构总览、阶段 3 回合流的实物预演

## 假设

"模型可见⟺logged"是本仓库的信条（[architecture.zh.md](../../docs/architecture.zh.md) 的 Session log 一节），因此一份完整会话日志是系统行为的完整投影：读懂一条完整 turn 的事件流，就能同时看到组合层、spine、工具管线、LLM 缝、提示词装配的实物运转——五层架构不再是一堆悬空名词。

## 材料

- 日志本体（33 行，mock 模型跑出的完整 turn）：[session.expected.jsonl](../../examples/headless-agent/tests/snapshots/headless-profile/session.expected.jsonl)
- 这份期望输出的比对者（阶段 6 深读）：[headless.snapshot.ts](../../examples/headless-agent/tests/headless.snapshot.ts)

## 操作（五步，约 3 小时）

1. **机器跑通**（约 30 min）：`pnpm install` → `pnpm run typecheck` → `pnpm run test`。目的不是过关检验，是确认手里有一台能跑的机器。
2. **组合层实物**（约 10 min）：`pnpm dsh --profile headless --dump-config`。该旗标 boot-free（不启动应用，只打印实际组合出的插件树），必须与 `--profile` 同用——它回答"谁在场"。
3. **精读日志**（约 60 min）：逐行读 33 行 jsonl，对照下方映射表；对不上的行不要跳过，那正是学习材料。
4. **三问建立因果链**（约 30 min）：见下；每问先写下自己的猜测，再对照权威文档核对。
5. **闭环**（约 20 min）：`pnpm run test:snapshot -- -t headless` 绿灯。此刻精读对象显形为 snapshot 层的期望输出——学习材料与测试策略在此接上。

## 映射表：learning-path 阶段 1"一条消息如何穿过五层" → 日志事件

| 架构六步 | 日志对应 |
|---|---|
| ① 入口收输入送 inbox | seq 3 `agent/inbox/spliced`（插入用户消息）；seq 5 同类型事件（认领后清空，`removedCount:1`） |
| ② session 记 `user/message` | seq 7（用户消息）；seq 8（system-prompt 插件写入的运行时上下文快照，`source.kind:"plugin"`）；seq 9 会话标题顺带可见 |
| ③ loop 认领、system-prompt 装配 | seq 4 `turn/start`；seq 6 `step/start`；seq 10 `request/header`——`system` 与 `tools` 字段就是装配结果，`reason:"initial"` |
| ④ `ctx.llm` 缝、流式响应 | seq 13–17 五个 `assistant/chunk`（block-start → tool-call-delta → block-end → usage → finish）；seq 18 聚合的 `assistant/message` |
| ⑤ 工具走管线、结果落日志、判断是否继续 | seq 19 `tool/call`（bash）→ seq 20 `tool/result` → seq 21 `step/end` → **seq 22 又一个 `step/start`** → seq 28 finish → seq 30 `step/end` → seq 31 `turn/end` |
| ⑥ L3 决定谁在场 | 不在日志里——由第 2 步 `--dump-config` 的组合树回答。日志记行为，组合树记行为者；这个"不在场"本身就是要点 |

## 三问（提示都在日志里；先自己猜，再核对）

1. seq 20 `tool/result` 内层 message 的 `role` 为什么是 `"user"`？线索：模型 API 的消息形态 + "模型可见⟺logged"信条；权威解释在 [architecture.zh.md](../../docs/architecture.zh.md)。
2. 为什么 seq 21 之后还有 seq 22？观察点：对比 seq 17 与 seq 28 两个 `finish` chunk 的 `reason`（`tool-calls` vs `stop`）——这就是 agent-loop 的继续条件，也是 [glossary.zh.md](../../docs/glossary.zh.md) turn/step 术语的实物。
3. seq 13–17 的 chunk 与 seq 18 的 message 是什么关系？观察点：`sourceEventSeqs:[13,14,15,16,17]` 保证了什么？线索：原始 chunk 保流式保真，message 是投影。

## 观察（执行后填写）

- 第 1 步（三条命令的实际结果）：
- 第 2 步（组合树里最意外的一行）：
- 第 3 步（映射表对不上的行）：
- 第 4 步（三问：猜测 → 核对结果）：
- 第 5 步（snapshot 是否绿灯）：

## 结论（执行后填写）

- 假设是否成立：
- 由此产生的笔记（notes/ 链接）与开放问题（questions.zh.md）：
