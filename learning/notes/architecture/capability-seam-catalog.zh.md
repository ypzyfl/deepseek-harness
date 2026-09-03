# 能力缝目录（capability-seams）学习笔记

状态：草稿 | 已对照验证（2026-08-22 对照 docs/capability-seams.zh.md 服务目录表 + scripts/gen-doc-graphs.ts 的 `SERVICE_ROLES` 手写数组）｜已对照 0.1.2-alpha.4（2026-09-02 复核：ctx 键集合与 alpha.2 一致，仅 `ctx.sessionPersistence` 的 implementations 移除 `-sqlite`）

## 事实源（链接，不复述）

- [docs/capability-seams.zh.md](../../../docs/capability-seams.zh.md) — 服务目录表（本文据其「角色 / 所属包 / 实现 / 直接消费方」四列整理）
- [scripts/gen-doc-graphs.ts](../../../scripts/gen-doc-graphs.ts) — `SERVICE_ROLES` 手写常量数组，`mode: 'core' | 'seam' | 'bundle'` 是作者手工标注
- [docs/glossary.zh.md](../../../docs/glossary.zh.md) — capability-seam 词条（三角色的权威定义）

## 它是什么（用自己的话）

`capability-seams.zh.md` 不是一篇要通读的文章，而是一张「服务目录表」：60 个 `ctx.*` 键，每个一行，标注它的架构角色（`mode`）、所属包、可替换实现、直接消费方。它的价值在「查」不在「读」——想判断某能力是不是可替换缝，查它那一行的 `mode` 即可。

## 关键实体（逐个链接到 home）

- **三列标注是手工的，不是依赖扫描**：`mode`/`implementations`/`consumers` 是 `SERVICE_ROLES` 数组里作者逐行填的架构标注（gen-doc-graphs.ts 顶部注释「curated graph, explain flow and ownership」）。因此「空列」≠「缺失」，而是「该字段对这个 mode 本就不适用」或「使用方在字段范畴之外」。
- **`mode` 三值的真实判据：不是「具体/抽象」，而是「可替换性」这个单一维度**。`mode` 三个值区分的唯一实质，是这个服务在「可替换」这条轴上处于什么位置：

  | mode | 语义 | 判据 |
  |---|---|---|
  | `seam` | 可替换的能力缝 | 有多个可替换的 Provider 后端（`implementations` 列了 ≥1 个可换者） |
  | `core` | 主干服务 | 不需要可替换后端——它是「单一、固定的服务」，靠「注册进去的内容」变化，而非「换实现」 |
  | `bundle` | 组合产物 | 它就是那个被选定的「唯一具体实现」，且它的身份是「被装配进产品树的产物」，不是「供别人替换的服务」 |

  关键在于：`session`、`system-prompt`、`tools` 和 `agent-loop` **都「具体」，但它们的「具体」性质不同**：

  - `session`、`system-prompt`、`tools`：它们自己就是那个唯一的、固定的服务。它们不是「某个抽象接口的实现」，而是「服务本体」。它们的变化方式不是「换掉它」，而是「往它的注册表里塞不同的内容」（换工具、换提示词段、换会话后端数据）。这正是「可替换四机制」里的第 3 种——「注册表 + 内容替换」。
  - `agent-loop`：它是 `agent` 接口（`ctx.agents`）的「那个被选中的实现」。它的身份是「接口 → 实现」关系里的「实现那一端」。它标 `bundle` 不是因为「具体」，而是因为它在替换轴上的位置是「末端被选中者」，不是「中间可替换的服务」。

  对比把话说死：

  | | `session`（core） | `agent-loop`（bundle） |
  |---|---|---|
  | 它「具体」吗 | 是 | 是 |
  | 它实现某个接口吗 | 不，它就是 `ctx.sessions` 服务本体 | 是，它实现 `agent` 接口 |
  | 替换它的方式 | 换注册内容（后端数据） | 换 `agent` 接口的另一个实现（`setFactory`） |
  | 在替换轴上的位置 | 服务本体（不可整体替换，只能换内容） | 接口的实现（整体可被另一个实现替换） |
  | mode | `core` | `bundle` |

  所以真正的判据是：`agent-loop` 是「某接口的实现」，而 `session`/`system-prompt`/`tools` 是「服务本体」。`bundle` 这个 mode 标记的是「这是一个『接口的实现产物』，它被选中装配进产品树，但它的『可替换』发生在『接口层』——通过换接口的另一实现来完成，而不是换它自己」。

  **三值一句话定义（可直接复用）**：

  - `bundle` = 「接口的实现者」（被装配的产物，替换发生在接口层）。
  - `core` = 「服务本体」（不可整体替换，变化发生在注册内容层）。
  - `seam` = 「有多个可替换 Provider 后端的缝」。

  **一个更干净的表述（可直接复用）**：三者的差异，本质是「替换发生在哪一层」——

  - `core`：替换发生在**内容层**（换注册进去的工具/提示词段/数据），服务本身固定。
  - `seam`：替换发生在**实现层**（换 Provider 后端），Def 固定。
  - `bundle`：替换发生在**接口层**（换 `agent` 接口的实现），而 `agent-loop` 自己是那个「被选中的实现」，所以它自己不再有下一层可换。

