# seam 与可替换性 学习笔记

状态：草稿 | 已对照验证（2026-08-17 对照 docs/glossary.zh.md capability-seam 词条、learning-path.zh.md 阶段 4、agent-loop README 不变量节；2026-08-22 对照 tools/system-prompt README 补「可替换四机制」的机制 3 操作路径与「改代码 = 写插件」视角）

## 事实源（链接，不复述）

- [docs/glossary.zh.md](../../../docs/glossary.zh.md) — capability-seam 词条（seam 的严格定义）
- [learning-path.zh.md](../../learning-path.zh.md) — 阶段 4（能力缝）、阶段 1 架构总览（L1/L2 分层）
- [packages/core/agent-loop/README.zh.md](../../../packages/core/agent-loop/README.zh.md) — 不变量配套入口一节
- [packages/core/tools/README.zh.md](../../../packages/core/tools/README.zh.md) — `ctx.tools.register()` 等公开 API（机制 3 操作路径）
- [packages/core/system-prompt/README.zh.md](../../../packages/core/system-prompt/README.zh.md) — `ctx.systemPrompt.section()` 等公开 API（机制 3 操作路径）

## 它是什么（用自己的话）

seam 是「可替换能力」：Service Definition（声明接口）+ 一个或多个 Service Provider（实现）+ 一个或多个 Consumer（消费，通常是面向模型的工具）三角色合成的完整能力。它是五层架构里 L2「能力层」的组织单位；L1「核心脊柱（core 七包）」不是 seam，而是「定义协议 + 主干行为、不实现具体能力」的主干。

## 关键实体

- **seam 三角色**：`dsh-shell`（Def）/ `dsh-bash-local` + `dsh-bash-sandbox`（Provider）/ `dsh-tool-bash`（Consumer）。
- **Service Definition** 是 Cordis `Service`（抽象类或具体注册表），**绝不是 TypeScript `interface`**。
- **spine（core 七包）**：`scope`/`session`/`system-prompt`/`tools`/`agent`/`agent-default-model`/`agent-loop`。

## 为什么 seam 必须含 Consumer（而非只有 Def + Provider）

因为「替换」不是「换一个 Provider」，而是「换一整套『能力如何被使用』的体验」。Consumer 是能力「面向模型的脸」（工具描述、参数、返回格式），Provider 是「干活的手」。只换手不换脸，模型会看到「手和脸不匹配」的怪能力。把三角色绑成一个整体，强制「换就整套换」，保证「通告面」与「可执行面」一致。

## 可替换的四种机制

四机制不是平级并列，而是按「替换单位从大到小」排的一条光谱——从「整套能力」到「一个配置值」。它们分别落在 seam / bundle / core / 配置四个架构位置上。

| # | 机制 | 替换粒度 | 典型例子 | 替换方式 | 替换手段 |
|---|---|---|---|---|---|
| 1 | 完整 seam 一体换 | 整个能力 | shell / fs / web / subagent | 换 Def+Provider+Consumer 整套 | 写插件 |
| 2 | 接口/实现分离 + 注册表 | 接口的实现 | `agent`（Def）+ `agent-loop`（Provider） | `setFactory` 换默认 loop | 写插件 |
| 3 | 注册表 + 内容替换 | 注册进去的内容 | `session` / `tools` / `system-prompt` | 换工具、换提示词段 | 写插件 |
| 4 | 配置/patch 覆盖 | 一个配置值 | `agent-default-model` | `--patch` 换模型 | 改配置 |

1. **完整 seam 一体换**：能力层（shell/fs/web/subagent…），Def+Provider+Consumer 整套换。替换单位是「缝」而非「缝里的某个角色」，因为三角色绑定（见「为什么 seam 必须含 Consumer」）。
2. **接口/实现分离 + 注册表**：core 里的 `agent`（Def 角色）+ `agent-loop`（Provider 角色），靠 `setFactory` 换默认 loop。这是「loop 可替换」的机制根源——扩展插件只依赖 `agent` 接口，从不依赖 `agent-loop`。
3. **注册表 + 内容替换**：core 里的 `session`/`tools`/`system-prompt`，注册表不动，换「注册进去的内容」（换工具、换提示词段）。详见下方「机制 3 的替换操作路径」。
4. **配置/patch 覆盖**：core 里的 `agent-default-model`，直接改配置（`--patch` 换模型）。粒度最小、成本最低。

### 机制 3 的替换操作路径：注册表不动，动的是「贡献内容的插件」

机制 3 的「换内容」不是「换掉注册表」，而是调用注册表暴露的**贡献 API**往里面「注册/撤销」内容。注册表服务本体（`ctx.tools` / `ctx.systemPrompt`）从头到尾是同一个。

