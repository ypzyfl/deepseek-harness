# 会话投影（session-projection）机制

状态：草稿 | 已对照验证（2026-09-01 对照 packages/session/session-projection/src/index.ts、src/types.ts、README.zh.md、packages/core/agent-loop/src/index.ts、src/agent.ts、packages/core/agent/src/projection.ts）｜已对照 0.1.2-alpha.4（2026-09-02：注册表机制无变化；0.1.2-alpha.3 新增第二个投影单元 `turnOutline`，见「实例」节补充）

## 事实源（链接，不复述）

- [packages/session/session-projection/README.zh.md](../../../packages/session/session-projection/README.zh.md) — 注册表的使用与实现说明
- [packages/session/session-projection/src/index.ts](../../../packages/session/session-projection/src/index.ts) — `SessionProjectionRegistry` 服务（register/drive/snapshot/restore 完整链路）
- [packages/session/session-projection/src/types.ts](../../../packages/session/session-projection/src/types.ts) — `SessionProjectionMap` / `SessionProjectionStateMap` 两张 merge-extensible 类型表
- [packages/core/agent-loop/src/index.ts](../../../packages/core/agent-loop/src/index.ts) — `turnBoundaryProjectionDefinition`（agent-loop 注册的 host-only 单元）
- [packages/core/agent-loop/src/agent.ts](../../../packages/core/agent-loop/src/agent.ts) — `buildRequest` 里 `request/header` 的 series 判定
- [packages/core/agent/src/projection.ts](../../../packages/core/agent/src/projection.ts) — `turnBoundary` 的类型声明合并入口

## 它是什么（用自己的话）

`ctx.sessionProjections` 是「日志派生逐会话状态」的**声明式注册表**：领域插件注册一个纯计算单元（初始状态 + 对每个已提交事件的折叠 + 可选客户端视图），框架订阅 `session/event` 主动逐事件驱动（eager drive）并对外提供成品值。它是 harness 里「投影」的第三种形态——`surface` 和 `request/header` 重建「发给模型的内容」，它折叠「客户端/宿主可见的派生状态」（todo 清单、goal 快照、turn 边界）。领域只拥有计算、不持有订阅；客户端只读成品、不自己折叠日志。两者互不相识，靠 key 对齐。

## 关键实体（逐个链接到 home）

- `SessionProjectionRegistry`（`ctx.sessionProjections`）：投影单元表 + 驱动器，一次订阅 `session/event`，每个已提交事件过每个单元的 `apply`。
- `ProjectionDefinition`（`key`/`stateSchema`/`init`/`apply`/`wire`/`stateVersion`）：一个领域贡献的纯计算单元。
- `apply(state, event)`：纯同步折叠；与单元无关的事件**必须返回同一引用**（`Object.is`），引用不变 = 零下游工作。
- `wire`（`viewSchema` + `view`）：客户端视图；省略则单元是 host-only（只进 `stateOf`/`checkpoint`，不进 `snapshot`）。
- `stateVersion`：持久缓存失效版本；折叠语义或序列化字段变化时递增。
- 读面：`snapshot`（一致切面）、`stateOf`（单单元宿主状态）、`onChanged`（变更流）。
- 持久面：`checkpoint`/`restoreFloor`/`restore`/`hydrate`/`viewCheckpoint`（读阶梯）。
- `SessionProjectionMap` / `SessionProjectionStateMap`：客户端可见值表 / 宿主折叠状态表，declaration merging 扩展。

## 三套投影全景（本次认知更新的核心）

之前学的「模型可见 ⟺ logged」由**两套投影**满足（`surface → deriveMessages()` 重建消息历史、`request/header → foldRequestHeader()` 重建请求信封）。现在出现**第三套**，三者都「从日志派生」但目的正交：

| 投影 | 输入事件 | 产出 | 服务谁 |
|---|---|---|---|
| surface | 3 类消息事件 | 消息历史 `Message[]` | 模型 |
| request/header | `EpochHeader` | 请求信封（config+system+tools） | 模型 |
| sessionProjections | 全部已提交事件 | 派生状态（todo/goal/turn 边界） | 客户端 / 宿主 |

前两者服务「模型可见 ⟺ logged」（**重建**请求），第三者服务「客户端可见的派生状态」（**折叠**状态）。「投影」这个词在 harness 里是两种正交含义，不能混为一谈。

## 关键机制（为什么长这样）

