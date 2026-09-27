# session format（会话格式版本与邻接迁移链）学习笔记

状态：草稿 | 已对照验证（2026-09-24 对照 docs/session-format-status.md、packages/session/session-format/{README,src/chain.ts,src/types.ts,src/filename.ts}.md、四个迁移包 README、.agents/notes 三份决策笔记）

## 事实源（链接，不复述）

- [docs/session-format-status.md](../../../docs/session-format-status.md) — 三个真值源（writer / finalized / released）与 finalization/release 记录
- [packages/session/session-format/README.md](../../../packages/session/session-format/README.md) — 纯邻接迁移库（chain/catalog/codec/stage）
- [packages/session/session-format/src/chain.ts](../../../packages/session/session-format/src/chain.ts) — 邻接链构造 + 流式 stage 连接
- [packages/session/session-format/src/types.ts](../../../packages/session/session-format/src/types.ts) — Stage/Codec/Catalog/Run 契约
- [packages/session/session-format-catalog/README.md](../../../packages/session/session-format-catalog/README.md) — build-static 第一方装配
- 四个迁移包 README：[v0→v1](../../../packages/session/session-format-v0-to-v1/README.md)、[v1→v2](../../../packages/session/session-format-v1-to-v2/README.md)、[v2→v3](../../../packages/session/session-format-v2-to-v3/README.md)、[v3→v4](../../../packages/session/session-format-v3-to-v4/README.md)
- 决策笔记：[版本机制](../../../.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.md)、[流式 Stage](../../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.md)、[系统提示词 surface node 0](../../../.agents/notes/implemented/architecture/2026-09-02-system-prompt-as-surface-node.md)

## 它是什么（用自己的话）

会话日志的**磁盘格式**有一个单调递增的整数版本号（现为 **4**），围绕它长出了一套「把旧格式日志无损、单遍、流式地转换成当前格式」的机制。核心是**邻接迁移链**：每步迁移（vN→vN+1）只做一件明确的语义变化，若干步拼成一条从 v0 到 v4 的唯一无缺口链；旧世代永不改写，只写最终当前世代。

## 关键实体（逐个链接到 home）

| 术语 | 是什么 | 关键点 |
|---|---|---|
| writer | `SESSION_FORMAT_VERSION` 常量（core/session/src/types.ts） | 唯一手维护的数字，现=4 |
| generation | 一个已落盘的格式版本 | 文件名 `session.jsonl`(v0) / `session.vN.jsonl`(vN) |
| codec | 某格式的**物理行**编解码器 | 只管「一行 JSON ↔ 逻辑 header/event」 |
| migration | 一条**邻接边**（vN→vN+1）声明 | 必须 `to === from + 1` |
| stage | 一条 migration 的**有状态流式实例** | 每 artifact 一个，不共享；`transformEvent/transformRun/finish` |
| chain | 邻接边拼成的**唯一无缺口**迁移计划 | 构造时验证 v0..current 每步存在 |
| catalog | 物理分发器：按 header 版本选 codec + 组 chain | `readHeader` 只读 header 不碰 body |
| run | codec 产的**紧凑事件束**（packed 行） | 避免 914 万 chunk 先展开成普通事件 |

**三个真值源分家**（session-format-status.md 的核心，最易混）：`SESSION_FORMAT_VERSION`=writer=4；`latestFinalizedVersion`=已接受兼容基线=4（checkpoint `v4.json`）；`latestReleasedVersion`=已发布=3（`evidenceTag: dsh-v0.1.5-alpha.1`）。v4 是「代码会写」但**尚未发布**的格式。

## 机制：邻接迁移链如何运转

数据流（决策笔记 2026-08-31 的核心）：

```
JSONL 物理行
  → 物理 row decoder（按 header 版本选 codec）
  → v0→v1 stage → v1→v2 stage → v2→v3 stage → v3→v4 stage
  → current event collector（只保留当前格式事件）
```

三个关键实现点：

1. **反向连 context、正向 finish**：`CompiledSessionFormatMigrationStream` 用 `ChainedMigrationContext` 从下游往前串 stage（`toReversed()`），使每个 stage 的 `emitEvent` 同步推进到下一个；`finish()` 从源到目标依次结算，让每个 stage 先吐尾部事件。全程无 `flatMap`、无中间事件数组。
2. **`transformRun` 避免展开**：v0 的 packed assistant chunk 是 914 万事件的来源，`SessionFormatEventRun` 让 v1→v2 折叠边**直接消费紧凑束**，不必先展开成普通事件。这是「整块迁移 OOM → 流式 477MB retained」的关键。
3. **header-only 分类**：`readHeader()` 不读事件体就返回 `current / migration-required / unsupported / malformed`；`stat`/`list` 不触发迁移。

