# system-prompt 学习笔记

状态：草稿 | 已对照验证（2026-08-22 对照 packages/core/system-prompt/README.zh.md、packages/core/system-prompt/src/index.ts、packages/core/tools/README.zh.md）

## 事实源（链接，不复述）

- [packages/core/system-prompt/README.zh.md](../../../packages/core/system-prompt/README.zh.md) — 系统提示词组装注册表的公开 API 与模型体验
- [packages/core/system-prompt/src/index.ts](../../../packages/core/system-prompt/src/index.ts) — `SystemPrompt` 服务、段注册、harness:identity 的构造
- [packages/core/tools/README.zh.md](../../../packages/core/tools/README.zh.md) — 工具的作用域组合（register/restrict/presentAs）

## 它是什么（用自己的话）

`system-prompt` 是 core 七包里的「系统提示词组装注册表」：插件贡献**有序段**（`section`）、**工具 schema**（`tools`）、**具名变量**（`variable`）三类输入，`agent-loop` 每个步骤调用 `assemble()` 合并全局层与 agent 层、`renderPrompt()` 插值渲染，产出最终模型提示词字符串。它是「系统提示词」这条运行时组装链的**机制本体**。

## 关键实体（逐个链接到 home）

- `SystemPrompt`（`ctx.systemPrompt`）：组装注册表服务，`section`/`context`/`tools`/`variable`/`assemble`。
- `PromptSection`（`{ name, order, text, complete? }`）：按 `order` 升序拼接的段；order 区间 `-100`=身份、`0`=persona、`100–199`=工具引导。
- `PromptAssembly`（`{ sections, tools, variables }`）：组装结果；工具 schema 属于组装结果的一部分。
- `renderPrompt(assembly)`：插值 `{{var}}`、删空段、空行连接 → 最终系统提示词字符串。
- `AssembleContext`：一次组装的用途（`scope`/`signal`/`agent`）。

## 我曾经的误解（原以为 → 实际是 → 修正来源）——本笔记的黄金内容

1. **原以为** 系统提示词是「一处写死的文本」；**实际是** 它是「有序段 + 工具 schema + 变量」在每步骤**动态组装**的产物，`assemble()` 合并层、`renderPrompt()` 插值，loop 每步重算一次。修正来源：README 第 5 行「循环在每个步骤组装一次」。

2. **原以为** 工具 schema 和系统提示词是「两路独立的输入」；**实际是** 工具 schema **属于组装结果的一部分**（`PromptAssembly.tools`），「模型获知自己能做什么」是一个连贯整体，只是 wire 层分开放（`EpochHeader.system` vs `EpochHeader.tools`）。修正来源：README 第 37 行。

3. **原以为** `harness:identity`（固定开场白）是 agent scope 里的东西；**实际是** 它是**全局固定段**——在 `SystemPrompt` 构造函数里用普通上下文注册，所有 agent 共享、独立于 loop 插件。修正来源：src/index.ts 第 356–363 行。

4. **原以为** agent 作用域对 persona 和 tools 的机制相同（都是「遮蔽」）；**实际是** persona 只有「遮蔽」，而 tools 有**三种**操作：`restrict`（allow/deny 过滤全局）、遮蔽（同名覆盖）、扩展注册（新增本地工具），且顺序是「先过滤全局 → 再遮蔽 → 再叠加本地」。修正来源：tools README 第 20–23 行。

5. **原以为** 「系统提示词」和「请求信封」是两回事；**实际是** 系统提示词就是 `EpochHeader.system`，是请求信封（config + system + tools）的一个字段，走 `request/header` → `foldRequestHeader()` 这套重建（不是 surface 那套）。修正来源：session.zh.md 第 160、168–177 行（见 [log.zh.md](../mechanisms/log.zh.md)）。

## 与相邻单元的关系（依赖谁 / 被谁依赖）

- **依赖**：`scope`（`ScopedLayers` 做段/变量的作用域分层）、`llm`（`ToolSchema` 类型）。
- **被谁依赖**：`agent-loop` 是主要消费方（每步 `assemble()` + `renderPrompt()`）；`tools` 注册表通过 `ctx.systemPrompt.tools()` 自动贡献 schema；`tool` 插件贡献工具引导段（`tool:bash` 等）。
- **与 session 的关系**：`renderPrompt()` 的产物写入 `request/header` 的 `EpochHeader.system`，是「两套重建机制」里第二套的输入。

## 设计红线

- **显式失败**：`renderPrompt` 对格式错误的 `{{…}}`、未知变量、无值引用都抛异常——「明确失败胜过交付格式错误的提示词」（README 第 38 行）。提示词模板是配置边界，fail loud。
- **工具作用域是可见性组合，不是权限边界**（tools README 第 22 行末尾）——再次印证 scope 笔记的「组织路由，非安全隔离」。

## 验证方式

- 运行时级：llm-inspector 实验（experiments/002）的 `options.system` 全文第一句就是 `You are an AI agent powered by DeepSeek Harness.`（`harness:identity`，order −100），后面跟 persona + 工具引导，可直接观察组装结果。
- 源码级：`harness:identity` 的构造见 src/index.ts 第 357–363 行；`section()` 的遮蔽语义见第 381 行起。

## 遗留问题（登记进 questions.zh.md）

- `complete: true` 段的语义（「组装后成为精确完整提示词，抑制其他所有段」）与 `system-prompt/assemble` waterfall 的交互细节——待读 `system-prompt.md` 生成区块时验证。
- `ToolRuntime.restrict()` 的 allow/deny 掩码「快照」语义（注册时创建快照 vs 实时）——待正式读 tools 包时验证。
