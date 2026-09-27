# 声明式 agent preset（代际与释放管理）学习笔记

状态：草稿 | 已对照验证（2026-09-24 对照 packages/preset/agent-preset/README.md、packages/preset/agent-preset-registry/{README.md,src/index.ts,src/mount.ts}、packages/preset/agent-preset/src/index.ts、.agents/notes 的 declarative-agent-presets 决策笔记）

## 事实源（链接，不复述）

- [packages/preset/agent-preset/README.md](../../../packages/preset/agent-preset/README.md) — 声明插件（普通 Cordis YAML 插件行）
- [packages/preset/agent-preset-registry/README.md](../../../packages/preset/agent-preset-registry/README.md) — 代际（revision）与释放管理
- [packages/preset/agent-preset-registry/src/index.ts](../../../packages/preset/agent-preset-registry/src/index.ts) — `Generation`/`Definition`/`Binding`、`activate`/`retain`/`collect`/`select`
- [packages/preset/agent-preset-registry/src/mount.ts](../../../packages/preset/agent-preset-registry/src/mount.ts) — `mountPreset`（scope + Loader tree + 激活审计）
- [决策笔记 declarative-agent-presets](../../../.agents/notes/implemented/architecture/2026-09-18-declarative-agent-presets.md) — 重组动机与取舍

## 它是什么（用自己的话）

Preset 从「包内硬编码的目录」（`agent-presets` 复数包，已删除）改成了「普通 Cordis YAML 插件行」：一个 preset = 一行 `@deepseek-ai/dsh-agent-preset` 插件，声明 `id + 子插件列表`。registry 为每条声明 eager 建一个隔离 scope + 内存 Loader 树（「代际 revision」）；更新/删除只让旧代际退役，正在用它的 Agent 持引用，最后一个引用释放才销毁。这让「一个进程跑多个不同组合的 Agent」成为可能，且热更新不打断已运行的 Agent。

## 关键实体（两个包 + 三个结构）

| 实体 | 是什么 |
|---|---|
| `agent-preset` | 声明插件：`config: { id, plugins, name?, description?, order? }`；`Service.init` 里 `agentPresets.register(config)`；不拥有运行中的 Agent |
| `agent-preset-registry`（`ctx.agentPresets`） | 注册表服务：拥有 default 选择、代际、引用计数、激活审计 |
| `Generation` | 一个代际 = `{ scope, key, mount, users, retired }`：registry 拥有的隔离 scope + 内存 Loader 树 + 引用计数 |
| `Definition` | 一个声明：`{ config, context, ready, generation?, broken? }`；`broken` 记录激活失败 |
| `Binding` | Agent 绑定：`{ parent: ScopeParentBinding, generation }`——Agent scope 链接到 preset scope |

## 机制

### 1. 代际生命周期（激活 → 退役 → 收集）

1. **激活（activate）**：声明加载时 `createScope(this.owner, key)` + `mountPreset(...)` → 建一个 Generation（`users: 0, retired: false`）。
2. **退役（retire）**：声明被更新/删除时 `record.generation.retired = true`。
3. **收集（collect）**：**只有 `retired && users === 0` 才 `scope.dispose()` 销毁树**。

### 2. 引用计数（谁持有代际）

| 持有者 | users++ 场景 |
|---|---|
| Agent 绑定 | `bind`/`join`：Agent scope 链接到 generation.key |
| 子 agent 继承 | `composeFrom`：子 agent 继承父 agent 的**精确 revision** |
| cold reader lease | `acquireScope`：历史转写冷读时租一个代际 |

**关键心智**：代际 = 「配置某个具体版本的可执行实现」，有独立于声明的生命周期。正在运行的 Agent 持引用 → 旧代际活着 → Agent 的工具/提示词不受编辑影响；新绑定 → 新代际。

### 3. scope 隔离 + isolate realm（一个进程多组合）

- **scope 父子链**：preset 插件注册在 registry 拥有的 scope；Agent 的 scope 经 `bindScopeParent(key, generation.key)` 链接到 preset scope，parent link 控制可见性；`standingMountFor(agentCtx)` 靠「agent 的 parent key 匹配 preset 的 standing key」找到它加入的组合。
- **isolate realm**：preset 挂载的服务必须发布在 `isolate` realm（realm 私有 symbol），**不能泄漏到 root realm**——`leakedServices` 检查「有没有服务发布到 root 全局 store」，泄漏即拒绝 mount。

### 4. 激活审计：失败可见，但不停机

`mountPreset` 后 `auditRows` 查三类问题：import/激活失败（`failed`，拒绝 mount，记录 `broken`）、等待缺失服务（`pending`，保持 mount 等服务自激活）、泄漏到 root（`leaked`，拒绝）。**broken preset 留在 roster 可见、拒绝新绑定，但不阻止应用启动**；`pending` 行要等 Host Loader tree settle 后重审，避免「启动顺序」错误决定「是否可用」。

### 5. 会话持久化与重启恢复

session 记录 `agent-preset/selected` 事件（preset ID），`select()` 在 session 第一个 turn 前落盘（turn 已开始则 `agent-preset/locked` 拒绝）。重启按**当前定义**解析该 ID，缺失则拒绝恢复。旧可执行代际是进程本地的，不序列化。

## 关键设计取舍（Alternatives）

1. **拒绝「目录 + 声明并存」**：两个可写来源争用身份 → 声明式一统，复用 profile 的持久化/分层/patch。
2. **拒绝「声明插件拥有 live child tree」**：编辑时 Loader dispose 会吊销运行中 Agent 的工具 → registry 拥有代际，独立生命周期。
3. **拒绝「懒加载」**：延迟诊断 + pending-first-use 状态 → eager 激活，失败在选中前暴露。
4. **拒绝「broken 拒启」**：失败的可选能力集应可在 Web 修复，不拖垮整机。

## 我曾经的误解（原以为 → 实际是 → 修正来源）

1. **原以为** preset 是「包内硬编码的目录/集合」（`agent-presets` 复数是它自己维护的 discovery/metadata/edit API）；**实际是** 它是「普通 Cordis YAML 插件行」，定义权交还组合层（profile patch / bundle 可 insert/override），目录式 API 被整体移除。修正来源：决策笔记 Problem 段 + `agent-preset` README。
2. **原以为**「编辑 preset 会立即影响所有 Agent」；**实际是** 代际 + 引用计数：运行中的 Agent 持旧代际引用（工具/提示词不变），新建的 Agent 才用新定义；旧代际最后引用释放才销毁。修正来源：`Generation.users`/`collect` + 决策笔记 Decision 段。

## 验证方式

- 源码级：`agent-preset-registry/src/index.ts` 的 `activate`（建代际）→ `unregister`（退役）→ `collect`（引用归零销毁）闭环；`mount.ts` 的 `mountPreset`（scope + Loader tree + 审计 + 泄漏检查）。
- 决策笔记：`declarative-agent-presets` 的 Testing 段（retained parent/child scopes、cold-reader leases、selection logging、failed activation）。

## 遗留问题（登记进 questions.zh.md）

- `isolate` realm 与 scope 的具体区别（realm 私有 symbol 的机制层细节）尚未精读 Cordis 源码。
- `select` 的 `agent-preset/locked` 时序（如何用 `turnBoundary` 投影判定「turn 已开始」）与 blank-session 选择策略的协作，仅 README 层面理解。
- `agent_preset` tool / Web 编辑器的「保存写 profile user patch + revision 检查 + profile 锁」流程，仅决策笔记层面理解。
