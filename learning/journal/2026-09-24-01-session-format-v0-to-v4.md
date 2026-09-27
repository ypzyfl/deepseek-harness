# Session format v0→v4：从「一个常量」长成「邻接迁移链」，系统提示词进 surface

日期：2026-09-24

## 起因

版本对齐核对（0.1.2-alpha.4 `4e84901e` → 0.1.7-rc.1 `46a7f68b`）时，`git diff` 里冒出五个新包：`session-format`、`session-format-catalog`、`session-format-v0-to-v1`、`-v1-to-v2`、`-v2-to-v3`、`-v3-to-v4`。旧笔记（map.zh.md）明确写过「SESSION_FORMAT_VERSION=0」，而迁移包名里出现了 v3→v4，说明版本号已经升到 4。这触发了本轮学习。

## 认知翻转一：从「一个常量」到「四层体系」，三个真值源要分家

旧结论「SESSION_FORMAT_VERSION 是一个常量」没全错，但严重不完整。现在它是四层体系里的**其中一环**：

| 真值源 | 值 | 含义 |
|---|---|---|
| `SESSION_FORMAT_VERSION`（代码常量） | 4 | 当前 **writer**（代码会写的格式） |
| `latestFinalizedVersion` | 4 | **已接受**的兼容基线（有 checkpoint `v4.json`） |
| `latestReleasedVersion` | 3 | **已发布**给用户的格式（`evidenceTag: dsh-v0.1.5-alpha.1`） |

**关键认知**：v4 是「代码会写」的格式，但**尚未随产品发布**；已发布给用户的最多是 v3。「writer / 接受 / 发布」三个事实彼此独立——发布验证是发布操作者的义务，代码常量不等价于「已发布」。这解释了为什么「v0→v4」是机制演进，而不是「用户已经在用 v4」。

## 认知翻转二：系统提示词从 header 字段升格为 surface 节点（v3，冲击最大）

旧笔记的核心结论是「两套重建：surface 重建消息历史、request/header 重建请求信封（系统提示词 + 工具 schema + 配置）」，系统提示词藏在 `request/header.data.header.system` 字段里，「不进 surface 但进日志」。

v3 推翻了这套：**系统提示词变成一个普通的 surface 事件 `system/message`**，落成 surface 的 node 0（第一个 step 的第一条消息）。`EpochHeader` 不再有 `system` 字段（`{ config, adapterDefaults?, tools? }`）。这直接推翻 log.zh.md / system-prompt.zh.md 里「系统提示词不进 surface、走第二套重建」的整节结论。

连带冲击「模型可见 ⟺ logged」的表述：它现在由 surface **一套**就覆盖了系统提示词 + 消息历史，request/header 只负责 config/tools，不再是「第二套重建系统提示词」。

## 认知翻转三：「渲染」≠「发送」（讨论中的用词失误）

我在讲解里说「系统提示词每个 step 渲染一次」，被理解成了「每个 step 重新给模型发一份系统提示词」。这是我用词失误——**渲染（render）是本地计算、发送（serialize）是 wire 输出**，中间还隔着一个「投影（project）」。三个动作要分开：

| 动作 | 是什么 | token 成本 |
|---|---|---|
| 渲染 render | 本地算「当前该用什么提示词文本」 | 无 |
| 投影 project | 拿结果和现存 system 节点比对，决定是否落盘（变了才 replace，没变 no-op） | 无 |
| 发送 serialize | 把消息列表发给模型 | 有 |

**关键认知**：LLM 每次请求无状态，每次请求都带 system + 完整历史，这是模型 API 的固有成本，不是 harness 的设计问题，v2 如此（system 在 header）、v3 依旧（system 在 surface），**没有新增任何 token 成本**。「每个 step 渲染」描述的是「每次请求前廉价地重算一次、通常结果不变」，不是「重复发送」。

## 认知翻转四：系统提示词为什么在 step/start 之后 + 为什么先插空 head

两个连续追问逼出了设计动机：

**问 1：为什么在 step/start 之后，而不是 session 最前？** 因为系统提示词是 **per-request 动态渲染**的（随 preset/工具变化），不是 session 常量；而 `system/message` 升格为 surface 事件后，必须带 `{ turn, step }` 坐标——step 之前根本没有可用的 step 坐标，所以「放在所有 turn/step 之前」在落盘层面结构性做不到。「session 最开头」这个直觉对应的是**投影结果**（折叠后 system 是 wire message 0），不是**落盘坐标**。

**问 2：为什么先插空 system/message 再替换？** 为了让「系统提示词第一次变非空」也走 **replace** 路径而不是 **append**。append 会把它加到 user 历史之后（破坏「system 必须是头」的位置不变量，pi-ai 会把后置 system 当 user 消息），而 replace node 0 天然保持它是最前。空 head 是「钉住 node 0 位置」的受保护占位锚点，`deriveEventMessage` 投影为 null 不产生 wire 消息。

**总结**：系统提示词改变后，**下一次请求**的上下文开头变成新 system；已发出的历史请求重建时仍带它当时的旧 system（append-only + replace 遮蔽，互不污染）。改变的生效点永远是「下一次请求」，不是「篡改过去」。

## 事实源

- [docs/session-format-status.md](../../docs/session-format-status.md) — 三个真值源 + finalization/release 记录
- [packages/session/session-format/README.md](../../packages/session/session-format/README.md) + `src/chain.ts`/`src/types.ts` — 邻接迁移链 + Stage/Codec/Catalog 契约
- [packages/session/session-format-v{0→1,1→2,2→3,3→4}/README.md](../../packages/session/session-format-v0-to-v1/README.md) — 各步迁移规格
- [.agents/notes/.../2026-08-10-session-log-version-mechanism.md](../../.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.md) — 版本机制权威决策（方向感知 + ignorable）
- [.agents/notes/.../2026-08-31-released-session-format-migrations.md](../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.md) — 流式 Stage 决策（为什么整块迁移会 OOM）
- [.agents/notes/.../2026-09-02-system-prompt-as-surface-node.md](../../.agents/notes/implemented/architecture/2026-09-02-system-prompt-as-surface-node.md) — 系统提示词 surface node 0 决策

## 遗留

- v2 的 assistant/chunk 内嵌（`assistant/message.stream` + `assistant/attempt`）只读了规格，未读 `session-format-v1-to-v2/src/migration.ts` 的 attempt 折叠实现。
- v4 的 parent catalog（subagent 家谱补全）只在 README 层面理解，未读 `v3-to-v4/src/` 的 child evidence 绑定实现。
- 生成器 `scripts/gen-session-format-catalog.ts` 如何从迁移包 package.json 生成 `generated.ts`，尚未读。
- `headerEquals` 移除 `system` 比较后，prompt 变化从 reason `change` 变 `series` 的精确判定，尚未追到源码（`requestSurfaceGeneration` 链路）。
