# 仓外插件（out-of-tree plugin）学习笔记

状态：草稿 | 已对照验证（2026-08-26 对照 packages/client/modules/src/index.ts、packages/bundle/web-app/cordis.patch.yml、apps/cli/src/profile-boot.ts、apps/cli/src/plugin.ts、apps/web/vite.config.ts；来源为 CMR 团队 Builder/Critic 两轮源码查证）；2026-08-26 补充 install 落点与 profile 隔离（对照 packages/boot/app-boot/src/profile.ts、packages/util/home-paths/src/index.ts）

## 事实源（链接，不复述）

- [packages/client/modules/src/index.ts](../../../packages/client/modules/src/index.ts) — `ClientModuleRegistry`：`processOne`（运行时扫描 `ctx.loader.entries()`）、`resolveMeta`（读 `dsh.client` + `exports["./client"]` + `platform === 'web'`）、`initialBundleRevision`（`readFileSync` 缺文件抛 `MissingClientBundleError`）
- [packages/bundle/web-app/cordis.patch.yml](../../../packages/bundle/web-app/cordis.patch.yml) — `dsh.client` rows 的 insert 列表形态
- [apps/cli/src/profile-boot.ts](../../../apps/cli/src/profile-boot.ts) — `composeProfile` / `composeEntries` / `applyEntryPatches`，overlay insert row 进入 Loader tree 的链路
- [apps/cli/src/plugin.ts](../../../apps/cli/src/plugin.ts) — `dsh plugin` 是 pnpm forwarder，`anchorPathSpec` 重锚定本地路径
- [packages/boot/app-boot/src/profile.ts](../../../packages/boot/app-boot/src/profile.ts) — `PROFILE_TEMPLATES`（按名字查）/ `initProfile`（三文件产物）/ `loadProfile` / `healProfilesModuleFallback`（共享模块 fallback 层）：install 落点与 fork profile 的机制依据
- [packages/util/home-paths/src/index.ts](../../../packages/util/home-paths/src/index.ts) — `resolveDshHome` 优先级（configured > `$DSH_HOME` > `~/.dsh`）：DSH_HOME 沙箱隔离的依据
- [apps/web/vite.config.ts](../../../apps/web/vite.config.ts) — 前端插件不进 Vite build graph 的注释
- [packages/client/tsdown.client.ts](../../../packages/client/tsdown.client.ts) — client bundle 的构建 preset（wire 契约：`lib/client.js` / CJS+browser+sourcemap / closure-factory 三段包装 / externals / env define）

## 它是什么（用自己的话）

dsh 的「仓外插件」指放在 dsh 仓库之外（如 `my-dsh/packages`）开发的插件，借助 profile/plugin 机制原生接入，做到对 dsh 源码零污染。纯后端插件就是普通 Cordis 插件包；前端插件是「双半包」——node 半让 loader 能 import 到它、browser 半（`exports["./client"]` 指向 `lib/client.js`）由 `ClientModuleRegistry` 在**运行时**扫描注入浏览器。关键认知：**浏览器 roster 不是构建期写死的清单，而是运行时从 `ctx.loader.entries()` 扫描出来的**，因此仓外插件通过 `--patch` overlay 的 insert row 就能挂到现有 web profile，无需 fork、无需改 dsh 源码。

## 关键实体（逐个链接到 home）

- **profile 目录**：`$DSH_HOME/profiles/<name>`，`ctx.baseUrl` 锚定于此，仓外插件的模块解析（`createRequire(ctx.baseUrl).resolve('<pkg>/package.json')`）从这里 parent-walk。
- **`dsh.client` 声明**：插件 `package.json` 里的 `dsh.client = { platform: "web", inject: [...], external: [...] }`。`resolveMeta` 要求 `platform === 'web'` 才判定为 client 包；`inject` 是 fiber 到达的信息性边，`external` 是模块表请求（约束 bundle 到达顺序），缺省均可为空。
- **`exports["./client"]`**：指向浏览器半产物 `lib/client.js`，是 `resolveMeta` 判定「是否有 client 半」的依据，缺失则抛错。
- **node 半（主入口 `lib/index.js`）**：loader entry 要 `import(this.options.name)`，纯前端插件也必须产出可导入的 node 半，否则 entry fiber 建不起来，更谈不上被扫描为 client row。

