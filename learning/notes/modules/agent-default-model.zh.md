# agent-default-model 学习笔记

状态：草稿 | 已对照验证（2026-08-22 对照 packages/core/agent-default-model/README.zh.md、packages/core/agent-default-model/src/index.ts、packages/bundle/base/cordis.patch.yml）

## 事实源（链接，不复述）

- [packages/core/agent-default-model/README.zh.md](../../../packages/core/agent-default-model/README.zh.md) — 部署默认模型选择服务
- [packages/core/agent-default-model/src/index.ts](../../../packages/core/agent-default-model/src/index.ts) — 配置层 + Settings 层的合并实现
- [packages/bundle/base/cordis.patch.yml](../../../packages/bundle/base/cordis.patch.yml) — 默认模型的组合配置来源（`deepseek-official` + `deepseek-v4-flash`）

## 它是什么（用自己的话）

`agent-default-model` 是七包里**最薄**的一个：一个「部署级默认模型选择」服务，供入口在创建「尚无会话级模型选择」的 Agent 时取默认值。它只有两个方法——`currentSelection()`（读）和 `saveSelection()`（写）。

## 关键实体（逐个链接到 home）

- `AgentDefaultModelConfig`（`ctx.agentDefaultModel`）：默认模型服务，`currentSelection()` / `saveSelection()`。
- `AgentDefaultModelConfig.provider/model`：插件配置必须提供 `{ provider, model }`。

## 它回答的那个「不对称」疑问

learning-path 七包依赖序里有 `agent-default-model`，但 architecture「核心包」表里**没有**它。读完后答案浮现：**它极薄——只提供一个默认值，几乎不贡献机制**，所以 architecture 那张「向 Cordis 树贡献内容的核心包」表没把它列为值得单独一行。它进依赖序是因为「agent 创建需要默认模型」，但它不是「机制贡献者」。

## 我曾经的误解（原以为 → 实际是 → 修正来源）

1. **原以为** 它是一个「模型路由/选择引擎」；**实际是** 它只是一个「默认值」服务（`currentSelection` + `saveSelection`），真正的路由/可用性诊断由「实际发起模型请求的消费方」负责。修正来源：README 第 12 行「该服务不校验目录成员关系……实际发起模型请求的消费方负责可用性诊断」。

2. **原以为** `reasoningEffort` 属于插件配置；**实际是** 它**特意不属于插件配置**，而属于 Settings 分节——因为「完整保存的选择必须能在下一个选定模型没有推理强度时清除旧值，而组合配置值会再次被继承」。修正来源：README 第 7 行。

## 关键语义：显式默认值 vs 用户选择

`{ provider, model }` 是「组合配置默认值」（插件配置层），Settings 分节在其上叠加「用户选择」。`saveSelection()` 在未挂载设置提供方时是空操作。这体现 harness 的「**默认值是显式 resolve 步骤，不是隐藏 `?? default`**」。

## 核心重点：默认模型到底怎么供给的

默认模型通过**两层**供给——组合配置（cordis.yml）+ Settings 用户层，代码只负责合并和暴露（src/index.ts 第 64–90 行）：

```
cordis.yml 里写 plugins: [{ name: dsh-agent-default-model, config: { provider, model } }]
        │
        ▼ 构造函数读 config
   entry = { provider, model }  ← 基础默认值（组合层）
        │
        ├── 未挂 settings provider 时：this.source = () => entry（只有配置值）
        │
        └── 挂了 settings provider 时：installSettingsSection 叠加「用户层」
                │  用户在 UI/代码里 saveSelection()
                ▼
             this.source = () => 合并(配置值, 用户选择)
        │
        ▼
   currentSelection()  →  { provider, model, reasoningEffort? }
        │
        ▼
   入口（headless / ApiProxy）在创建 Agent 时，若 AgentOptions 没显式指定 provider/model，
   就取 currentSelection() 的默认值
```

## 默认值供给层级（三个追问的答案）

| 追问 | 答案 |
|---|---|
| 读哪个 cordis.yml？ | **`packages/bundle/base/cordis.patch.yml`**（`config: { provider: deepseek-official, model: deepseek-v4-flash }`），是 base bundle 的第一层，所有 profile 共享 |
| 读哪个 Settings？ | **`agent-default-model` 命名空间**（`settingsNamespace('agent-default-model')`），可选挂载；没挂则 `saveSelection()` 是空操作 |
| 都没设置时用什么？ | **不会出现「都没设置」**——`Config` schema 里 `provider`/`model` 是 `.required()`，缺失直接配置校验失败（fail loud），base 层的 `deepseek-v4-flash` 就是正常兜底 |

```
最底层（组合默认）:  packages/bundle/base/cordis.patch.yml
                      config: { provider: deepseek-official, model: deepseek-v4-flash }
                        ↓
用户覆盖层（profile patch）:  用户 profile 的 cordis.patch.yml 用同 id 覆盖整个 config
                        ↓
运行时用户层（Settings）:  saveSelection() 写 agent-default-model 命名空间（可选，需挂 settings provider）
                        ↓
currentSelection() 返回合并结果 → 入口创建 Agent 时取用
```

**关键**：默认值不是「写死在代码里的魔法值」，而是「base 组合层提供兜底 + profile patch 覆盖 + Settings 用户层叠加」的显式 resolve 链。`Config` 的 `.required()` 保证「缺失即失败」，不会静默降级——呼应根 AGENTS.md「Misconfiguration fails loud」。

## 与相邻单元的关系

- **被谁依赖**：入口（`dsh --profile headless`、ApiProxy）在创建 Agent 时读它取默认模型。
- **与 agent-loop**：`agent-loop` 的 `AgentOptions.provider/model` 可覆盖它；缺失时由它补默认值。

## 验证方式

- 源码级：README 第 9–10 行的两个方法；无运行时观察（它不产生模型请求，只提供默认值）。
