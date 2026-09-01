# 会话投影「折叠」≠「组织日志」：方向先反了，账本算余额

日期：2026-09-01

## 起因

读新笔记 [session-projection.zh.md](../notes/mechanisms/session-projection.zh.md) 时，卡在「它折叠『客户端/宿主可见的派生状态』（todo 清单、goal 快照、turn 边界）」这句话上。脑子里冒出的第一个猜测是：「它是用来对日志进行组织的吗？比如把一个 Session、一个 turn 里的日志分组？」——这个猜测完全反了。

## 澄清：不是组织日志，是「从日志算当前值」

sessionProjections **不改日志、不重排日志、不分组日志**。日志还是那串 append-only 的事件。它是「**读着日志，实时算出一个『当前值』**」的机制。

核心类比：**账本 vs 余额**。

- 日志（`Session.log`）= 账本，只增不改，记「发生了什么」。
- 投影 = 余额，从账本算出「现在还剩多少钱」。
- 客户端要的是**余额**，不是账本。投影就是那个「自动从账本算余额」的机制。

「折叠」的确切含义：从日志第一条事件到最后一条，把关心的状态一步步更新到最新。以 todo 清单为例——日志里散布着多次 `todo/write`（每次都是完整清单快照），投影单元用 `init`（初始 `null`）+ `apply(state, event)`（遇 `todo/write` 换成新清单、遇其他事件原样返回）从头走到尾，最终得到「当前 todo 清单」。全程日志顺序原封不动。

## 关键认知

1. **「投影」不是「组织」**：三种投影（surface / request/header / sessionProjections）都是「从日志派生」，但都不重排日志。surface 是「筛出消息事件的 seq 重建消息历史」、request/header 是「重建请求信封」、sessionProjections 是「折叠客户端可见的当前值」——三者都是「读日志算答案」，谁都不碰日志本体。
2. **「一个 turn 中的日志」不是它组织的对象，恰恰相反**：turn 边界（当前有没有开着的 turn、它从哪个 seq 开始、上一个 step 是什么）本身就是 sessionProjections 算出来的**一个派生状态**（`agent-loop` 注册的 `turnBoundary` 单元）。「这段日志属于哪个 turn」这个信息不是日志自己标好的，而是投影现算出来的。
3. **三方分工**：领域（如 todo 插件）只声明 `init`+`apply`（怎么算）、不持有订阅；框架（registry）订阅日志、逐事件驱动、缓存结果、通知变更；客户端只调 `snapshot()` 取现成值。这就是「为什么领域不自己算」——把「从日志折叠」这件重复劳动收归框架。

## 事实源

- [notes/mechanisms/session-projection.zh.md](../notes/mechanisms/session-projection.zh.md) — 触发误解的笔记
- [packages/session/session-projection/src/index.ts](../../packages/session/session-projection/src/index.ts) — `SessionProjectionRegistry.drive()`（逐事件折叠）+ `ProjectionDefinition.apply` 契约
- [packages/core/agent-loop/src/index.ts](../../packages/core/agent-loop/src/index.ts) — `turnBoundaryProjectionDefinition`（「turn 边界是算出来的」实例）

## 遗留

- `surface.replaceGeneration` 的调用方（compaction 何时触发 surface replace）尚未追到——它决定 `request/header` 的 `series` 何时开启，与本篇同属「投影」主线，留待下篇。
