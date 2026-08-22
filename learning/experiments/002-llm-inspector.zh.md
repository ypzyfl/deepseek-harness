# 实验 002：llm-inspector 插件——观察发给 LLM 的完整数据

- 日期：2026-08-22
- 状态：已完成
- 前置：需要 `DEEPSEEK_API_KEY`（观察对象是真实模型调用）
- 对应路线：阶段 3（核心 spine 与回合流）动手任务；回答「系统提示词/派生历史到底在哪、怎么观察」

## 假设

阶段 3 的一个核心概念是「模型可见 ⟺ logged，但系统提示词是运行时组装、不进日志」。由此推断：`llm/stream` 这个 waterfall 事件到达时，`options` 应已携带发给模型的完整请求（system + messages + tools），一个监听器就能现场观察「完整数据」，无需改 session 格式。

## 材料

- 插件源码（保留在仓库）：[packages/experimental/llm-inspector](../../packages/experimental/llm-inspector/README.zh.md)
- patch 附件：本目录 [002-llm-inspector-patch.yml](002-llm-inspector-patch.yml)（把插件插入 headless 组合）

## 操作（执行后填写）

实际走通的完整流程见「文件改动清单」与「结论」；两个关键踩坑：

1. **logger 后端缺失**：headless 这类 one-shot profile 不挂 `cordis-plugin-logger-console`，`ctx.logger.info` 静默丢弃。观察器改走 `process.stderr.write`，且不污染 headless 的 format-pure stdout。
2. **profile 解析链 vs 仓库解析链**：`--dump-config`（boot-free）在仓库根解析、tsconfig paths 通配生效；真实 boot 从 `~/.dsh/profiles/<name>` 目录按 Node 规则解析，跨不到仓库 node_modules。真实跑必须 `pnpm run build` 出 `lib/` 并 `dsh plugin add` 进 profile。

## 观察（执行后填写）

一次 `"say hello"` 触发两次模型调用，各自 request + response 完整打印：

- **主对话**：`model: deepseek-v4-flash`、`reasoningEffort: high`、`toolCount: 25`、`messageCount: 4`；`system` 字段就是完整系统提示词（`You are an AI agent powered by DeepSeek Harness...` + persona + 工具使用说明）；`messages` 是派生历史（user 消息 + AGENTS.md 指令 + runtime-context 快照 + skills 目录）；response 含 `cacheReadTokens: 12672`、`reasoningTokens: 36`。
- **会话标题（auxiliary）**：`purpose: session-title`、`maxTokens: 64`、`toolCount: 0`，独立 system 提示词。

## 结论（执行后填写）

- **假设成立**：`llm/stream` 的 `options` 确实是发给模型的完整请求（system 提示词、派生 messages、工具 schema、模型参数一次拿全）。这印证了阶段 3 概念——系统提示词是运行时组装、只在 `llm/stream` 这个时点可见的产物，会话日志只从事实*重建*它而不*存储*它。
- **「完整 wire 字节」仍不存在**：观察器看到的是语义完整的请求/响应视图；provider 适配器内部的序列化字节不在事件面。
- **两个踩坑的认知价值**：① 观察器输出不能依赖 logger 后端（one-shot 组合不挂 console）；②「源码启动」不等于「无需 build + 无需装 profile」——dump 与 boot 走两套解析链。

## 文件改动清单（要跑这个插件需要哪些改动）

插件源码留在 `packages/experimental/llm-inspector/`，但为了让 pnpm workspace 与 TypeScript project references 认到它，以及让 profile 能解析它，需要以下改动/命令。**这些改动当前已还原**，重跑时按序恢复即可：

### 1. pnpm-lock.yaml（新包的 importer 条目）

`pnpm install` 自动生成，无需手改。内容为新增 `packages/experimental/llm-inspector` 这个 importer 及其两个 workspace 依赖（`cordis`、`dsh-llm`）的 `link:` 条目。

### 2. tsconfig.host.json（project reference）

在 `references` 数组里新增一行（TS project references 无通配形式，必须显式）：

```json
{ "path": "./packages/experimental/llm-inspector" },
```

（`tsconfig.base.json` 的 `@deepseek-ai/dsh-*` paths 通配已覆盖源码解析，无需改 base。）

### 3. 构建（产出 lib/）

```sh
npx tsc -b tsconfig.host.json --pretty false
npx tsdown --env.DSH_BUILD_FACE host
```

（`pnpm run build:lib:host` 在 Windows 下会假失败，用底层两条命令更可靠。）

### 4. 把包装进 headless profile（让 boot 能解析）

```sh
node --import tsx/esm apps/cli/src/bin.ts plugin --profile headless add "link:D:/Tech/Github/deepseek/deepseek-harness/fork/deepseek-harness/packages/experimental/llm-inspector"
```

### 5. 运行观察

```sh
node --import tsx/esm apps/cli/src/bin.ts --profile headless --patch learning/experiments/002-llm-inspector-patch.yml "say hello"
```

### 清理

```sh
node --import tsx/esm apps/cli/src/bin.ts plugin --profile headless remove @deepseek-ai/dsh-experimental-llm-inspector
```