## 按角色分三堆（60 个 ctx 键）

### seam 堆（28 个）—— 阶段 4 主角，每个 = 一套三角色

| ctx 键 | Def（所属包） | Provider（实现） | Consumer（直接消费方） |
|---|---|---|---|
| `ctx.attachments` | attachment | attachment-local | host-runtime, llm-pi-ai |
| `ctx.llm` | llm | llm-deepseek, llm-pi-ai, llm-replay | agent-loop, compaction-basic |
| `ctx.sessionPersistence` | session-persistence | session-persistence-jsonl（0.1.2-alpha.3 起唯一 first-party 实现，`-sqlite` 后端已移除；仓库外 provider 仍可实现同一 Def） | agent-loop, tool-bash, hooks-×2, session-query×2, message-feedback |
| `ctx.settings` | settings | settings-file | llm-deepseek, llm-pi-ai, apiproxy |
| `ctx.credentials` | credentials | credentials-local | llm-deepseek, llm-pi-ai, apiproxy |
| `ctx.authorization` | authorization | （空，flow 由任意插件运行时注册） | llm-pi-ai |
| `ctx.sessionTelemetry` | session-telemetry | session-telemetry-otel | （空，输出离开进程） |
| `ctx.storage` | storage | storage-json, storage-sqlite | storage-domain |
| `ctx.sessionQuery` | session-query | session-query-sqlite | session-reference, tool-session-query |
| `ctx.fileReferences` | file-reference | file-reference-local | （空，经 Remote 契约，消费方在浏览器侧） |
| `ctx.sessionTitle` | session-title | session-title-first-prompt-llm, -all-prompts-llm | （空，注册表驱动） |
| `ctx.userQuestions` | user-questions | （空，Provider 由 UI 前端运行时提供） | tool-ask-user |
| `ctx.skills` | skill | skill-badge, skill-filesystem | tool-skill |
| `ctx.subprocess` | subprocess | subprocess-local, subprocess-e2b | bash-local, bash-sandbox, terminal-bash, lsp-stdio, subagent-acp/codex/claude-code |
| `ctx.shell` | shell | bash-local, bash-sandbox, pwsh-local | tool-bash, tool-pwsh, hooks-claude-code, hooks-codex |
| `ctx.terminals` | terminal | terminal-bash | tool-terminal |
| `ctx.sandbox` | sandbox | sandbox-local | bash-sandbox, terminal-bash |
| `ctx.approval` | approval | acp | tools, tool-bash |
| `ctx.codeRuntime` | code-runtime | code-runtime-worker | tools |
| `ctx.fs` | fs | fs-local, fs-sandbox, fs-e2b | tool-fs |
| `ctx.compaction` | compaction | compaction-basic | compaction-basic（同一包兼三角色） |
| `ctx.subagents` | subagent | spawn/fork/acp/codex/claude-code/dsh-sdk（6 个） | tool-subagent, tool-subagent-control, tool-ralph |
| `ctx.jobs` | jobs | jobs-local | tool-bash, tool-terminal, tool-subagent, tool-jobs |
| `ctx.web` | web | web-search-exa/-perplexity/-deepseek, web-fetch-http | tool-web |
| `ctx.spillStore` | spill | spill-local | spill-policy |
| `ctx.directoryPicker` | directory-picker | directory-picker-native, -browse | apiproxy |
| `ctx.workflowEngine` | workflow | workflow-worker-thread | tool-workflow, tool-ralph |
| `ctx.lsp` | lsp | lsp-local | tool-lsp |