## 仓外插件接入链路（谁在哪一步做什么）

```
仓外插件包（my-dsh/packages/<group>/<pkg>）
  ├─ package.json：name + exports["."]/["./client"] + dsh.client{platform:'web'}
  │    （dsh.bundle.patch 声明让 add 时 reconcile 自动挂入 bundle 层——ui-hello 即此形态）
  ├─ src/index.ts（node 半）+ src/client/index.ts（browser 半）
  └─ 自带构建产出 lib/index.js + lib/client.js
        │ ① 安装：dsh plugin --profile web-poc add link:<绝对路径>
        │    （pnpm forwarder，symlink 进 profile/node_modules，写入 dependencies；
        │     web-poc 是手写的 web 等价 fork，不动现有 web profile，见下节）
        ▼
web-poc 目录（ctx.baseUrl）能 resolve 到插件
        │ ② 挂载：带 dsh.bundle 声明 → add 时 reconcilePlugins 自动挂入
        │    dsh.profile.bundles，insert row 随 bundle 层生效（无需 --patch；
        │    无声明的普通插件才用 --patch overlay / profile patch 另给 insert row）
        ▼
Loader tree 出现 enabled entry
        │ ③ ClientModuleRegistry 运行时扫描 ctx.loader.entries()
        ▼
读 package.json 的 dsh.client + exports["./client"] → 进入 window.__DSH_BOOT__ graph
        │ ④ serve 为 /plugins/<id>/client.js，浏览器动态 fetch
        ▼
浏览器加载 bundle（sourcemap 内嵌，可断点）
```

## 前端插件不 fork、不改源码的三个前置条件

1. **必须 install 进 profile**：`resolveMeta` 用 `ctx.baseUrl` 的 `createRequire` 解析 `<pkg>/package.json`；`healProfilesModuleFallback` 只维护 dsh app 依赖闭包的 symlink，**仓外自定义包不覆盖**，必须经 `dsh plugin add`（pnpm forwarder）显式安装。`link:` 是 symlink（源目录编辑直接可见，dev 正解），`file:` 是复制。
2. **必须自带构建产物**：`initialBundleRevision` 会 `readFileSync(clientPath)`，缺 `lib/client.js` 抛 `MissingClientBundleError`（激活期大声失败，非静默错乱）。dsh 仓内 `dev-web.ts` 不扫仓外 `packages/`，构建须由 my-dsh 侧自跑 watcher 完成；重写后 dsh 的 client-HMR stat-poll（经 symlink 直达仓外路径）→ SSE → 浏览器刷新。
3. **声明必须含 `dsh.client.platform: "web"`**：否则 `resolveMeta` 判定为非 client 包。

## 两个隐蔽闭环点

- **前端 client row 的 entry name 必须恰为包名**：子路径 entry（如 `pkg/gateway`）会使 `require.resolve('<spec>/package.json')` 失败，被永久判 null。多个后端 entry 可用子路径行，但前端插件必须用包名行。
- **纯前端插件也需要最小 node 半**：loader entry 要 import 包主入口，缺 `lib/index.js` 则 fiber 建不起来。

## install 落点与 profile 隔离（装到哪个 profile）

挂载（组合树）与解析（`createRequire(ctx.baseUrl)` 可达）是两件事，而解析在结构上要求 install 落在某个 profile 的 node_modules——「零污染」的真实自由度只在**落点**：

