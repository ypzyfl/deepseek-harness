# seam 与可替换性 学习笔记

状态：草稿 | 已对照验证（2026-08-17 对照 docs/glossary.zh.md capability-seam 词条、learning-path.zh.md 阶段 4、agent-loop README 不变量节）

## 事实源（链接，不复述）

- [docs/glossary.zh.md](../../../docs/glossary.zh.md) — capability-seam 词条（seam 的严格定义）
- [learning-path.zh.md](../../learning-path.zh.md) — 阶段 4（能力缝）、阶段 1 架构总览（L1/L2 分层）
- [packages/core/agent-loop/README.zh.md](../../../packages/core/agent-loop/README.zh.md) — 不变量配套入口一节

## 它是什么（用自己的话）

seam 是「可替换能力」：Service Definition（声明接口）+ 一个或多个 Service Provider（实现）+ 一个或多个 Consumer（消费，通常是面向模型的工具）三角色合成的完整能力。它是五层架构里 L2「能力层」的组织单位；L1「核心脊柱（core 七包）」不是 seam，而是「定义协议 + 主干行为、不实现具体能力」的主干。

## 关键实体

- **seam 三角色**：`dsh-shell`（Def）/ `dsh-bash-local` + `dsh-bash-sandbox`（Provider）/ `dsh-tool-bash`（Consumer）。
- **Service Definition** 是 Cordis `Service`（抽象类或具体注册表），**绝不是 TypeScript `interface`**。
- **spine（core 七包）**：`scope`/`session`/`system-prompt`/`tools`/`agent`/`agent-default-model`/`agent-loop`。

## 为什么 seam 必须含 Consumer（而非只有 Def + Provider）

因为「替换」不是「换一个 Provider」，而是「换一整套『能力如何被使用』的体验」。Consumer 是能力「面向模型的脸」（工具描述、参数、返回格式），Provider 是「干活的手」。只换手不换脸，模型会看到「手和脸不匹配」的怪能力。把三角色绑成一个整体，强制「换就整套换」，保证「通告面」与「可执行面」一致。

## 可替换的四种机制

1. **完整 seam 一体换**：能力层（shell/fs/web/subagent…），Def+Provider+Consumer 整套换。
2. **接口/实现分离 + 注册表**：core 里的 `agent`（Def 角色）+ `agent-loop`（Provider 角色），靠 `setFactory` 换默认 loop。
3. **注册表 + 内容替换**：core 里的 `session`/`tools`/`system-prompt`，注册表不动，换「注册进去的内容」（换工具、换提示词段）。
4. **配置/patch 覆盖**：core 里的 `agent-default-model`，直接改配置（`--patch` 换模型）。

## 行为不匹配的两种安全哲学（本笔记最重要结论）

「接口匹配」≠「行为匹配」。两个 Provider 可实现完全相同的接口，但工作语义不同（本地 bash vs 远程沙箱）。

| | seam（能力层） | spine（core） |
|---|---|---|
| 防「行为不匹配」的方式 | **三位一体**：三角色绑成一个整体，结构上强制「换就整套换」 | **事件词汇 + 不变量断言**：把行为暴露成可观测、可断言的事件流 |
| 安全来源 | **结构保险**（绑定） | **观测保险**（断言） |

core 防行为不匹配的两层（接口之外）：

1. **事件词汇**（`agent/*` + 会话事件）：比接口更全面、更细致的「行为契约」。替换 loop 的人不止要实现接口，还必须按这套词汇正确发事件——其他插件（UI/hooks/持久化/断言器）全靠这些事件工作。
2. **不变量断言（invariant）**：运行时兜底。断言器**不信任 loop 自述**，而是拿「日志」这个独立事实源**独立重建**「模型应该看到什么」，再与 loop 实际发的请求比对。对不上即爆掉。这是「可重建性」的运行时验证，比普通 assert 强。

## 我曾经的误解（原以为 → 实际是 → 修正来源）

1. **原以为** seam 只需 Def + Provider，Consumer 可有可无；**实际是** Consumer 是「面向模型的脸」，必须与 Provider 同进退，否则「通告面」与「可执行面」脱节。修正来源：`agent-tool-presentation` README 的「通告面 vs 可调用面」+ shell 家族范例推演。
2. **原以为** core 七包不是 seam，所以「不可替换」或「替换无保障」；**实际是** core 用「接口/实现分离 + 注册表 + 配置」支持替换，且靠「事件词汇 + 不变量断言」保证行为匹配。修正来源：agent-loop README 不变量节 + 根 AGENTS.md「运行时不变量 assert 拥有的关系」。
3. **原以为** 接口（静态类型）能保证行为匹配；**实际是** 接口只保证「签名匹配」，行为匹配靠「事件词汇 + 不变量断言」。修正来源：本次对 bash-local vs e2b-bash「接口同、语义异」的推演。

## 验证方式

- `packages/shell` 三包对照：`dsh-shell`（Def）、`dsh-bash-local`/`dsh-bash-sandbox`（Provider）、`dsh-tool-bash`（Consumer）。
- `agent-loop` 的 invariant 配套入口：`@deepseek-ai/dsh-agent-loop/invariant`。

## 遗留问题（登记进 questions.zh.md）

- 不变量断言的具体实现代码（`invariant.ts`）尚未读，只知道「独立重建 + 比对」的行为，未看代码。
