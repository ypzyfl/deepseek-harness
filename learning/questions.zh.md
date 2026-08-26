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
| `dsh plugin add` 对本地路径 spec（`file:` / `link:` / 裸路径）的 link-vs-copy 语义差异？ | resolved | `link:` 是 symlink（源目录编辑直接可见，dev 正解）；`file:` 是复制（改代码需重装，不利于 debug）；相对路径被 `plugin.ts` 的 `anchorPathSpec` 锚定到调用 cwd。仓外插件 dev 统一用 `link:` + 绝对路径 | [notes/architecture/out-of-tree-plugin.zh.md](notes/architecture/out-of-tree-plugin.zh.md)「前端插件三个前置条件」；`apps/cli/src/plugin.ts` |
| `--patch` 能否替代 `dsh plugin add` 完成仓外前端插件挂载？ | resolved | 不能：`--patch` 只把 insert row 加进组合树（挂载），`resolveMeta` 的 `createRequire(ctx.baseUrl)` 要求包 install 进 profile 的 node_modules（解析），两件事缺一不可。且带 `dsh.bundle` 声明的包 add 后 reconcile 自动挂入 bundles 层，`--patch` 完全不需要；它只服务无声明普通插件 | [notes/architecture/out-of-tree-plugin.zh.md](notes/architecture/out-of-tree-plugin.zh.md)「install 落点与 profile 隔离」；[journal/2026-08-26-03-install-target-and-profile-isolation.md](journal/2026-08-26-03-install-target-and-profile-isolation.md) |
| fork 一个 web 等价 profile 的正确姿势？（新名字 profile 会被初始化成什么？） | resolved | 不能靠命令自动初始化：`PROFILE_TEMPLATES` 按名字查（仅 `web`/`headless`），`dsh plugin --profile <新名字> add` 走 `DEFAULT_PROFILE_BUNDLES`（仅 `dsh-base`，无 `dsh-web-app`，起不了 web UI）；直接 `dsh --profile <新名字>` 抛「does not exist」。正解 = 手写三文件（package.json 抄 web 模板 bundles + 空 cordis.patch.yml + pnpm-workspace.yaml hoisted）或复制现有 web 目录改名；备选 `DSH_HOME` 沙箱（沙箱内名字可仍叫 `web`） | [guide/custom-plugin.zh.md](guide/custom-plugin.zh.md) 4.4；`packages/boot/app-boot/src/profile.ts` |
