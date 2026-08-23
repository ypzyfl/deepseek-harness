# scope 学习笔记

状态：草稿 | 已对照验证（2026-08-22 对照 packages/core/scope/README.zh.md、.agents/notes/implemented/architecture/2026-07-08-agent-scope-contexts.md、.agents/notes/implemented/feature/2026-07-12-subagent-persona-tool-filter-and-depth.md；2026-08-23 对照 packages/core/scope/src/index.ts、src/store.ts、packages/core/tools/src/index.ts 补「shadowing/restriction 作用方向」与「条目 = 具名工具」）

## 事实源（链接，不复述）

- [packages/core/scope/README.zh.md](../../../packages/core/scope/README.zh.md) — 带作用域注册原语的公开 API 与设计约定
- [agent-scope-contexts Agent Note](../../../.agents/notes/implemented/architecture/2026-07-08-agent-scope-contexts.md) — 「agent 是注册作用域」的权威决策（四规则 + 平铺模型）
- [subagent-persona-tool-filter-and-depth Agent Note](../../../.agents/notes/implemented/feature/2026-07-12-subagent-persona-tool-filter-and-depth.md) — subagent 的 persona/toolFilter/maxDepth 组合控制
- [packages/core/scope/src/index.ts](../../../packages/core/scope/src/index.ts) — `bindScopeParent`/`scopeChainOf`/`scopeTarget`（键级父链与事件放行方向）
- [packages/core/scope/src/store.ts](../../../packages/core/scope/src/store.ts) — `ScopedLayers.merge()`/`chainLayers()`/`peek()`（遮蔽与继承的读接口）
- [packages/core/tools/src/index.ts](../../../packages/core/tools/src/index.ts) — `ToolLayer`/`ToolRestriction`/`view()`（条目与 restriction 过滤顺序）

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

## 两个「链」：键级父链 vs agent 平铺（回答遗留问题）

「两级扁平」与「shadowing/restriction」看似矛盾——源码里确实存在「沿父链向下继承」的东西。关键要分清两个不同的「链」：

| | 什么在「沿链」 | 方向 | 谁用它 |
|---|---|---|---|
| **键级父链**（`bindScopeParent`） | 键与键之间的 parent 关系 | 注册视图**向下**继承 / 事件放行**向上**扩展 | scope 原语（可选机制，agent loop 平时不用它） |
| **agent 作用域** | 每个 agent = 一个平铺 scope | **扁平，不向下继承** | 平时 agent 的实际形态 |

agent 平时是平铺的；`bindScopeParent` 是原语提供的一个**可选扩展**，只有像「agent preset 常驻挂载」这类场景才把键连成父链。shadowing 的「遮蔽」语义就来自这条可选父链。权威注释（`index.ts:32-38`）：

