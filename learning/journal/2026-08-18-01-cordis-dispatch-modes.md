# Cordis 分发模式：两个误解的修正

日期：2026-08-18

## 起因

进入阶段 2，精读 [cordis-primer.zh.md](../../docs/cordis-primer.zh.md) 的「分发模式」表格时，被「是否 await」这一列困住，产生两个疑惑：waterfall 明明是链式调用为何标「不 await」；parallel 明明等所有监听器却无返回值。

## 认知主线

```
读 primer 分发模式表格
  → 疑惑 1：waterfall 链式却不 await
  → 疑惑 2：parallel 等全部却无返回值
  → 查 vendor/cordis/src/events.ts 源码
  → 修正：两个问题同根——「是否 await」列名误导
```

## 关键突破

1. **「是否 await」这一列实际描述的是「分发器方法本身是同步函数还是异步函数」**（即方法是否 `async`、是否返回 Promise），而非「监听器之间是否串行等待」，也非「异步调用下要不要 await」。更准确的命名应是「分发器是否返回 Promise」或「调用方能否 await」。

2. **「串行/并发」与「同步/异步」是两个正交维度**。waterfall 的链式串行靠监听器自己调用 `next()` 委托实现，不是靠 await 实现；waterfall 方法本身同步、不替你 await，所以标「否」。`emit` 也是串行但同步不等待，`parallel` 是并发但异步等待——这正证明两维独立。

3. **waterfall 为什么同步**：分发器只是同步构造「洋葱」结构（取出最内层 `next`，`next()` 逐层委托），同步调用最外层并返回其值；返回值可能是 Promise 也可能是同步值，由调用方决定是否 await。监听器若需后置处理可自己 `await next()`，这是监听器的自由，分发器不代劳。

4. **parallel 为什么无返回值**：源码里 `Promise.allSettled` 的结果被丢弃（只用来过滤 rejected 并 `throw AggregateError`）。原因是 `parallel` 是广播/观察语义，调用方不关心每个监听器返回什么，没有单一结果可返回；await 全部只为「确保副作用都完成」+「聚合并发异常」。

5. **「同步/异步」的主语是分发器，不是监听器**（对 `emit` 的追问逼出来的进一步澄清）。`emit` 之所以「同步却不等待 Promise」不矛盾，是因为：分发器 `emit` 本身不是 `async` 函数，它同步地逐个调用监听器、把监听器返回的 Promise 直接丢弃后立即返回 `void`——从发起到返回之间没有 await 点，所以是同步函数；而「返回 Promise」的是**监听器**（可以写成 `async` 函数），那是监听器自己的属性。两者主语不同，故「同步」与「监听器返回 Promise」可并存。类比：`emit` 是发令枪——同步扣扳机逐个喊「跑」，喊完即收工，不等选手冲线；`parallel` 则 async 等到所有选手冲线（`Promise.allSettled`）才返回。`emit` 适用「通知型」事件：调用方不关心监听器何时完成、也不关心结果。

## 五模式两维对照（自己画出的验证表）

| 模式 | 分发器同步/异步 | 监听器串行/并发 |
|---|---|---|
| `emit` | 同步 | 串行（但不等返回的 Promise） |
| `parallel` | 异步 | 并发 |
| `serial` | 异步 | 串行 |
| `bail` | 同步 | 串行（短路） |
| `waterfall` | 同步 | 串行（`next()` 委托） |

## 事实源

- 概念表：[docs/cordis-primer.zh.md](../../docs/cordis-primer.zh.md)「分发模式」节。
- 实现：[vendor/cordis/src/events.ts](../../vendor/cordis/src/events.ts) `EventsService.parallel` / `emit` / `serial` / `bail` / `waterfall` 五个方法。

## 待办

- 继续读 primer「Cordis Waterfall 语义」节（`next()` 委托与短路的展开）。
- 之后进入 cordis-tutorial 01–07 动手。