### core 堆（30 个）—— 主干服务，不是缝

判据：`implementations` 列全空（core 没有「可替换后端」这层，不是「没有代码实现」）。

`tokenMeter`、`toolResultPruner`、`sessions`、`invariants`、`typert`、`typertGateway`、`storageDomain`、`messageFeedback`、`workspaceRegistry`、`sessionReferenceResolver`、`systemPrompt`、`tools`、`planMode`、`agentPresets`、`commands`、`sessionProjections`、`sessionProjectionCache`、`agents`、`agentDefaultModel`、`goals`、`e2b`、`shellEnv`、`sandboxPolicy`、`permissionPresets`、`agentTeams`、`webServer`、`clientModules`、`apiProxy`、`dynamicCordisRunner`、`cordisInspect`

> 其中 spine 六包（`session`/`system-prompt`/`tools`/`agent`/`agent-default-model`）都落在 core 堆；spine 第七包 `scope` 不在表里（无 ctx 键，见「我曾经的误解」第 2 条）。

### bundle 堆（1 个）

| ctx 键 | 所属包 | 说明 |
|---|---|---|
| `ctx.agentLoop` | agent-loop | 唯一的具体循环插件（`agent` 接口的实现）；扩展包依赖 `dsh-agent` 的事件和服务，不依赖此包 |

## 与相邻单元的关系

- **与 spine（core 七包）**：spine 里 `session`/`system-prompt`/`tools`/`agent`/`agent-default-model` 是本表 core 堆；`agent-loop` 是本表 bundle 堆（架构角色），`scope` 不在本表。三份文档（目录位置 / 阶段 3 依赖序 / 本表 mode）对「core/spine 边界」各有依据，见「我曾经的误解」第 3 条。
- **与 seam 三角色定义（glossary）**：本表的「所属包 = Def、实现 = Provider、直接消费方 = Consumer」是 glossary capability-seam 词条三角色的目录化落点。
- **与 [seam-and-replaceability.zh.md](seam-and-replaceability.zh.md)**：那份笔记讲「seam 为什么含 Consumer、可替换四机制、行为匹配两哲学」，本文补「三角色的目录清点 + mode 三值判据」。

## 我曾经的误解（原以为 → 实际是 → 修正来源）

1. **原以为** 这张表是脚本从代码依赖扫出来的事实；**实际是** `mode`/`implementations`/`consumers` 是作者手工标注的架构叙事（curated graph）。修正来源：gen-doc-graphs.ts 的 `SERVICE_ROLES` 手写数组 + 顶部注释。
2. **原以为** 七包里 `scope` 也该在表里；**实际是** 表只收「拥有服务声明、注册了 ctx 键」的包，`scope` 是零依赖函数库、非 Service、无键，故不在（只以 `ctx.invariants` 消费方身份出现）。修正来源：阶段 3 已验证「scope 无 key」。
3. **原以为** `bundle` 的判据是「具体 vs 抽象」（agent-loop 具体故 bundle，session 抽象故 core）；**实际是** 判据是「可替换性」这个单一维度——`session` 是服务本体（不可整体替换，换内容）、`agent-loop` 是接口的实现（整体可被接口的另一实现替换）。修正来源：被「session 不也是具体实现吗」一问逼到，发现「具体/抽象」站不住脚，改为「替换发生在哪一层」。
4. **原以为** shell 缝就是「bash 三件套」；**实际是** shell 缝是「bash 家族 + pwsh 家族」共用 `ctx.shell` 一个键——一个缝可有多组 Provider/Consumer 家族，只要共享同一 Def。修正来源：本表 `ctx.shell` 行的 implementations 含 `pwsh-local`、consumers 含 `tool-pwsh`。

## 验证方式

- 三堆分类可直接对照 `docs/capability-seams.zh.md` 的表逐行核对。
- `mode` 语义可对照 `scripts/gen-doc-graphs.ts` 里 `SERVICE_ROLES` 数组与 `agentLoop` 条目 note 原文（"The one concrete loop plugin…"）。
- 「core 无 implementations 列」这条自检规则：core 堆所有行的 `implementations` 都是空（`[]` 或未填），seam 堆大多有。

## 遗留问题（登记进 questions.zh.md）

- 「替换发生在哪一层」这个 mode 判据是本次新表述，尚未对照 glossary capability-seam 词条原文二次确认；进入阶段 4 第 2 步（二读 glossary）时验证。
