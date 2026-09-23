# ACP 客户端统一适配层：方向辨析

日期：2026-09-03

## 起因

最小客户端跑通（实验 005）之后，想更进一步：做一个「以 dsh 作为 ACP server 的 ACP 客户端统一适配层」，向 AI 征求建议。回答先暴露了一个此前没意识到的歧义：**「统一」有两个正交方向**，设计差异很大，必须先选边再动手。

## 关键辨析：「统一」统一什么？

- **方向 A（多场景统一，只面向 dsh server）**：把 spawn + 握手 + 会话管理 + 更新流收集 + 权限应答 + 取消封装成一个可复用客户端库，供脚本、测试、编排器等多种消费者使用。
- **方向 B（多后端统一，dsh 是后端之一）**：适配层面向任意 ACP server（dsh、Claude Code ACP、Gemini ACP…），上层只看到统一 Agent 接口。

两个方向共享「ACP 客户端」这个词，但 A 的难点是协议细节封装，B 的难点是跨 server 能力差异抹平——不是同一个抽象层的两个选项，而是两个不同的工程。

## 事实发现：仓库内客户端写法已重复三处

方向 A 的动机不是想象的，重复已经发生：

- [packages/subagent/subagent-acp/src/run.ts](../../packages/subagent/subagent-acp/src/run.ts) — 最完整客户端（含取消、权限应答、进程停稳退出）
- [packages/test-support/session-snapshot/src/launcher.ts](../../packages/test-support/session-snapshot/src/launcher.ts) — 测试专用启动器
- [apps/cli/tests/built-bin.e2e.ts](../../apps/cli/tests/built-bin.e2e.ts) — e2e 里的 spawn + mock LLM + 断言写法
- [scripts/try-acp.mjs](../scripts/try-acp.mjs) / [scripts/try-acp-repl.mjs](../scripts/try-acp-repl.mjs) — 自己的最小客户端

## 方向 A 的设计要点

1. **双通道抽象是核心**：`session/prompt` 只返回 `{stopReason}`，正文在 `session/update` 通知流——适配层要把「请求 + 通知流」组装成统一的 `AsyncIterable<Update> + Promise<PromptResult>`，这是所有消费者都在重复处理的部分。
2. **权限应答是策略点**：现有两处实现各写死了策略（`reject` / `cancelled`），应做成显式注入（mode: reject | allow-first | 回调），对应 server 端 one-shot allow/reject 语义。
3. **停稳退出不重写**：subagent-acp 的 `disposeEofGraceMs`/`disposeGraceMs` 递进终止（EOF 宽限 → SIGTERM → SIGKILL）已经做对，直接参考。
4. **约束进类型**：每会话一次 in-flight prompt、spawn cwd 与 `session/new` cwd 是两回事、两条取消路径（`session/cancel` 与 `$/cancel_request`）——不该留给每个消费者自己记。
5. **已踩过的坑要固化进库**：`DSH_HOME` 隔离（旧 session_projcache schema 漂移会卡死启动，见实验 005）、key 可来自根 `.env` 而非仅 shell 环境变量。

放置位置：进本仓库则按 capability seam 约定做独立包（Service Definition / Provider / Consumer 三角色）+ mock-LLM 单测 + Agent Note；个人工具则独立 npm 项目更简单（手册第 6.4 条已验证 `npm install @agentclientprotocol/sdk` 兜底路径）。

## 方向 B 的设计要点

1. **能力协商是核心**：dsh 的 `initialize` 广告 `session/list`/`resume`/`close`、`set_config_option`、图片 prompt——超出标准 ACP v1 最小面；适配层必须按 `initialize` 返回的 capabilities 做特性探测，不能假设任何 server 都有（如 Claude Code ACP 没有 resume/list 语义）。
2. **已有先例**：`dsh-subagent-acp` 本身就是「驱动任意 ACP agent」的客户端，但按「一次 spawn 一轮任务」模型设计（无会话复用、无中间消息上浮）；它的 Dev Note 列了三个未做方向（进程池 / 远程工作区 / continuable children）正是方向 B 会撞上的设计取舍。
3. **stopReason 映射已有蓝本**（`run.ts` 的 ACP stopReason → 共享词表映射）。

## 结论与倾向

价值密度 A > B：A 有三处现有代码可抽取；B 的多后端差异（尤其会话持久化语义）会让抽象层迅速变厚，等有了第二个真实后端需求再做。方向未最终定——取决于具体消费场景（接 webhook / 做 Web UI 后端 / 编排多 agent）。

## 遗留

- 方向选择（A/B）与消费场景未定 → 登记进 [questions.zh.md](../questions.zh.md)。
- 若做 A：下一步先 diff 三处客户端实现的异同，产出公共部分抽取清单。
