# 仓外插件前端注入：Critic「必须 fork」→ Builder「可运行时挂载」的源码裁决

日期：2026-08-26

## 起因

要回答「在 dsh 仓外（`my-dsh/packages`）开发自定义插件，能否做到对 dsh 源码零污染」，其中最关键、也最分歧的一点是：**前端插件（在现有 web profile 页面加一个文件树面板）到底能不能不 fork、不改 dsh 源码就挂上去**。这个问题交由 CMR 团队 Builder（工程实现视角）与 Critic（质量审查视角）分头查证，结果两轮下来结论完全相反，最终靠 Critic 亲自读源码推翻了自己的初判。

## 翻转链条

1. **Critic 初判：前端插件必须改 dsh 仓内三处，仓外做不到。** Critic 第一轮认为浏览器 roster 是「构建期写死」的：`packages/bundle/web-app/cordis.patch.yml` 里每个 `dsh.client` 行都是手工列出的静态 entry，加上 `tsconfig.client.json` 的 references、`dev-web.ts` 的 `discoverPluginDirs()` 硬编码 glob 仓内 `packages/`、`dsh plugin` 的 `reconcilePlugins` 不识别 `dsh.client`。结论：在仓外开发前端插件「不可行，除非 fork web-app bundle 或改 dsh 源码」。

2. **Builder 反证：ClientModuleRegistry 是运行时扫描，不是构建期静态清单。** Builder 指出 `packages/client/modules/src/index.ts` 的 `ClientModuleRegistry` 直接遍历 `ctx.loader.entries()`，只看「enabled entry + `package.json` 声明 `dsh.client` + `exports["./client"]`」，不区分条目来自 bundle 层、profile patch 还是 `--patch` overlay。

3. **Critic 亲自读源码，推翻自己。** 决定性证据：
   - `processOne`（第 482–499 行）的 qualify 条件只有「`ctx.loader.entries()` 里存在 enabled、非 disabled、有 fiber 的 entry，其 `options.name` 匹配」，不认 patch 来源。
   - `resolveMeta`（第 429–463 行）只用 `ctx.baseUrl` 上的 `createRequire` 去 `require.resolve('<pkg>/package.json')` 读 `dsh.client` 与 `exports["./client"]`，没有任何「必须来自仓内 bundle」的门槛。
   - `cordis.patch.yml` 的 `dsh.client` 行只是多层 patch 中一层的 insert；`--patch` overlay 走的是**同一套** `composeProfile → composeEntries → applyEntryPatches` 算法。
   - `apps/web/vite.config.ts` 第 159–160 行注释明写「Plugin packages never enter this graph; they arrive as runtime bundles through the client module system」——前端插件是运行时 bundle，不进 Vite build graph。

4. **Critic 总结自己的误判在哪**：把「bundle 自带 roster」误当成了「唯一 roster 入口」（实际是多层 patch 中的一层）；低估了 `ClientModuleRegistry` 的运行时增量扫描能力；把「插件自身构建」误判为「必须改 dsh 仓内构建编排」。

## 关键认知

- 前端 `dsh.client` 插件在**不改 dsh 源码、不 fork bundle** 的前提下，可通过 `--patch` overlay 的 insert row（`name` = 包名）挂到现有 web profile，被运行时扫描识别并 serve 为 `/plugins/<id>/client.js`。
- 但有三项**前置条件**（非分歧、是事实）：① 插件必须 install 进 profile（`dsh plugin --profile web add link:<abs>`），否则 `ctx.baseUrl` 的 `createRequire` 解析不到；② 必须自带构建出 `exports["./client"]` 指向的 `lib/client.js`，否则 `initialBundleRevision` 的 `readFileSync` 抛 `MissingClientBundleError`；③ 声明必须含 `dsh.client.platform: "web"`。
- 两个隐蔽闭环点：前端 client row 的 entry name 必须**恰为包名**（子路径如 `pkg/gateway` 会 `require.resolve('<spec>/package.json')` 失败被判永久 null）；纯前端插件也需要一个可导入的**最小 node 半**（loader entry 要 import 包的主入口，缺 `lib/index.js` 则 fiber 建不起来）。

完整结论沉淀在 [notes/architecture/out-of-tree-plugin.zh.md](../notes/architecture/out-of-tree-plugin.zh.md)。

## 方法论收获

这是「让两个视角的 agent 分头查证、再互相质疑」的正面样本：Critic 的初判恰好是 Builder 方案最需要被挑战的致命风险点，而最终是 Critic 自己读源码推翻了它——**源码证据优先于任何一方的既有判断**。两个视角的对抗不是空转，而是把「前端注入是否可行」从「各执一词」逼到了「读源码定论」。

## 事实源

- [packages/client/modules/src/index.ts](../../packages/client/modules/src/index.ts) — `ClientModuleRegistry` 的 `processOne`（运行时扫描 `ctx.loader.entries()`）、`resolveMeta`（读 `dsh.client` + `exports["./client"]` + `platform === 'web'`）
- [packages/bundle/web-app/cordis.patch.yml](../../packages/bundle/web-app/cordis.patch.yml) — `dsh.client` rows 是 insert 列表，非唯一 roster 入口
- [apps/cli/src/profile-boot.ts](../../apps/cli/src/profile-boot.ts) — `composeProfile` / overlay insert row 进入 Loader tree 的链路
- [apps/web/vite.config.ts](../../apps/web/vite.config.ts) — 前端插件不进 Vite build graph 的注释
- [apps/cli/src/plugin.ts](../../apps/cli/src/plugin.ts) — `dsh plugin` 是 pnpm forwarder，`anchorPathSpec` 重锚定本地路径

## 遗留 / 待验证

- 前端注入链路目前是「源码推理 + 事实核对」得出，尚未在 `my-dsh` 里做 PoC 实证（装一个极简 `dsh.client` 插件，确认运行时被识别 + 浏览器加载 + sourcemap 断点）。留待阶段 5 动手时验证。
- 手写最小 tsdown 契约（closure-factory 三段包装顺序、`import.meta.env` truthiness 键）是两处易踩坑点，落地时需锁定。
