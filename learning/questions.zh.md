# 开放问题池

问题挂着不动会烂掉：每一条要么被解答（填答案摘要与出处链接），要么被蒸馏进对应笔记后从本表删除。三态流转与拆分规则见 [method.zh.md](method.zh.md)：超过约 50 行或出现 3 个以上域主题时，按域拆分为 `questions/<domain>.zh.md`，本文件退化为索引。

| 问题 | 状态 | 答案摘要 | 出处 |
|---|---|---|---|
| 不变量断言（invariant）的具体实现代码如何「独立重建 + 比对」模型请求？ | resolved | `invariant.ts` 第 39–42 行：独立再调 `deriveMessages()`，结果与 `options.messages` 做 `JSON.stringify` 比对，不等即 fail（`log-reconstruction desync`） | [notes/mechanisms/log.zh.md](notes/mechanisms/log.zh.md)「核心重点二」 |
| `bindScopeParent` 的「键父链」与 Agent Note 的「agent 作用域平铺」是否指同一层？ | open | — | [notes/modules/scope.zh.md](notes/modules/scope.zh.md) 遗留问题 |
| `replace` 操作（compaction）的具体触发链：`surfaceOp.replace` 由谁构造、`assertToolResultRewrite` 如何被 compaction seam 调用？ | open | — | [notes/modules/session.zh.md](notes/modules/session.zh.md) 遗留问题 |
| `complete: true` 段的语义与 `system-prompt/assemble` waterfall 的交互细节？ | open | — | [notes/modules/system-prompt.zh.md](notes/modules/system-prompt.zh.md) 遗留问题 |
| `ToolRuntime.restrict()` 的 allow/deny 掩码「快照」语义（注册时快照 vs 实时）？ | open | — | [notes/modules/system-prompt.zh.md](notes/modules/system-prompt.zh.md) 遗留问题 |
| `withInitiator`/发起方作用域（`AsyncLocalStorage`）的进程内身份传递机制？ | open | — | [notes/modules/agent.zh.md](notes/modules/agent.zh.md) 遗留问题 |
| `ReactLoopAgent` 的具体循环状态机（phase 流转、`kick()`/`turn()`/`step()` 调用链）？ | open | — | [notes/modules/agent-loop.zh.md](notes/modules/agent-loop.zh.md) 遗留问题 |
