# seam 结构 学习笔记

状态：草稿 | 已对照验证（2026-08-23 对照 docs/subsystems/shell.zh.md、packages/shell/*/src/index.ts、docs/glossary.zh.md capability-seam 词条、packages/llm/llm/src/{types,index,content}.ts、packages/llm/llm-deepseek/src/adapter.ts）

## 事实源（链接，不复述）

- [docs/glossary.zh.md](../../../docs/glossary.zh.md) — `capability-seam` 词条（三角色严格定义）
- [docs/subsystems/shell.zh.md](../../../docs/subsystems/shell.zh.md) — shell 样板缝（本文以它为贯穿例子）
- [packages/shell/shell/src/index.ts](../../../packages/shell/shell/src/index.ts) — `ShellExecutor` 抽象类 + `super(ctx, 'shell')`
- [packages/shell/bash-sandbox/src/index.ts](../../../packages/shell/bash-sandbox/src/index.ts) — Provider 继承 Def、注册键
- [packages/shell/tool-bash/src/index.ts](../../../packages/shell/tool-bash/src/index.ts) — Consumer 的 `inject: ['shell']` 与 `ctx.shell` 消费
- [packages/llm/llm/src/types.ts](../../../packages/llm/llm/src/types.ts) — `LlmModelInfo.inputModalities` 声明
- [packages/llm/llm/src/index.ts](../../../packages/llm/llm/src/index.ts) — Def 透传声明 + 能力门控预检
- [packages/llm/llm/src/content.ts](../../../packages/llm/llm/src/content.ts) — `RequestImageOffloadPolicy` + `offloadRequestImages`
- [packages/llm/llm-deepseek/src/adapter.ts](../../../packages/llm/llm-deepseek/src/adapter.ts) — Provider 声明 `inputModalities`
- [learning/notes/architecture/seam-and-replaceability.zh.md](seam-and-replaceability.zh.md) — 「Consumer = 面向模型的脸」结论来源（本文与之形成「结构 vs 替换」对仗）
- [learning/notes/architecture/capability-seam-catalog.zh.md](capability-seam-catalog.zh.md) — 「有哪些缝」的目录清点（本文讲「一个缝长什么样」）

## 它是什么（用自己的话）

一个能力缝（seam）= Service Definition + 一个或多个 Service Provider + 一个或多个 Consumer 三角色合成的「完整可替换能力」。本文讲「缝的通用结构」——三角色怎么构成、怎么通过服务键对齐、数据怎么流、换 Provider 怎么体现——以 shell 缝（`ctx.shell`）为贯穿例子。

## 三角色 → 包名 + 职责（以 shell 缝为例）

| 角色 | 包名（shell 例） | 挂在哪 | 拥有的东西 | 一句话职责 |
|---|---|---|---|---|
| **Service Definition** | `dsh-shell` | `ctx.shell`（`ShellExecutor` 抽象类） | `resolve`/`run`/`start`/`sandboxMode` + `parseExitStatus` 退出状态约定 | 声明「这个能力」的契约 |
| **Service Provider** | `dsh-bash-local` / `dsh-bash-sandbox` | 实现 `ShellExecutor` 子类，注册为 `ctx.shell` | 命令默认值补全、超时/中止分类、终端环境、后台读取合并（+ 沙箱版填 `ShellSandboxInfo`） | 真正干活的手 |
| **Consumer** | `dsh-tool-bash` | `bash` schema（面向模型的工具） | 面向模型的渲染 + 把后台句柄适配到 `ctx.jobs` 通用任务运行时 | 面向模型的脸 |

## 三角色如何对齐：`inject` 声明 + `super(ctx, key)` 注册（通用机制）

三角色的对应关系**不在 `--dump-config` 里**（dump 只列「谁在场」，不画依赖箭头），而由两层机制表达，靠「服务键」这个中间层对齐：

1. **Consumer 通过 `inject` 声明消费哪个键**（静态、编译期）。`tool-bash/src/index.ts:31`：

   ```ts
   export const inject = ['tools', 'shell', 'systemPrompt', 'shellEnv']
   ```

   `inject` 数组里的字符串就是它消费的键名（`shell` → `ctx.shell`）。Consumer 只认「键」，不认「具体 Provider 是谁」。

2. **Provider 通过继承 Def 抽象类注册同一个键**（运行期、动态）。Def 抽象类构造器 `super(ctx, 'shell')` 注册 `ctx.shell`，Provider 子类被加载实例化时才真正挂上键。`bash-sandbox/src/index.ts:44` 的 `SandboxBashExecutor extends LocalBashExecutor`，最终继承到 `ShellExecutor` 构造器的 `super(ctx, 'shell')`。

3. **所以三元组这样拼起来**：

   ```
   Consumer (dsh-tool-bash) --inject 'shell'--> 键 ctx.shell --注册自--> Provider (dsh-bash-sandbox)
                                                         ↑
                                             继承自 Def 抽象类 (dsh-shell)
   ```

关键洞察：Consumer 和 Provider **互相不认识对方的具体包名**。Consumer 只认键，Provider 只认「继承 Def 并注册键」。是「键」这个中间层把两者对齐——这正是「换 Provider 而 Consumer 无感」的结构根源：Consumer 从未依赖过任何具体 Provider。

`--dump-config` 能给的线索（配合源码可拼三元组）：

| dump-config 里的线索 | 能推出什么 |
|---|---|
| 某个 `tool-bash` 条目在（Consumer） | 它 `inject: ['shell']`，消费 `ctx.shell` |
| 某个 `bash-sandbox` 条目在（Provider） | 它继承 `ShellExecutor` 注册 `ctx.shell` |
| **`dsh-shell` 没有独立条目** | Def 是抽象类，键由 Provider 子类挂上 |
| 只有 `bash-sandbox` 没有 `bash-local` | 当前组合选了「沙箱」这个 Provider |

## 数据流：request → spec → run/start → result/process（以 shell 缝为例）

| 阶段 | 数据契约 | 字段特点 | 谁调用 |
|---|---|---|---|
| 1. 请求 | `ShellExecRequest` | `command` 必填，`workdir`/`timeoutMs`/`stdoutMaxBytes` 等**可选** | 模型工具 / 进程内插件 |
| 2. 规格 | `ShellExecSpec` | 同上字段**全必填**（已补全默认值、已 cap） | `ctx.shell.resolve(request)` 产出，交给 `run`/`start` |
| 3. 前台结果 | `ShellRunResult` | `exitCode`/`signal`/`timedOut`/`aborted` 各自独立 | `run()` 返回 |
| 4. 后台句柄 | `ShellProcess` + `ShellProcessRead` | `readOutput()` 增量读、`kill()`、`done` | `start()` 返回 |

## 「换 Provider 整个产品跟着变」的体现（以 shell 缝为例）

| | `dsh-bash-local`（本地） | `dsh-bash-sandbox`（沙箱） |
|---|---|---|
| `ShellRunResult.sandbox` | 缺省（`absent`） | 填 `ShellSandboxInfo`（`mode`/`denied`/`enforcement`/`runnerFailed`） |
| 可执行面（Provider 侧） | 本地进程组执行 | 沙箱 runner 执行，受限模式缺后端抛 `SANDBOX_UNAVAILABLE` |
| 通告面（Consumer 侧） | **不变**——`bash` 工具 schema 一样 | **不变**——模型调用方式一样 |
| 模型感知 | 结果无 sandbox facts | 结果多一类 sandbox facts |

关键结论：换 Provider 时，Def 契约不变、Consumer 脸不变，所以**模型调用 bash 的方式完全一样**，只是结果里「多了一类事实字段」。这正说明「三角色绑定」的价值——Provider 可换，但通告面（Consumer）与可执行面（Provider）由 Def 契约锁定，不会「手脸不匹配」。若语义要改动「模型怎么调用」，才需连 Consumer 一起换。

## 「Provider 能力面扩展」如何不改 Def 结构（以 LLM 缝图片模态为例）

「Provider 可替换性」不只覆盖「换一个 Provider」，还覆盖「同一个 Provider 的能力面随时间扩展」。LLM 缝 rc.8 新增图片（image）维度，是这类扩展的对照素材：能力面扩展时，**Def 的结构骨架（键、方法、生命周期）一行不动**，扩的是「声明字段」和「通用门控的输入」。

LLM 缝三角色：Def = `dsh-llm`（`ctx.llm`）、Provider = `dsh-llm-deepseek`/`dsh-llm-pi-ai`/`dsh-llm-replay`、Consumer = `agent-loop`/`compaction-basic` 等。

### 1. Provider 声明：`inputModalities: [text, image]`

Provider（adapter）自己声明「这个模型接受哪些输入模态」（`llm-deepseek/src/adapter.ts:54-55`）：

```ts
/** Accepted request modalities; omission is text-only. */
inputModalities?: ModelModality[]
```

它是 `LlmModelInfo` 的可选字段（`llm/src/types.ts:242-243`）：

```ts
/** Accepted request modalities; absent means unknown, while an explicit omission is negative capability. */
inputModalities?: readonly ModelModality[]
```

注释的分量：「explicit omission is negative capability」——显式省略 = 负能力（明确不支持），这直接决定后面的门控分支。

### 2. Def 只是「透传」声明，不改变自己的结构

Def 层把 Provider 声明的 `inputModalities` 原样 detach（浅拷贝）后透传（`llm/src/index.ts:626`），`detachedModalities` 只是 `[...modalities]`（`index.ts:598-600`）。Def 没有为「图片」新增任何方法、键、生命周期——只在自己的 `LlmModelInfo` 类型里加了一个 `inputModalities?` 可选字段，然后透传。

### 3. 「能力门控」是 Def 里的通用逻辑，不是新结构

真正「用」这个声明的地方（`llm/src/index.ts:930-936`）：

```ts
const projectedOptions = modelInfo.inputModalities !== undefined
  && !modelInfo.inputModalities.includes('image')
  && resolvedOptions.messages.some(message => contentHasImage(message.content))
  ? { ...resolvedOptions, messages: projectImagesForTextModel(...) }
  : resolvedOptions