| 落点 | 是否动现有状态 | 适用 |
|---|---|---|
| 现有 `web`/`headless` profile | 动（dependencies / bundles / node_modules） | 已排除（边界：不动现有 profile） |
| `DSH_HOME` 沙箱里的全新 `web` | 原 home 零接触 | **当前选择**（2026-08-26 已实测：沙箱 add + dump-config 通过） |
| fork 的 `web-poc` | 只新增目录 | 备选（不想每次启动带 `DSH_HOME` 时用） |

- **带 `dsh.bundle` 声明的包（ui-hello 形态）**：`add` 一次完成解析 + 挂载 + 持久化（`reconcilePlugins` 自动挂入 bundles 层），`--patch` 完全不需要；`--patch` 是给**无声明**普通插件补 insert row 的通道（add 只装不挂，会警告「installed as a plain dependency」）。
- **fork 的陷阱——模板按名字查**：`PROFILE_TEMPLATES` 只有 `web`/`headless` 两键。直接 `dsh --profile web-poc` 抛「does not exist」；`dsh plugin --profile web-poc add` 创建走 `DEFAULT_PROFILE_BUNDLES`（仅 `dsh-base`，无 `dsh-web-app`，起不了 web UI）。正解 = 手写三文件：`package.json`（bundles 抄 web 模板）、空 `cordis.patch.yml`、`pnpm-workspace.yaml`（`nodeLinker: hoisted`）；已初始化过 web 则复制目录改名等价。
- **fork 很轻**：bundle 不装在 profile 里，`healProfilesModuleFallback` 维护共享层 `$DSH_HOME/profiles/node_modules`（app 依赖闭包 symlink），所有 profile 共享解析——fork 目录是「清单」不是「安装」。
- **`DSH_HOME` 沙箱**：`resolveDshHome` 优先级 configured > `$DSH_HOME` > `~/.dsh`；指到 `my-dsh/.dsh-home` 后沙箱内 profile 名仍叫 `web`（命中模板，auto-init 正确），删目录即回滚。沙箱是**持久** home 而非临时目录（`initProfile` 双重幂等，重启不重跑 pnpm）；断点映射与热更新链路均与 home 位置无关，唯一成本是每次启动带 `DSH_HOME`（漏配则静默连默认 home，插件「全部不存在」）。
- **overlay 不热重载**：`--patch` 文件启动时一次性读入（`composeLive` 复用已解析 overlays），热重载只覆盖 profile patch 与 home patch 两个用户层文件；bundle 层 patch 同样不被 watch。

## 构建契约（仓外 client bundle 怎么做）

dsh 仓内的 `packages/client/tsdown.client.ts` preset 有 3 个仓内相对导入 + 硬编码 glob `packages/*/*/package.json`，**不能直接按字面复制**。两条路线：

- **路线 A（最小契约，推荐起步）**：手写约 40 行 tsdown 配置，复刻 4 个 wire 契约——① 输出 `lib/client.js`（CJS、`platform:'browser'`、`entryFileNames:'client.js'`、`sourcemap:true`）；② closure-factory 三段包装（`banner` 开工厂 + `intro` 定义 `module`/`exports` + `footer` 返回 `module.exports`，**顺序不可错**）；③ externals = baseline 模块表 + 自身 `dsh.client.external`，其余内联；④ env define（`process.env.NODE_ENV`、`import.meta.env.MODE`、`import.meta.env` 三键，truthiness 键最易漏）。唯一上游漂移点 = baseline externals 两个小常量列表（`PLATFORM_MODULES` + `PRELOADED_CLIENT_EXTERNALS`）。
- **路线 B（完整 preset 复制）**：把 preset 连同 3 个依赖文件整体复制进 my-dsh，且 my-dsh 采用 `packages/<group>/<pkg>` 布局以匹配 `workspaceManifest` 的 glob 约定。获得 CSS Modules / purity gate 全部能力，但承担跟随上游演进成本。

## 与相邻单元的关系（依赖谁 / 被谁依赖）

