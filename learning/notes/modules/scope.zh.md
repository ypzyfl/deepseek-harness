# scope 学习笔记

状态：草稿 | 已对照验证（2026-08-22 对照 packages/core/scope/README.zh.md、.agents/notes/implemented/architecture/2026-07-08-agent-scope-contexts.md、.agents/notes/implemented/feature/2026-07-12-subagent-persona-tool-filter-and-depth.md）

## 事实源（链接，不复述）

- [packages/core/scope/README.zh.md](../../../packages/core/scope/README.zh.md) — 带作用域注册原语的公开 API 与设计约定
- [agent-scope-contexts Agent Note](../../../.agents/notes/implemented/architecture/2026-07-08-agent-scope-contexts.md) — 「agent 是注册作用域」的权威决策（四规则 + 平铺模型）
- [subagent-persona-tool-filter-and-depth Agent Note](../../../.agents/notes/implemented/feature/2026-07-12-subagent-persona-tool-filter-and-depth.md) — subagent 的 persona/toolFilter/maxDepth 组合控制

## 它是什么（用自己的话）

`scope` 是 core 七包里唯一的「零依赖库」——它暴露 `createScope(ctx, key)` 等纯函数，造出一个带标签（key）的 Cordis 子上下文，让通过它做的注册归属到某个 agent，从而在多 agent 共享基础设施的同时隔离各自的工具、提示词段、监听器。它不是挂在 `ctx` 上的服务，而是被其他包 import 调用的函数库。

## 关键实体（逐个链接到 home）

- `createScope(ctx, key)`：造带标签子上下文；`scopeOf(ctx)`：读标签，`undefined` = 全局。
- `agent.ctx`：每个活体 agent 恰好一个 scope，通过 `agent.ctx` 暴露给贡献者做注册。
- `Scoped<T>` / `scopeTarget(base, key)`：按作用域路由事件的载体与分发原语。
- `ScopeKey`：作用域的内部标签，用来匹配「注册落在哪层」与「操作读哪层」。

## 我曾经的误解（原以为 → 实际是 → 修正来源）——本笔记的黄金内容

1. **原以为** 存在一个「全局 scope」，agent scope 挂在它下面；**实际是** 全局**不是** scope——全局是「无标签的普通上下文」（`scopeOf` 返回 `undefined`），scope 专指 `createScope` 造出的带 key 上下文。结构是「一个全局层 + 每个 agent 一个平铺 scope」，非树状、无根 scope。修正来源：Agent Note「The scope is flat. Resolution never walks parent or sibling scopes」+ README「`undefined` 表示上下文全局」。

2. **原以为** agent 和 scope 之间有一张 key→scope 映射表来维持对应；**实际是** 对应靠**两个分离的事实**维持——「注册用 `agent.ctx` 发起（决定归属）」「操作用 agent 主体选择（决定视图）」，key 只是内部标签，不是查询索引。修正来源：Agent Note「Registration origin and operation subject are separate facts」。

3. **原以为** 通过 `agent.ctx` 调用任意服务，服务会自动「变成」该 agent 的；**实际是** 只有采纳 scope 契约的服务（`ctx.tools`、`ctx.systemPrompt` 等）内部用 `scopeOf()` 解析 agent 层，`agent.ctx` 不会魔法般地改变任意 Cordis 服务调用。修正来源：Agent Note「`agent.ctx` does not automatically change arbitrary Cordis service calls」。

4. **原以为** subagent 会组成 scope 树（父 scope 继承给子）；**实际是** subagent 有**血缘树**（`maxDepth`/`delegationDepth` 计数、parent–child 生命周期归属）但**无 scope 树**——每个 subagent 仍是平铺 scope，父与兄弟的 persona「never enter the child's flat scope」。修正来源：subagent Note「Registration scope is flat by design, and lifetime ownership does not imply visibility inheritance」。

## 与相邻单元的关系（依赖谁 / 被谁依赖）

- **依赖**：仅 Cordis（`Context`、`Service`），是七包里唯一零依赖（不依赖其他 core 包）的包。
- **被谁依赖**：session、system-prompt、tools 三个注册表消费它（架构 README「位于 session/system-prompt 之下让它们消费」）；agent-loop 是主要消费者（为每个 agent `createScope`）。
- **与 agent-loop**：loop 是「造 scope」的一方；scope 包本身不 import agent，底层包无需感知「键的具体含义」。

## 设计红线（贯穿三处权威源）

**生命周期归属 ≠ 注册继承**。父拥有子的生命周期，但父的注册不会因「拥有」而流入子。这是 scope 刻意保持平铺、拒绝树状继承的根本理由：树状继承会 freeze 动态全局注册，并把「组合」与「权限」混为一谈。同时 scope 是「组织路由」不是「安全边界」——「作用域用于路由受信任的同进程插件；它们不是沙箱或权限边界」。

## 验证方式

- `packages/core/scope/README.zh.md` 第 14 行「`undefined` 表示上下文全局」+ Agent Note 第 30 行「The scope is flat」双源对照，无运行时可复跑命令（纯库，验证靠读源码 + Agent Note）。
- 后续读 session/system-prompt/tools 时，可观察它们内部如何 `scopeOf()` + `ScopedLayers` 采纳 scope 契约。

## 遗留问题（登记进 questions.zh.md）

- `bindScopeParent` 的父链（README 第 5 行「注册视图沿链向下继承、事件放行沿链向上扩展」）与 Agent Note「scope 平铺」的关系尚需厘清：README 讲的是「键的父链」，Agent Note 讲的是「agent 作用域平铺」，两者是否指同一层、还是键级父链与 agent 平铺是两回事？待读 session/system-prompt 消费处时再验证。
