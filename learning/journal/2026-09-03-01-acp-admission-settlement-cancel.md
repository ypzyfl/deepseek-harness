# ACP 准入/结算/取消：一次 prompt 的两段式生命周期

日期：2026-09-03

## 起因

阶段 7 专项深入 ACP（`packages/acp/acp`）。读完 `src/index.ts`、`src/session.ts` 后，卡在 README 与源码反复出现的「准入（admission）」「结算（settlement）」这对词上——它们读起来像 prompt 生命周期的两个阶段，但看不出分界在哪、各自做什么、为什么必须分开。追问两轮后才打通。

## 澄清：分界线是 `followup()` 这一行

**准入 = 入队前**，**结算 = 入队后**，分界线就是 `this.agent.followup(message)`：消息进入 inbox 之前是准入，进入之后是结算。

- **准入**（`prompt()` 里快照路由 → `followup()` 之前）：一次性的同步校验——快照此刻的 provider/model/reasoning 路由、两次校验 Agent 还是不是「我们拥有的那个对象」、把 ACP 内容块翻译成核心内容块（图片要解码/校验/落盘成附件引用）、构造 `UserMessage` 入队。任何一步失败，消息**根本没进 inbox**，loop 不会跑。它的本质是「拒绝发生在副作用之前」。
- **结算**（`settleAfterQuiescence()`）：入队后的事件驱动等待——先等 `admissionDone` → `agent.whenIdle()`（agent 空闲）→ `outputTail`（已提交更新全部发完），再按优先级裁决返回什么 `stopReason`：显式取消 → 输出失败 → agent 失败 → 关联 turn 结束。它是「被事件喂出来的」，不是主动轮询：`agent/inbox/claimed` 事件把 turn 号填进 inflight（并 pin 路由），`turn/end` 事件把结束原因填进 inflight。

两者靠 `InflightPrompt` 这个共享结构体传话：准入写 `messageQueued`，事件监听器写 `turn`/`endReason`，失败/取消路径写 `outputError`/`agentError`/`cancelRequested`，结算读这些字段裁决后 `resolve`/`reject` 那个一开始就建好的 `completion` promise。

## 关键认知

1. **ACP 不是 UI，是「仅面向自动化的协议传输层」**：它曾经是编辑器桥接层（把持久事件翻译成卡片/终端/diff/计划/标题），2026-07-23 的决策把它精简成只面向程序化客户端（subagent、测试运行器、脚本控制器），只发「已提交语义事实」，绝不发 DSH 私有呈现数据。三条承诺：只发标准语义更新 / 诚实报告能力与配置 / 停稳后才结算。
2. **取消也按同一条线分两段**（`cancelPrompt` 的 `if (messageQueued) agent.cancel()`）：准入阶段取消 = 只 abort 准入、不碰 agent（loop 里没工作），结算短路直接返回 `cancelled`；入队后取消 = 额外 `agent.cancel` 打断 loop，结算要先等 `whenIdle` + 排空更新再返回 `cancelled`。分界线始终是 `messageQueued` 一个字段。
3. **结算的 `cancelled` 只保留给显式取消**（`codec.ts`）：harness 侧 `aborted`（被 hook/别的 owner 打断）对 ACP 客户端只是「普通停稳」，映射为 `end_turn`；`interrupted` 才映射为 `cancelled`。客户端视角的「取消」与 harness 内部的「打断」是两个不同词汇。
4. **ACP 不依赖 agent-loop 实现**：inject 只有 `agents`/`llm`/`sessionPersistence`/`sessions` 四个服务，没有 `agent-loop`。它通过 `agent.followup`/`agent.cancel`/`agent.whenIdle` 三个接口触点驱动，靠三个事件（`session/event`、`agent/inbox/claimed`、`agent/error`）反向观察 loop 进展——是「loop 可替换」的又一实例。

## 事实源

- [packages/acp/acp/src/session.ts](../../packages/acp/acp/src/session.ts) — `prompt`（准入）/`settleAfterQuiescence`（结算）/`cancelPrompt`（取消）/`InflightPrompt`
- [packages/acp/acp/src/codec.ts](../../packages/acp/acp/src/codec.ts) — `turnEndToStopReason`（cancelled 只保留给显式取消）
- [packages/acp/acp/README.zh.md](../../packages/acp/acp/README.zh.md) — 协议约定 + 三条设计承诺
- [.agents/notes/implemented/simplification/2026-07-23-acp-automation-only-protocol.zh.md](../../.agents/notes/implemented/simplification/2026-07-23-acp-automation-only-protocol.zh.md) — 「ACP 不是 UI」的定位决策
- [.agents/notes/implemented/feature/2026-06-14-acp-multi-session.zh.md](../../.agents/notes/implemented/feature/2026-06-14-acp-multi-session.zh.md) — 多会话隔离与归属

## 遗留

- `session/resume` 如何从 `requestHeader()` 恢复模型路由（`selectionFor` 里 `adapterDefaults?.reasoningEffort` 的条件逻辑）未细读。
- `approval/request` waterfall 里权限请求发出前先 `drainUpdates()` 的语义未验证（推测是保证 tool_call 更新先于 requestPermission 到达客户端）。

详见 [notes/modules/acp.zh.md](../notes/modules/acp.zh.md) 遗留问题。
