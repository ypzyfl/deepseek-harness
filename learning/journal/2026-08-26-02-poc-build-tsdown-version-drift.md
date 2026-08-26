# PoC 构建打通：`^` 版本号让我亲手制造了一次「上游漂移」

日期：2026-08-26

## 起因

给仓外插件做 PoC，搭好 `my-dsh/packages/client/ui-hello` 骨架后 `pnpm run build` 失败。本以为会卡在「dsh 客户端 bundle 契约不好复刻」这种硬问题上，结果真正卡住的全是**我自己用 `^` 版本号主动制造的坑**。

## 三个坑的连环排除

1. **tsdown 加载 `.ts` 配置失败**：报错建议 `--config-loader tsx` 或升级 Node 24.11.1。第一反应是加 `--config-loader`，但立刻冒出疑点——dsh 仓自己也用 tsdown，为什么它不需要？查证发现 dsh 仓锁的是 `tsdown@0.22.2`，而我写 `"tsdown": "^0.22.2"`，`^` 让 pnpm 装到了 `0.22.14`（rolldown 1.1.5→1.2.5）。**根因不是 Node 版本，是 tsdown 版本漂移**。正解：精确锁 `0.22.2`，撤掉 workaround。

2. **esbuild build script 被 pnpm 拦截**（`ERR_PNPM_IGNORED_BUILDS`）：pnpm 10+ 默认拦截带 install script 的依赖。加 `allowBuilds: esbuild: true`。

3. **注释里的 `packages/*/*` 触发 `Unexpected "*"`**：块注释里 `/*` 干扰 esbuild 注释解析。改成 `packages/<group>/<pkg>`。

4. **漏产出 node 半**：首次构建成功后发现只有 `lib/client.js`、缺 `lib/index.js`。这正是团队讨论时 Critic 标记的「闭环点 b」——纯前端插件也必须有可导入的 node 半，否则 loader entry 无法 import、fiber 建不起来。tsdown 配置改成数组导出两个 config。

## 关键认知

- **仓外插件对齐 dsh，依赖版本也要对齐 dsh 的 lockfile，而不是 `^` 最新**。团队讨论预判的「上游漂移风险」这次以另一种形态出现——不是 dsh 升级导致，而是**我自己用 `^` 主动把版本漂走了**。
- 报错信息里的「升级 Node 24」是 tsdown 给出的**绕开建议之一**，不是版本要求。dsh 仓 engines 是 `^22.19.0 || >=24.0.0`，它自己就在 Node 22 下锁 tsdown 0.22.2 跑得好好的。为仓外插件单独升 Node 是舍近求远。
- **手写最小 tsdown 契约（路线 A）经实测可行**：closure-factory 三段包装 + externals + env define + 数组导出双半，产物核对正确，`react` 保持 external、其余内联。

## 事实源

- `my-dsh/packages/client/ui-hello/tsdown.config.ts`（手写路线 A 契约，已实测）
- `my-dsh/packages/client/ui-hello/package.json`（`tsdown: 0.22.2` 精确锁）
- dsh 仓 `node_modules/tsdown/package.json`（版本 0.22.2，deps rolldown ~1.1.0）

## 遗留

- 前端**运行时注入**链路尚未验证（构建通了 ≠ 注入成功）。下一步：`dsh plugin --profile web add link:...` + `dsh web`，确认侧栏出现时钟面板。
- 指导手册已回填踩坑清单 9–12 条、第 8 节待验证项已更新。
