# 阶段 3 收尾：日志/事件概念的三次认知翻转

日期：2026-08-22

## 起因

阶段 3（核心 spine 与回合流）贯穿始终都在和「日志」打交道——从做 llm-inspector 插件，到逐包读七包，再到逐事件追踪 `session.expected.jsonl`。过程中反复卡在同一个东西上：**「日志」到底是什么、「事件」该怎么分类**。回看时发现，这三个卡点其实是同一条主线的三次翻转。

## 三次认知翻转

### 翻转 1：日志不是「一个东西」，而是「真源 + 索引 + 投影」三层

- **原以为**：会话日志是一份文件，surface 是另一份内存数据。
- **实际是**：`Session` 对象内部就同时装着「原始日志」（`log: SessionEvent[]`，真源）和「surface」（`SurfaceManager.nodes`，只存 3 类消息事件的 seq 序号），是「数据 + 索引」关系，不是两份数据；落盘文件是**持久化后端（另一个包）**把 `session.events` 序列化的产物，不属于 dsh-session 包。
- **转折点**：问「session.expected.jsonl 是原始日志还是 surface」时，发现它同时含非 surface 事件（chunk/边界/header）和带 `surfaceOp` 的 3 类消息事件。

### 翻转 2：「系统提示词不进日志」其实是「不进 surface，但进 request/header」

- **原以为**：系统提示词是运行时临时产物，不落日志、哪都看不到。
- **实际是**：系统提示词**确实落日志**——作为 `request/header` 事件的 `EpochHeader.system` 字段，由 `foldRequestHeader()` 重建。请求由「消息历史（surface → `deriveMessages()`）」和「请求信封（`request/header` → `foldRequestHeader()`）」两套正交投影组成，系统提示词属于第二套。
- **转折点**：追「为什么 Trajectory 里看不到系统提示词被使用」时，一路追到 `EpochHeader` 定义，发现它一直在日志里，只是不在 surface。

### 翻转 3：「持久 vs 扩展点」判据从「看代码」进化到「看流程」

- **原以为**（第一次）：看「是否被 `session.append` 落盘」——这是代码倒推，不友好。
- **原以为**（第二次）：看「事件名字」（名词=持久、动词=扩展点）——被 `agent/request` vs `tool/result` 名字像但本质相反打脸。
- **实际是**：看「位置 × 作用」——出现在「结果已产生」之后、用于「固化事实」的是持久事件；出现在「决策关口」、用于「让人当场参与」的是扩展点。位置决定性质，所以过关标准 ③ 要求「对照 Turn flow 图追事件」而非「背事件清单」。
- **转折点**：连续三轮追问，从「代码判定」逼到「语义判定」再逼到「流程判定」。

## 关键认知

1. **「事件溯源」「内存存储」「surface」「文件」是四个正交概念**，都在内存（除文件外），「落盘」是外部持久化后端的动作，不属于 dsh-session 包术语。

2. **「模型可见 ⟺ logged」由两套投影共同满足**：消息历史走 surface 这套，系统提示词/工具/配置走 `request/header` 这套。之前把「不进 surface」误当「不进日志」。

3. **判断事件性质不能靠名字或静态分类，要靠「懂流程」**——这正是阶段 3 过关标准 ③ 的本意。这其实是一贯的教训：凡是被追问「为什么」时，答案往往从「代码倒推」升级为「设计意图正向推」（之前 surface 三类消息也走过同样的路：从「恰好内嵌消息」升级为「因为要发给模型」）。

## 事实源

- [notes/mechanisms/log.zh.md](../notes/mechanisms/log.zh.md) — 日志三层模型 + 两套重建机制（翻转 1、2 的沉淀）
- [notes/mechanisms/event-persistence.zh.md](../notes/mechanisms/event-persistence.zh.md) — 持久 vs 扩展点判据（翻转 3 的沉淀）
- [experiments/003-turn-trace.zh.md](../experiments/003-turn-trace.zh.md) — 逐事件追踪实验（三个翻转的验证素材）

## 遗留 / 待验证

- 这三个翻转都沉淀成 notes 了；journal 只记「经历了什么」，不重复知识。
- 阶段 4（能力缝）会继续遇到「从代码倒推 → 设计意图」的同类问题，留意是否再犯「把实现当本质」的老毛病。