## v0→v4 各步改了什么

每步都是「一个明确语义变化 + 坐标系重映射」，遵循「改最少的、拒绝改不了的」：

- **v0→v1**：恒等 + 有限历史规范化（`steering/message`→`user/message`、`compact/*`→`compaction/*`、去 `turn/start.trigger`、补确定性 id）。已退役的东西（`request/header-delta`、`mode/set`）直接拒绝。v1 无任何 tag 用过，是被穿越的中间态。
- **v1→v2**：assistant 流内嵌——消费顶层 `assistant/chunk`，把完整带时序的流内嵌进 `assistant/message`；失败 attempt 记 log-only 的 `assistant/attempt`。事件数变，dense 重映射存活事件与 seq 引用。
- **v2→v3**：系统提示词升格为消息——从 `request/header.data.header.system` 字段变成 surface 的 `system/message` 节点（node 0，受保护头）。同时做 PTC/preset 名翻译（`code`→`ptc`）和 canonical envelope。插入了 system 事件，事件数/seq 变，需密集重映射。详见 [journal/2026-09-24-01](../../journal/2026-09-24-01-session-format-v0-to-v4.md) 的认知翻转四。
- **v3→v4**：工具结果升格为 tool-role 消息——`tool/result` 的 message 从 `role:'user'` 变 `role:'tool'`，去 `tool-result` 包装块，callId/content/isError 提升为消息字段；producer source 从 plugin 字符串改成 `kind`；补父 catalog（subagent 家谱）；关闭有证据的 interrupted turn。

**贯穿主线**：每一步都把「原来藏在别处的语义」提升为消息/事件的第一公民（流内嵌进消息、系统提示词变消息、工具结果变消息），让「模型可见 ⟺ logged」越来越彻底。

## 关键设计原则

1. **不可变世代**：迁移永不 move/overwrite/delete 已提交世代，只写最终当前世代；保留的低世代不是降级回退承诺。
2. **拒绝优于回退**：未知事件**默认 required**（只有 `ignorable: true` 才可跳过）——默认 ignorable 会把「忘记标记」变成「静默抽空会话」。
3. **writer 决定 bump，不是 reader**：「能 parse 不出错」不是标准，静默跳过塑造重建的内容就是错误读。
4. **方向感知拒绝**：旧 reader 读新格式报 `unsupported` 并指向 raw log 路径（`SessionFormatUnsupportedError` ≠ `CorruptionError`）。
5. **邻接而非跨度**：库只暴露相邻边，不暴露跨度/稳定事件标识/通用引用重写代数。

## 我曾经的误解（原以为 → 实际是 → 修正来源）

1. **原以为** `SESSION_FORMAT_VERSION` 就是「日志版本」这一个事实；**实际是** 它只是 writer 号，周围还有 generator（从迁移包 package.json 生成 catalog 的 `generated.ts`）、finalization（接受的兼容基线）、release（发布证据）三层，三个真值源要分开。修正来源：session-format-status.md「Sources of truth」。
2. **原以为** 版本升级是「一次大迁移」；**实际是** 由若干**邻接边**（每步 `to === from + 1`）拼成的链，每步只做一件语义变化。修正来源：chain.ts 的 `defineSessionFormatMigration`（拒绝非邻接）。
3. **原以为** 迁移会改写旧文件；**实际是** 旧世代永不动，只写最终当前世代（`session.vN.jsonl`），中间版本只存在于 stage 状态。修正来源：filename.ts + 决策笔记「Publication rules」。
4. **原以为** 流式只是「性能优化」；**实际是** 它同时是**正确性**要求——整块迁移把 116MB 日志搬成 OOM，流式 Stage 是唯一可行的实现。修正来源：决策笔记 2026-08-31 的「Whole-artifact performance failure」。

## 验证方式

- 源码级：`chain.ts` 的 `CompiledSessionFormatChain` 构造（验证唯一无缺口邻接链）；`types.ts` 的 `SessionFormatMigrationStage` 契约。
- 文档级：`docs/persistence-changes/historical-formats/README.md` 逐版本 schema 参考；`session-format-status.md` 的三真值源记录。
- 性能实证：决策笔记 2026-08-31「Benchmark」表（914 万 v0 事件 → 72784 个 v2 事件，OOM → 477MB retained）。

## 遗留问题（登记进 questions.zh.md）

- 生成器 `scripts/gen-session-format-catalog.ts` 如何从迁移包 package.json 的 `dsh.sessionFormatMigration` 清单生成 `session-format-catalog/src/generated.ts`，尚未读。
- v4 parent catalog 的 child evidence 绑定（`createSessionFormatCatalogWithChildren`）与 JSONL 持久化的协作，仅 README 层面理解。
