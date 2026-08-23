# 阶段 4 第 2 步：从「记术语」升级到「记结构」（seam 完整性与 lineage 是数据不是结构）

日期：2026-08-23

## 起因

阶段 4 第 2 步要求二读 glossary 的 `capability-seam` 与 `agent-scope` 两节，目标从「记术语」升级到「记结构」。卡点有两个，都属于「没深入读代码就不敢下笔」：

1. 「为什么 seam 必须三角色齐全才叫完整」，要能与 seam-and-replaceability 笔记的「Consumer = 面向模型的脸」对齐。
2. 「子树行为用 lineage 数据表达（而非嵌套继承）」——这句看懂了「scope 两级扁平」，但不知道 lineage 到底怎么表达，是数据结构还是属性字段。

## 两次突破的过程

### 突破 1：seam 的「完整」与「拆分」是同一判据的两面

从 `capability-seam` 词条原文「seam 是完整能力，绝不是其中一个角色」出发，拆出「seam 是完整能力不是接口」与「三角色独立演化是拆分的唯一判据」两条结构。结论已并入 [notes/architecture/seam-and-replaceability.zh.md](../notes/architecture/seam-and-replaceability.zh.md)。

### 突破 2：lineage 是「数据字段」，不是「数据结构」

追问「lineage 如何表达」后，落到 `packages/core/session/src/types.ts` 的 `SessionHeader`，确认它是一组散落的普通可选字段，而非独立数据结构。结论已落为 [notes/mechanisms/lineage-data-not-structure.zh.md](../notes/mechanisms/lineage-data-not-structure.zh.md)（含 `SessionHeader` 字段表）。

## 关键认知

本次最值钱的连线：seam 的「三角色绑定」与 scope 的「两级扁平」是同一个设计哲学——harness 用「结构上的绑定」或「结构上的扁平」去消除一类本可避免的不一致。详见上述两篇笔记。

## 事实源

- [docs/glossary.zh.md](../../docs/glossary.zh.md) — `capability-seam` 与 `agent-scope` 词条（本次精读对象）
- [learning/notes/architecture/seam-and-replaceability.zh.md](../notes/architecture/seam-and-replaceability.zh.md) — 「Consumer = 面向模型的脸」结论来源（增量并入处）
- [learning/notes/mechanisms/lineage-data-not-structure.zh.md](../notes/mechanisms/lineage-data-not-structure.zh.md) — lineage 认知落点
- [packages/core/session/src/types.ts](../../packages/core/session/src/types.ts) — `SessionHeader`（lineage 字段落点）
- [packages/subagent/subagent/src/depth.ts](../../packages/subagent/subagent/src/depth.ts) — 运行时 `subagentDepth` 与 `delegationDepthOf()`
- [docs/subsystems/core.zh.md](../../docs/subsystems/core.zh.md) — 「运行时 ownership vs 持久 parent lineage」的区分（两个正交事实）

## 遗留 / 待验证

- lineage 的「数据 vs 结构」区分目前基于 `SessionHeader` 字段注释与 `ScopedLayers` 描述的推断，未逐行读 `store.ts` 的 `merge()` 实现。第 3 步读 `subsystems/scope.zh.md` 时验证。