1. **eager drive（写时驱动）**：框架订阅 `session/event`，每事件即时过每个单元的 `apply`，只有引用变化才通知变更流。与 surface 的「读时投影」相反——sessionProjections 是「写时折叠、读时取缓存」。
2. **whole-value event rule（承重规则）**：携带状态的日志事件必须携带完整变更后状态，永不携带裸增量。这让每个单元的转移恒为 O(1)、每个产出值自描述。
3. **惰性 cells**：单元按 `Session` 惰性构建（`WeakMap` 缓存），晚注册或老会话在首次触碰时从 `init` 折叠全量内存日志。
4. **refs 计数**：同一 key 被 N 个 preset 挂载共享一个单元，最后一个 registrant 卸载才删除 key（否则第一个注册者的会话结束会剥掉其他活会话的投影）。
5. **注册是 effect**：disposer 随调用方 fiber，卸载领域插件即从快照移除其 key；读方要么在 `inject` 声明 `sessionProjections`，要么在注册表或 key 缺席时显式失败。

## 实例：agent-loop 的 `turnBoundary` 单元

`agent-loop` 注册了一个 host-only 单元 `turnBoundary`（`turnBoundaryProjectionDefinition`），折叠出 turn/step 边界事实：`openTurnStartSeq`（开着的 turn 的 `turn/start` seq，或 null）、`lastStepStartSeq`、`lastStepBoundary`（`{kind:'start'|'end', seq}`）、`lastTurn`。这是「host state reads → projections」迁移的代表——之前宿主直接读事件推断「turn 是否开着」，现在改用声明式投影；`core/agent` 新增 `projection.ts` 用 declaration merging 声明该 key 的类型。

**第二个实例：`turnOutline`（0.1.2-alpha.3 增量）**：新包 `session-turn-outline` 在注册表上注册第二个单元 `turnOutline`——折叠「每个已开始轮次的 `turn/start` seq + 提示词/回复预览」，wire 视图是整值条目数组（consumer 整体替换，不合并），服务聊天轮次导航栏的「整会话按轮跳转」（向后分页越过某轮 `turn/start` 的 seq 即载入整轮）。与 `turnBoundary` 的分工印证了本笔记第 20 行的机制：`turnBoundary` host-only（宿主判「turn 是否开着」），`turnOutline` 带 wire 视图（客户端导航）；前者只算边界、后者还要有界预览并做「每轮至多推送三次」的变更流压流。它把第 44 行「**whole-value event rule**」落到客户端：wire 值是完整大纲，注册表的两道 `Object.is` 门靠「不相关事件返回同一引用」压掉草稿噪音。

## 与相邻单元的关系（依赖谁 / 被谁依赖）

- **依赖**：`cordis`（`Service`）、`dsh-session`（`Session`/`SessionEvent`/`SessionHeader`）。
- **被谁依赖**：`agent-loop`（注册 `turnBoundary`）、`tool-todo`（注册 `todos`）、`session-turn-outline`（注册 `turnOutline`，0.1.2-alpha.3 起）、`session-projection-cache`（持久缓存）、各客户端载体（`snapshot`/`onChanged`）。
- **与 log 机制的关系**：第三套投影，与 `surface`/`request/header` 正交，见 [log.zh.md](log.zh.md)。

## 我曾经的误解（原以为 → 实际是 → 修正来源）

1. **原以为** harness 里的「投影」只有两套（surface + request/header），都服务「模型可见 ⟺ logged」；**实际是** 还有第三套 `sessionProjections`，服务「客户端可见的派生状态」，与前两者正交——一个是「重建模型请求」，一个是「折叠派生状态」。修正来源：session-projection README「概述」+ agent-loop 注册 `turnBoundary`。
2. **原以为** 「投影」都是「读时计算」（lazy，如 `deriveMessages()`）；**实际是** sessionProjections 是「写时驱动」（eager，每事件折叠），读时只取缓存。修正来源：`SessionProjectionRegistry` 的 `drive()` + README「框架负责订阅、驱动与变更通知」。

## 设计红线

- `apply` 必须**同步 + 纯**：async 单元会撕裂客户端的一致性切面。
- state 必须**纯 JSON**：持久缓存的硬前置条件。
- 无关事件**返回同一引用**：否则每次事件都触发下游工作。
- `stateVersion` 非负整数，语义或字段变化必须递增；同 key 不同 version 拒绝共享。

## 验证方式

- 源码级：`register` → `drive` → `snapshot`/`restore` 的完整链路在 `session-projection/src/index.ts`；`turnBoundary` 的折叠在 `agent-loop/src/index.ts` 的 `turnBoundaryProjectionDefinition`。

## 遗留问题（登记进 questions.zh.md）

- `restore`/`hydrate` 的读阶梯（viewCheckpoint / cachedSnapshot / restore / hydrate 四层）与 `session-projection-cache` 的持久化协作细节，尚未精读。
- ~~series 的触发点：`surface.replaceGeneration` 由哪个插件在何时调用 surface replace~~ **已追到**（2026-09-01）：compaction 生态触发——`compaction-basic` 摘要替换 + `compaction-tool-result-pruner` 工具结果修剪，链路见 [log.zh.md](log.zh.md)「request/header 的 series 语义」。