- **与组合层的关系**（见 [composition-layer.zh.md](composition-layer.zh.md)）：仓外插件挂载完全复用组合层的 patch 机制——bundle 层、profile patch、`--patch` overlay 是**同构**的 insert 通道，仓外插件只是把 insert row 写在用户侧而非 bundle 侧。
- **与能力缝的关系**（见 [seam-structure.zh.md](seam-structure.zh.md)）：前端面板若需要 host 数据（如文件树需要文件列表，而 `host.listDirectory` 只列目录），走 `ctx.webServer.register` 自建路由（对齐 client-modules 的 `/plugins` 模式），而非 apiproxy（其 RPC 方法表是编译期 hardcode）。
- **跨插件协作**：client bundle purity gate 禁止跨插件 value import，跨插件协作走 cordis services（四 share 模型）。

## 我曾经的误解（原以为 → 实际是 → 修正来源）

1. **原以为** 前端插件要挂到 web profile，必须 fork web-app bundle 或改 dsh 源码（Critic 初判）；**实际是** `ClientModuleRegistry` 运行时扫描 `ctx.loader.entries()`，`--patch` overlay 与 bundle 层同构，仓外插件通过 insert row 即可挂载，无需 fork。修正来源：`packages/client/modules/src/index.ts` 的 `processOne`/`resolveMeta` + `apps/web/vite.config.ts` 注释。
2. **原以为** 仓外插件装进去就能直接跑；**实际是** 必须同时满足「install 进 profile + 自带构建产物 + `platform:'web'`」三个前置条件，缺一不可。修正来源：`resolveMeta` 与 `initialBundleRevision` 源码。
3. **原以为** 仓外构建可直接复用 dsh 的 tsdown client preset；**实际是** preset 有仓内相对导入 + 硬编码 `packages/*/*` glob，需改为「手写最小契约」或「整套复制 + 布局约定」。修正来源：`packages/client/tsdown.client.ts` 的 `workspaceManifest()`。
4. **原以为** `--patch` 与 `dsh plugin add` 是并列二选一的挂载通道；**实际是** 二者分工不同——`--patch` 只管组合树挂载、add 管模块解析（`createRequire(ctx.baseUrl)`），且带 `dsh.bundle` 声明的包 add 后连 `--patch` 都不需要。修正来源：`resolveMeta` + `reconcilePlugins` 源码；[journal 2026-08-26-03](../../journal/2026-08-26-03-install-target-and-profile-isolation.md)。
5. **原以为** fork 一个 web 等价 profile 就是起个新名字让 dsh 自动建；**实际是** 模板按名字查（`PROFILE_TEMPLATES` 只有 web/headless 两键），新名字会被初始化成 DEFAULT profile（无 web-app，起不了 web UI），必须手写三文件或复制现有 web 目录。修正来源：`profile.ts` 的 `PROFILE_TEMPLATES`/`DEFAULT_PROFILE_BUNDLES`/`loadProfile`。

## 验证方式

- 前端注入的 PoC（阶段 5 动手时执行）：装一个极简 `dsh.client` 插件 → `dsh web` 启动 → 浏览器检查 `window.__DSH_BOOT__.entries`（id/url/rev/external）确认图行 → `GET /plugins/<id>/client.js` 应返回 200（404 = 注册了但 bundle 未构建）。
- 组合树验证（boot-free）：`dsh --profile web --dump-config [--patch x.yml]` 确认 insert row 进入组合树。
- 失败形态：缺 bundle 时启动聚合错误 `ClientPackageCompositionError` 点名缺 bundle 的包与路径。

## 遗留问题（登记进 questions.zh.md）

- 前端注入链路：沙箱侧已实证到组合树（`dump-config` 出现 ui-hello insert row），浏览器侧面板验证留待阶段 5 动手。
- DSH_HOME 沙箱已实测搭建（add + dump-config 通过）；fork `web-poc` 备选路线未实测。
- baseline externals 两个常量列表的上游漂移需建立对照检查（升级 dsh 时核对 `platform.ts`）。