> One relation powers both directions of scope nesting: registration views inherit DOWN the chain (a child scope sees its ancestors' layers), and event admission extends UP it (a listener tagged with an ancestor receives events dispatched to a descendant key).

## shadowing 的作用方向：向下继承、近者胜出

- **向下继承**：子 scope 看得到祖先 scope 的注册层（layers）。
- **近者胜出**：父子注册了**同名**条目时，近的那层（子层）覆盖远的（父层）。

代码落点 `store.ts:208-217` 的 `merge()`：

```ts
merge(scope, pick) {
  const merged = new Map(pick(this.global).entries())   // ① 先铺全局
  for (const layer of this.chainLayers(scope)) {         // ② 再按「最远祖先在前」叠父链层
    for (const [name, value] of pick(layer).entries()) merged.set(name, value)  // ③ 同名覆盖
  }
  return merged
}
```

`chainLayers` 返回「最远祖先在前、精确 scope 最后」（`scopeChainOf` 返回 `[key, parent, …]` 最近在前，再 `.reverse()`），所以 `merged.set(name, value)` 让**最近的 scope 最后写、最终胜出**。

## restriction 的作用方向：全局过滤在前，scoped 注册在后合并

关键在「过滤之后合并」这个**顺序**，它决定方向是「scoped 覆盖/收窄全局」，而非反向：

1. **先过滤**：`tools.restrict` 先把「全局工具集合」里这个 scope 不该看到的工具剔除（多个 restriction 取交集 = 越收越窄）。
2. **再合并**：然后才把 scope 自己注册的 scope-local 工具加进来。
3. **结果**：被过滤掉的全局工具，既不出现在提示词里、也拒绝执行，与「不存在的工具」无法区分。

顺序重要的原因：**若反过来（先合并 scoped 注册、再过滤），restriction 就可能误伤 scope 自己注册的工具**。所以「全局过滤 → scoped 合并」这个顺序本身，就编码了「scoped 覆盖/收窄全局」这一方向。

## 三个读接口，方向刻意不同（别混）

| 接口 | 读什么 | 是否沿链继承 |
|---|---|---|
| `peek(scope)` | 精确 scope 自己的层 | 刻意不看链——「自己的贡献（限制、守卫）不得悄悄继承祖先的」 |
| `chainLayers(scope)` | 父链上已存在的层，最远祖先在前 | 继承是重点时才用 |
| `merge(scope)` | 先全局、再沿父链叠 shadowing | 产出「有效视图」 |

「该不该继承」由调用方选哪个接口决定，不是数据自带的属性——与「lineage 是数据不是结构」同一精神：继承是一个显式选择的读操作，不是数据自带的属性。

## 方向总结

| 机制 | 方向 | 代码落点 |
|---|---|---|
| shadowing | 子 scope 遮蔽父/全局同名项（向下继承、近者胜出） | `merge()` 先全局后 `chainLayers`，`set` 覆盖 |
| restriction | 先过滤全局集合、再合并 scoped 注册（scoped 覆盖/收窄全局） | 顺序语义 + `peek()` 读自身贡献 |
| 事件放行 | 祖先标签的监听器向上收子孙事件（反向永不成立） | `scopeTarget()` 的 `for` 循环沿 `scopeParents` 向上走 |

事件放行是 shadowing 的**镜像**：注册视图「向下」继承，事件放行「向上」扩展，两者用同一个 `scopeParents` 关系。

## 「过滤、合并的条目」是什么：具名工具 `ToolDefinition`

「条目」= 以工具名（`name`）为键的一条条 `ToolDefinition`，即提供给 LLM 通过工具调用使用的能力条目。一个「工具」= 面向模型的脸（`name`/`description`/`parameters`/`output`）+ 干活的手（`execute`）合一，绑定在同一个注册条目里。

一个 `ToolLayer`（`tools/src/index.ts:714-717`）里其实有三种东西，只有「工具」是被过滤/合并的条目：

| 层里的东西 | 存储 | 「条目」是什么 | 参与 shadowing？参与 restriction？ |
|---|---|---|---|
| **工具** `tools` | `NamedEntries<ToolDefinition>` | 一个个**具名工具**，键 = `name` | ✅ 被 shadowing | ✅ 被 restriction 过滤 |
| **限制** `restrictions` | `AnonymousEntries<CompiledToolRestriction>` | 一条条 `allow`/`deny` **过滤器** | ❌ 是过滤者 | — |
| **守卫** `guards` | `AnonymousEntries<ToolGuard>` | 一条条执行前守卫函数 | ❌ | ❌ |

`ToolRestriction` 就是一个「工具名字符串的掩码」（`allow` = 只留这些名字，`deny` = 去掉这些名字），过滤的是「全局工具名」这个集合。restriction 与 shadowing 的分工（`tools/src/index.ts:1137-1142`）：限制过滤的是 scope **继承**来的东西（全局层 + 祖先层），从不过滤它自己那一层注册的——`view()` 的构建顺序就是「先对继承面做 restriction 过滤 → 再叠本层注册（不受 restriction 约束、遮蔽同名项）」。

存储类型的选择本身也印证了这一点：`tools` 用 `NamedEntries`（按 `name` 具名、重名报错），而 `restrictions`/`guards` 用 `AnonymousEntries`（按 `Symbol` 匿名、值相同也算独立）——只有工具是「以名字为条目的具名集合」。

## 验证方式

- `packages/core/scope/README.zh.md` 第 14 行「`undefined` 表示上下文全局」+ Agent Note 第 30 行「The scope is flat」双源对照，无运行时可复跑命令（纯库，验证靠读源码 + Agent Note）。
- 后续读 session/system-prompt/tools 时，可观察它们内部如何 `scopeOf()` + `ScopedLayers` 采纳 scope 契约。

## 遗留问题（登记进 questions.zh.md）

- ~~`bindScopeParent` 的父链与 Agent Note「scope 平铺」的关系~~ 已厘清（2026-08-23）：两者是两回事——键级父链是原语提供的**可选扩展**，agent 平时是平铺的。见上文「两个『链』：键级父链 vs agent 平铺」。
- restriction 的「全局过滤 → scoped 合并」顺序目前基于 `tools/src/index.ts` 的 `view()` 注释与代码推断，未逐行走查 `tools.spec.ts` 里的 scoped 测试；后续若要验证「被过滤掉的全局工具与不存在的工具无法区分」，可读 `scoped.spec.ts`。