**以 `tools` 为例**——换工具 = `ctx.tools.register()`：

```ts
ctx.tools.register(definition: ToolDefinition): () => void
```

- 作用：注册一个带类型、受信任的工具定义（`name` + `description` + `parameters` + `output.schema` + `execute`）。
- **返回值是 disposer**：`register()` 返回一个 `() => void`，调用它即撤销该工具；注册也随调用方 fiber 一并 dispose。
- 注册的「层」由调用上下文作用域决定：普通插件上下文 → 全局注册；`agent.ctx` → 只为该 agent 注册，并可**遮蔽同名全局工具**（shadowing，这是阶段 4 过关标准 ② 的 scope 内容）。

标准写法（tools README）：

```ts
ctx.tools.register(defineTool({
  name: 'read_file',
  description: 'Read a file from disk.',
  parameters: { path: { type: 'string', required: true } },
  output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
  async execute(args, exec) { return readFile(args.path, { encoding: 'utf8', signal: exec.signal }) },
}))
```

**以 `system-prompt` 为例**——换提示词段 = 多种贡献 API，各对应一类「内容」：

| API | 贡献的内容 | 说明 |
|---|---|---|
| `ctx.systemPrompt.section(section)` | 提示词**段**（`{ name, order, text, complete? }`） | 按 `order` 升序拼接；返回 disposer |
| `ctx.systemPrompt.context(context)` | 动态上下文 | 每次组装时求值提供方 |
| `ctx.systemPrompt.tools(provider)` | 工具 schema | 每次组装时求值 |
| `ctx.systemPrompt.variable(name, provider)` | 提示词变量（`{{name}}`） | 在段文本里引用 |

同样每个都返回 disposer，`agent.ctx` 调用则带作用域、可遮蔽全局同名段/变量。

**「替换内容」的三层**：① 注册新内容（调 `register()`/`section()` 等）；② 撤回旧内容（调 disposer，或让 fiber dispose 自动回收）；③ 遮蔽/限制（`agent.ctx` 注册同名项 shadowing，或用 `ctx.tools.restrict()` 掩码过滤全局工具，让某 agent 看到不同内容而全局注册表不动）。

**机制 2 与机制 3 的「注册表」是两个东西**，别混：

- 机制 2 的注册表是 `AgentRegistry`（`ctx.agents`）——登记「谁来充当 `agent` 接口的实现」，换它 = 换 `agent-loop`（换「实现」）。
- 机制 3 的注册表是 `ToolRuntime`（`ctx.tools`）/ `SystemPrompt`（`ctx.systemPrompt`）——收纳「注册进去的工具/段」，换它 = 换「内容」。

### 「改代码」的准确含义 = 「写一个自定义插件」（不是改既有包源码）

四机制里，机制 1/2/3 都「要写代码」，但**不是改动 `dsh-tools`/`dsh-agent-loop`/`dsh-shell` 等既有包的源码**，而是**写一个新插件**，通过 `ctx.effect()` / `ctx.on()` 向既有服务做可逆注册。三种「写插件」只是注册进去的东西粒度不同：

| 机制 | 「写插件」具体做什么 |
|---|---|
| 1 完整 seam 一体换 | 写一个插件，注册一整套新的 Def + Provider + Consumer |
| 2 接口/实现分离 | 写一个插件，登记一个新的 `agent` 接口实现 |
| 3 注册表 + 内容替换 | 写一个插件，调 `ctx.tools.register()` / `ctx.systemPrompt.section()` 注册新工具/新段 |

### 替换的两个维度：换什么对象 × 用什么手段

「替换」在四机制里跨越两个正交维度，合起来才完整：

| 维度 | 取值 | 对应机制 |
|---|---|---|
| **换什么对象** | 服务 / 实现 / 内容 / 配置值 | 1（服务=整套缝）2（实现）3（内容）4（配置值） |
| **用什么手段** | 写插件（程序式） / 改配置（声明式） | 1/2/3 写插件；4 改配置 |

手段维度的边界要精确：真正的「换内容」（加工具、删工具、换提示词段）靠写插件（机制 3）；「调已有内容的参数」（`tools.mode`、`persona`、`toolOrder`）靠改配置（机制 4），这是调参不是换内容。

「写插件」与「改配置」统一于「改变插件树组成」这一件事：Cordis 的「配置 = 插件树」，配置是「声明哪些插件在场、带什么参数」，写插件是「定义新插件」。所以机制 1/2/3（写插件）与机制 4（改配置）都是改变插件树，只是程序式 vs 声明式——这也是「一切皆插件、换 profile 即换能力集、spine 与缝的代码不动分毫」的完整含义。

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