```

Def 的通用预检：如果模型「明确不支持 image」但消息里带了图，就把图替换成确定性的文本占位符（`projectImagesForTextModel`）。这是「负能力」的落地——不支持的模型不会因收到图而炸，而是收到文本替代。

### 对照：换 Provider vs 能力面扩展（同一个原则的两面）

| 对照维度 | shell 缝（换 Provider） | LLM 缝（图片模态扩展） |
|---|---|---|
| 变的是什么 | Provider 换成沙箱版 | Provider 声明 `inputModalities: [text, image]` |
| Def 结构变了吗 | 没变（`ctx.shell` 键、`resolve/run/start` 都在） | 没变（`ctx.llm` 键、`prepare/dispatch` 都在） |
| Def 里「新增」的 | 无（`sandbox` 只是结果里多一类事实） | 类型里多一个 `inputModalities?` 可选字段 + 透传 |
| Consumer 脸变了吗 | 没变（bash 工具 schema 一样） | 没变（模型仍用同一套消息格式发请求） |
| 扩展落在哪一层 | Provider 的实现细节 | Provider 的「声明」+ Def 的「通用数据类型」 |

关键结论：图片模态扩展的本质是「在既有 Def 通用数据类型上加一个可选声明字段，Provider 用它声明能力，Def 用通用预检消费它」——而不是「给 Def 加一个专门处理图片的新方法/新服务」。深层原则：

> **Def 提供「通用载体」+「通用门控」，Provider 用「声明」注入差异化能力**。能力面扩展时，扩的是声明字段和通用门控的输入，不是 Def 的结构骨架。

### 配套机制：Files API 优先 + `RequestImageOffloadPolicy` 上限

- **Files API 优先**（rc.2 起）：图片改走 Files API（`type: 'file'` + `file_id`），失败才回退内联 base64。`content.ts` 里的 `contentHasImage`/`offloadRequestImagesWithPolicy` 处理的是「抽象的 image 内容块」，不关心背后是 file_id 还是 base64——Def 层对表示方式无感。
- **`RequestImageOffloadPolicy`**（`content.ts:135-150`）：`maxImages`/`maxBytes`/`countQuantum`/`byteQuantum`/`representation` 组成「图片超出 Provider 路由预算时，确定性移除最旧图片、替换成文本占位符」的策略。确定性是关键（同样输入必然同样结果，满足「Model-visible ⟺ logged」）。该策略是 Def 提供的通用工具，Provider 用具体参数适配自己的预算。

## 三处最值钱的设计点

### ① request 与 spec 的拆分——「包边界显式优于隐式」的落地

- `ShellExecRequest`：面向模型/插件的请求，`workdir`/`timeoutMs` 等**可选**。
- `ShellExecSpec`：执行器真正用的规格，这些字段**全必填**。
- 中间靠 `ctx.shell.resolve(request)` 把「可选 → 必填」。

这是仓库「包边界处显式优于隐式」规则的落地——默认值不是藏在 `run()` 里的 `?? default`，而是显式的 `resolve()` 步骤。`dsh-shell` 的 request/spec 拆分是该规则的模板实例。

### ② 正交结果独立报告——为什么结果字段拆成四个

一个进程可以同时超时并以退出码 0 退出（因为它捕获了信号），因此 `timedOut`、`aborted`、`signal`、`exitCode` 各自独立为一个字段。这是防「把被中断的运行误读为成功」的关键设计。`timedOut` 和 `aborted` 互斥（一个 fused deadline 驱动两者，报「第一个先发生的原因」）。

### ③ 三角色职责分工（`shell.zh.md` 第 221 行，逐句读）

- `dsh-shell`（Def）：`resolve`/`run`/`start`/`sandboxMode` + `parseExitStatus` 退出状态约定。
- `dsh-bash-local`（Provider）：命令默认值、超时/中止分类、终端环境、后台读取合并。
- `dsh-tool-bash`（Consumer）：面向模型的渲染 + 把后台句柄适配到通用任务运行时。
- 进程组/收集器/spill/凭据清除/dispose：归**子进程 seam**（`subprocess`）——这是另一个 seam，别混。

## 易混点：哪些不归这个 seam（以 shell 缝为例）

| 东西 | 归属 | 说明 |
|---|---|---|
| job id / 所有权 / 控制 | 通用任务运行时（`ctx.jobs`，`jobs.zh.md`） | shell seam 返回「不含任务概念的进程句柄」 |
| 进程组 / 有界收集器 / spill 文件 / 凭据清除 / dispose | 子进程 seam（`subprocess.zh.md`） | `dsh-shell` 只是重导出其词汇 |

## 验证方式

- `packages/shell` 三包对照：`dsh-shell`（Def）、`dsh-bash-local`/`dsh-bash-sandbox`（Provider）、`dsh-tool-bash`（Consumer）。
- 「对齐机制」可用 `inject` 反查：找 Consumer 的 `export const inject = [...]`（键名即消费的键），再搜 `super(ctx, '<键名>')` 找注册者。

## 遗留问题（登记进 questions.zh.md）

- 沙箱 seam（`sandbox.zh.md`）与子进程 seam（`subprocess.zh.md`）尚未精读，`ShellSandboxInfo` 的 `mode`/`enforcement` 词汇、以及 spill 文件机制的具体实现待后续读这两个 seam 时补。
- `dsh-llm` 兼任 Def + Consumer 的「Consumer」具体指什么（它消费 `ctx.llm` 发请求？），尚未读 `packages/llm/llm` 源码确认，只依据 glossary 词条与 catalog 表。
