# 阶段 4 开头：缝全景图的读法 + 「mode 三列」的两次认知翻转

日期：2026-08-22

## 起因

阶段 4（能力缝与 scope）第 1 步是读 [capability-seams.zh.md](../../docs/capability-seams.zh.md)（约 39 KB）。第一眼被篇幅吓住，不知从何读起。拆解后发现它其实只有两块：一张机器生成的 mermaid 图（人读不了）+ 一张约 60 行的服务目录表（正文）。真正要读的只有那张表的「角色 / 所属包 / 实现 / 直接消费方」几列。

## 读法（先看形状，再分类清点）

1. 只看表（428–488 行），跳过 mermaid（10–426 行，机器图）。
2. 只看「角色」列，把 60 个 `ctx.*` 键分 seam / core / bundle 三堆。
3. 精读 `ctx.shell` 一行对上学习路径样板缝，再挑 `ctx.fs` / `ctx.web` 交叉验证。
4. 其余 seam 行当索引，查具体能力时再回来看。

三堆清单与三角色表格的完整版沉淀在 [notes/architecture/capability-seam-catalog.zh.md](../notes/architecture/capability-seam-catalog.zh.md)，此处不复述。

## 两次认知翻转

### 翻转 1：`mode`/`implementations`/`consumers` 三列是「手工标注」，不是「依赖扫描」

- **原以为**：这张表是脚本从代码依赖关系里扫出来的，所以「实现」「直接消费方」是机器查证的事实。
- **实际是**：读 `scripts/gen-doc-graphs.ts` 发现，`SERVICE_ROLES` 是一个**手写的常量数组**，`mode`/`implementations`/`consumers` 是文档作者逐行填写的**架构标注**（文件顶部注释明说：可枚举事实来自源码，而这份图是「curated graph，解释 flow 与 ownership」）。所以表里的「空」不是「缺失」，而是「该字段对这个 mode / 这个服务本就不适用」或「使用方在字段表达的范畴之外」。
- **转折点**：追问「为什么 seam 三角色残缺但合法」「为什么 core 都没实现」时，去读生成脚本，发现整张表是手工维护的。

### 翻转 2：`bundle` 的判据不是「具体 vs 抽象」，而是「替换发生在哪一层」

- **原以为**：`agent-loop` 因为是「具体实现」所以标 `bundle`，`session`/`system-prompt` 是「抽象服务」所以标 `core`。
- **被打脸**：追问「`session`、`system-prompt` 不也是具体实现吗」——确实，它们都是具体包、具体实现，没有任何理由比 `agent-loop` 更抽象。「具体/抽象」这个我自己临时发明的类比站不住脚。
- **实际是**：`mode` 区分的是**「替换发生在哪一层」**这一条轴——
  - `core`：服务本体，替换发生在**内容层**（换注册进去的工具/提示词段/数据），服务本身固定。
  - `seam`：替换发生在**实现层**（换 Provider 后端），Def 固定。
  - `bundle`：替换发生在**接口层**（换 `agent` 接口的实现），`agent-loop` 自己是「那个被选中的实现」，所以它自己不再有下一层可换。
- **转折点**：被「session 也是具体实现吧」一问逼到，重新读 `agentLoop` 那行的 note 原文（"The one concrete loop plugin; extension packages depend on dsh-agent events and services, not on this package"），才把错误的「具体/抽象」类比换成「替换发生在哪一层」。

## 关键认知

1. **缝全景的粒度是「键」不是「包」**：28 个 seam `ctx.*` 键，每个 = 一套三角色。一个缝可以有多组 Provider/Consumer 家族（shell 缝的 bash 家族 + pwsh 家族共用 `ctx.shell`），只要共享同一个 Def。

2. **三角色是「角色模型」不是「三包配额」**：缺的角色要么是运行时/进程外注入（authorization 的 flow 由任意插件注册、userQuestions 的 Provider 由 UI 前端提供），要么是消费面在进程外（sessionTelemetry 输出离开进程、fileReferences 走 Remote 契约），要么是同一包兼任多角色（compaction 的 `compaction-basic` 同时是 Def/Provider/Consumer）。

3. **`scope` 不在缝全景表里**：因为表只收录「拥有服务声明、注册了 `ctx.*` 键」的包，而 `scope` 是零依赖函数库、不是 Service、无 ctx 键（阶段 3 过关标准 ② 已验证）。它以「`ctx.invariants` 的消费方」身份出现在表边缘。

4. **「core 七包」是三份文档三种切分之一**：目录位置（`packages/core/`）、阶段 3 依赖序、本表 `mode`（架构角色）三者对「core/spine 边界」各有依据——`agent-loop` 目录在 core、依赖序末位，但架构角色是 `bundle`；`llm/llm` 进 architecture 核心包表、不进依赖序；`agent-default-model` 反之。「core」这个词在不同语境下指代不同，不是谁错。

## 事实源

- [docs/capability-seams.zh.md](../../docs/capability-seams.zh.md) — 缝全景表（本次精读对象）
- [scripts/gen-doc-graphs.ts](../../scripts/gen-doc-graphs.ts) — `SERVICE_ROLES` 手写常量数组 + 顶部「curated graph」注释（翻转 1 的证据）
- [learning-path.zh.md](../../learning-path.zh.md) 阶段 4 — 样板缝与过关标准
- [plan/stage-4.zh.md](../plan/stage-4.zh.md) — 本阶段执行路线（第 1 步）

## 遗留 / 待验证

- 翻转 2 的「替换发生在哪一层」是一个新表述，尚未对照 glossary 的 capability-seam 词条原文二次确认；进入阶段 4 第 2 步（二读 glossary）时验证。
- 三堆清单里 core 堆的精确数量（30 vs 31）当时手数有出入，已用「core 无 implementations 列」这条规则自检；如需要精确数，以 notes 里的表格为准。
