# lineage 是数据不是结构 学习笔记

状态：草稿 | 已对照验证（2026-08-23 对照 docs/glossary.zh.md agent-scope 词条、packages/core/session/src/types.ts、packages/subagent/subagent/src/depth.ts）

## 事实源（链接，不复述）

- [docs/glossary.zh.md](../../../docs/glossary.zh.md) — `agent-scope` 词条（scope 两级扁平、lineage 定义）
- [packages/core/session/src/types.ts](../../../packages/core/session/src/types.ts) — `SessionHeader`（lineage 字段落点）
- [packages/subagent/subagent/src/depth.ts](../../../packages/subagent/subagent/src/depth.ts) — 运行时 `subagentDepth` 与 `delegationDepthOf()`
- [docs/subsystems/core.zh.md](../../../docs/subsystems/core.zh.md) — 「运行时 ownership vs 持久 parent lineage」的区分（两个正交事实）

## 它是什么（用自己的话）

「子树行为用 lineage 数据表达（而非嵌套继承）」——lineage 不是独立的数据结构，而是一组散落在 `SessionHeader`（会话头）里的普通可选字段，它们只记录「父子关系这个事实」，从不改变「可见性」。subagent 想知道「我是谁的子 / 我还能委托几层 / 我的历史从哪条事件起算」，就**读这几个字段**；但它的工具/提示词/变量**不因此继承任何东西**——可见性只由「全局 vs 恰好一个 scope」两级扁平模型决定，与父子关系无关。

## 关键实体：lineage 的字段落点

lineage 不是某种专门的数据结构，而是散落在 `SessionHeader` 里的一组普通可选字段（`packages/core/session/src/types.ts`）：

| 字段 | 类型 | 携带的 lineage 事实 | 代码注释语义 |
|---|---|---|---|
| `parentSession` | `SessionId \| undefined` | 这个会话从谁 fork 出来（seed lineage） | "The session this one was forked from" |
| `delegationDepth` | `number \| undefined` | 委托深度：顶层缺省 = 0，子 agent = 父 + 1 | "parent depth + 1 for a subagent child" |
| `origin` | `'subagent' \| undefined` | 是否作为 subagent 子会话创建 | "coarse product classification" |
| `seedLength` | `number \| undefined` | 继承了多少条前置事件（父历史与子工作的分界） | "distinguish parent history from child work" |

对照 glossary `agent-scope` 词条的 lineage 名单（`parentSession`、持久的 `delegationDepth`、运行时 `subagentDepth`）——三者全部落在这组字段上；运行时 `subagentDepth` 另在 `depth.ts`（`AgentOptions.subagentDepth`，`delegationDepthOf()` 里 `Math.max(header.delegationDepth, runtime.subagentDepth)` 取较大者）。

## 「数据」和「结构」的区分，落到代码长什么样

关键不在字段本身，而在它们**与「可见性」完全无关**：

1. `parentSession` 只是一个 id 值，指向父会话的 `SessionId`，是「事实」字段，不参与任何作用域过滤——没有「因为 parentSession 存在就向下继承父 agent 注册」这条规则。父子关系被**记下来**了，但没有被**用作继承的通道**。
2. `delegationDepth` 是「递归预算」不是「作用域层级」：它只限制「子 agent 还能往下委托几层」，不决定「子 agent 能看见父 agent 注册了哪些工具」。
3. `origin: 'subagent'` 明说是展示元数据（`presentation metadata, not proof`），连「子 agent 能不能续行」都不由它决定。

## 与 scope 的同一设计哲学（横切不变量）

lineage「是数据不是结构」与 seam「三角色必须绑定」是同一个设计哲学的两面：

- **seam 侧**：拒绝「只换一个角色」——能力是「脸 + 手」的整体，拆开换会脱节，所以三角色绑定成完整 seam。
- **scope 侧**：拒绝「向下继承的作用域链」——子树关系是「数据事实」而非「结构层级」，用结构表达会引入脆弱嵌套，所以砍成两级扁平、改用 lineage 数据。

两者都在说同一件事：harness 用「结构上的绑定」或「结构上的扁平」去消除一类本可避免的不一致——前者消除「脸手不一致」，后者消除「层级继承带来的可见性漂移」。

与 `notes/modules/scope.zh.md` 第 30 行误解 4、第 40 行「生命周期归属 ≠ 注册继承」形成「实现 vs 模型」的对照：scope 笔记落在「带作用域注册原语」这一实现面，本笔记落在「lineage 是数据不是结构」这一模型语义面。

## 我曾经的误解（原以为 → 实际是 → 修正来源）

1. **原以为** lineage 是某种专门的数据结构（嵌套对象或链表），用来承载父子关系；**实际是** 它是一组散落在 `SessionHeader` 里的普通可选字段，只是「事实」字段，不参与任何继承或作用域过滤。修正来源：`packages/core/session/src/types.ts` 的 `SessionHeader` 定义 + glossary `agent-scope` 词条。

## 验证方式

- 自问一句检验是否真懂：**如果 harness 改成「子 agent 继承父 agent 的 scoped 注册」，改动会发生在 `SessionHeader` 这几个字段上吗？** 答案是不会——那会改在 `ScopedLayers` 的 `merge()` 逻辑里（让 scope key 沿着 lineage 链向上查）。scope 的层级和 lineage 的数据，在代码里是两个不互通的平面。

## 遗留问题（登记进 questions.zh.md）

- lineage 的「数据 vs 结构」区分目前基于 `SessionHeader` 字段注释与 `ScopedLayers` 描述的推断，未逐行读 `store.ts` 的 `merge()` 实现来确认「继承不会发生在 merge 逻辑里」。读 `subsystems/scope.zh.md` 时验证。
