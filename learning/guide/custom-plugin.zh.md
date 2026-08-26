# 自定义 dsh 插件开发指导手册

状态：草稿 v1（2026-08-26 基于 CMR 团队 Builder/Critic 两轮源码查证；可行性结论已由源码核对，代码骨架与做法待 PoC 实证后回填「已验证」标注）｜构建链路已验证（2026-08-26 PoC：`ui-hello` 插件在 my-dsh 仓外成功构建出 `lib/index.js` + `lib/client.js`，见第 8 节）｜install 落点：DSH_HOME 沙箱（2026-08-26 已实测搭建：沙箱内 `add` + `dump-config` 通过，见 4.4 与第 8 节；备选 fork `web-poc`）

本文是**长期使用的操作手册**：回答「如何在 dsh 仓外开发自定义插件」，覆盖可行性分析、整体方案、思路与具体做法。与 [notes/architecture/out-of-tree-plugin.zh.md](../notes/architecture/out-of-tree-plugin.zh.md)（认知单元）的分工：那份笔记记录「我如何理解这套机制」，本文记录「我以后照着怎么做」。事实源仍是 dsh 源码与正式文档，本文只做导航与做法编排。

## 1. 需求与约束

四个要求（也是本文的验收标准）：

1. **零污染 dsh 源码**：插件放在 dsh 仓外（如 `D:\Tech\Github\deepseek\deepseek-harness\fork\my-dsh\packages`），避免与快速迭代的 dsh 上游冲突。
2. **纯后端 + 前端插件都支持**：前端插件要能挂到现有 web UI 页面（如加文件树面板）。
3. **可断点 debug**：Node 半与浏览器半都能设断点。
4. **对齐 dsh 做法**：命名、检查（jsdoc/lint/typecheck）等尽量对齐。
5. **不动现有 profile**：`web`/`headless` 两个现有 profile 的任何持久状态（dependencies / `dsh.profile.bundles` / node_modules）不因插件开发被改动——install 落点用 `DSH_HOME` 沙箱（见 4.4），备选 fork `web-poc`。

## 2. 可行性分析（结论 + 依据）

**四个要求全部可满足。** 关键结论与依据：

| 要求 | 结论 | 依据 |
|---|---|---|
| 零污染 | 可行 | profile/plugin 机制原生支持仓外插件；`dsh plugin` 是 pnpm forwarder，`link:` 安装把仓外源目录 symlink 进 profile |
| 前端插件挂 web UI（不改源码、不动现有 profile） | **可行，无需 fork、无需改源码** | 浏览器 roster 是**运行时扫描** `ctx.loader.entries()`，不是构建期写死清单；install 落点用 `DSH_HOME` 沙箱（见 4.4） |
| 断点 debug | 可行 | Node 侧 tsx source launch + `--inspect`；浏览器侧 sourcemap 内嵌 `sourcesContent` |
| 对齐 dsh | 可行（部分自建） | `verify-export-jsdoc` 脚本可直调；lint/typecheck 需在 my-dsh 侧独立配置 |

### 2.1 最重要的一个事实：前端插件是「运行时注入」，不是「构建期打包」

这是整个方案成立的根基，也是最初最容易被误判的地方（Critic 曾误判「必须 fork web-app bundle 或改 dsh 源码」，后经源码核对推翻）：

- `packages/client/modules/src/index.ts` 的 `ClientModuleRegistry` 在**运行时**遍历 `ctx.loader.entries()`（`processOne`，第 482–499 行），只认三个条件：enabled 的 entry + `package.json` 声明 `dsh.client` + `exports["./client"]`。**它不区分 entry 来自 bundle 层、profile patch 还是 `--patch` overlay**。
- `packages/bundle/web-app/cordis.patch.yml` 里的 `dsh.client` rows（第 45–46 行注释：`dsh.client rows are the browser roster the modules node half scans into window.__DSH_BOOT__`）只是**多层 patch 中的一层 insert**，`--patch` overlay 走的是**同一套** `composeProfile → composeEntries → applyEntryPatches` 算法。
- `apps/web/vite.config.ts` 第 159–160 行注释明写：前端插件「never enter this graph; they arrive as runtime bundles through the client module system」。

因此：**仓外插件挂到 web UI 与官方 `ui-*` 插件在加载机制上完全同构**——带 `dsh.bundle` 声明的包由 `add` 自动挂入 bundle 层（`ui-hello` 即此形态，无需 `--patch`）；无声明插件用 `--patch` overlay 的 insert row（`name` = 包名），只是 row 写在用户侧而非 bundle 侧。

唯一需要 fork 的场景：修改官方 `ui-*` 包的**内部**（如改 `SidebarRoot` 的 DOM 结构）——那应 fork 具体的 ui 包，而非 web profile / bundle。

## 3. 整体方案

### 3.1 仓外项目布局（my-dsh）

对齐 dsh 的 `packages/<group>/<pkg>` 三段布局。这不是美观问题，而是为了复用 dsh 的扫描约定（`verify-export-jsdoc` 的 glob、`workspaceManifest` 的 glob 都以 `packages/*/*/package.json` 为模式）：

```
my-dsh/
├── package.json             # 私有 workspace 根
├── pnpm-workspace.yaml      # packages/*/*
├── tsconfig.base.json       # 对齐 dsh 的 strict + NodeNext
├── packages/
│   ├── client/ui-filetree/  # 前端插件（dsh.client 双半包）
│   └── tools/tool-mcp-foo/  # 纯后端插件
├── overlays/
│   └── web-filetree.yml     # --patch overlay（实验用）
├── .dsh-home/               # DSH_HOME 沙箱（已 gitignore，删目录即回滚，见 4.4）
└── scripts/
    ├── verify-export-jsdoc.ts  # 复制或直调 dsh 仓脚本
    ├── dev-web.ts              # 复制并改 root 指向 my-dsh
    └── dev-web.cmd             # 沙箱启动封装（set DSH_HOME + pnpm dsh web）
```

### 3.2 接入链路（一图流）

```
仓外插件包（my-dsh/packages/<group>/<pkg>）
  ├─ package.json：name + exports["."]/["./client"] + dsh.client{platform:'web'}
  │                 （dsh.bundle.patch 声明让 add 时 reconcile 自动挂入 bundle 层——ui-hello 即此形态）
  ├─ src/index.ts（node 半）+ src/client/index.ts（browser 半）
  └─ 自带构建产出 lib/index.js + lib/client.js
        │ ① 安装：set "DSH_HOME=<my-dsh>/.dsh-home" 后
        │    dsh plugin --profile web add link:<绝对路径>
        │    （pnpm forwarder，symlink 进沙箱 profile/node_modules；
        │     沙箱内名仍叫 web，auto-init 正确的 web 模板，见 4.4）
        ▼
沙箱 profile 目录（ctx.baseUrl）能 resolve 到插件
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

### 3.3 纯后端插件 vs 前端插件

- **纯后端插件** = 普通 Cordis 插件包：`src/index.ts` 导出 `apply(ctx)`，靠 `inject`/`ctx.effect`/`ctx.on` 挂扩展点。挂载走 `--patch` overlay 的 insert row（`name` = 包名，或包名 + 子路径如 `pkg/startup`）。
- **前端插件** = 双半包：node 半（最小 `apply`，让 loader 能 import 到它）+ browser 半（`exports["./client"]` 指向 `lib/client.js`，声明 `dsh.client`）。

## 4. 具体做法

### 4.1 前端插件包骨架（以 ui-filetree 为例）

`package.json`（对齐 `packages/client/ui-jobs/package.json` 的真实结构）：

```jsonc
{
  "name": "@my-org/dsh-client-ui-filetree",
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./package.json": "./package.json"
  },
  "dsh": {
    "client": {
      "platform": "web",            // 必须；resolveMeta 据此判定 client 包
      "inject": [                    // 可选：fiber 到达的信息性边
        "@deepseek-ai/dsh-client-runtime"
      ]
    }
  },
  "scripts": { "bundle": "tsdown", "watch": "tsdown --watch" },
  "peerDependencies": {
    "@deepseek-ai/cordis": "workspace:^",
    "@deepseek-ai/dsh-client-runtime": "workspace:^"
  },
  "files": ["lib/index.js", "lib/client.js", "lib/types/**/*.d.ts"]
}
```

`src/index.ts`（node 半，纯 UI 插件最小形态）：

```ts
/**
 * File tree plugin, node half. The empty apply exists so the plugin appears
 * in the Loader; the browser half ships via exports["./client"].
 */
export function apply(): void {}
```

`src/client/index.ts`（browser 半，注入文件树面板到 slot）：

```ts
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { FileTreePanel } from './FileTreePanel.tsx'

/** Required services for the slot contribution. */
export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  // 挂到 sidebar.footer.action（list 类 slot），或选择其他已声明 slot
  ctx.slots.inject(
    'sidebar.footer.action',
    () => ctx.slots.register({
      name: 'sidebar.footer.action',
      id: 'file-tree',
      order: 30,
    }, FileTreePanel),
  )
}
```

**slot 挂载点**（来自 `packages/client/ui-sidebar/src/client/contract/slots.ts`）：sidebar 已声明的扩展点有 `sidebar.brand.mark` / `sidebar.brand.name` / `sidebar.workspaces` / `sidebar.settings`（均 `kind:'single'`）、`sidebar.footer.action`（`kind:'list'`）。文件树面板若做在侧栏，优先选 `sidebar.footer.action`（list）或 `sidebar.workspaces`（single，替换工作区浏览区）；若要主区域新面板，参考 `ui-layout` 的区域 slot 后占位。

### 4.2 挂载（取决于插件是否声明 `dsh.bundle`）

挂载与解析是两件事（见踩坑 1、13、14 与 [notes「install 落点」](../notes/architecture/out-of-tree-plugin.zh.md)一节）：install 进 profile 只解决**解析**（`createRequire(ctx.baseUrl)` 可达）；组合树里的 **insert row 由谁提供**，取决于插件形态。

**带 `dsh.bundle` 声明（`ui-hello` 即此形态，前端插件推荐）**：包自带 `cordis.patch.yml`（insert row，`name` = 包名）：

```jsonc
// package.json 里
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": { "platform": "web" }
}
```

```yaml
# cordis.patch.yml
- insert:
    - id: ui-filetree
      name: '@my-org/dsh-client-ui-filetree'
```

`dsh plugin --profile web add link:<绝对路径>`（沙箱 env 下，见 4.4）一次完成解析 + 挂载 + 持久化：`reconcilePlugins` 自动把声明了 `dsh.bundle` 的依赖追加进 `dsh.profile.bundles`，insert row 随 bundle 层生效。**`--patch` 完全不需要。**

**无声明（普通插件）**：`add` 只装不挂（dsh 会警告「installed as a plain dependency, not a profile layer」——预期行为），insert row 需另给：`dsh web --patch overlays/web-filetree.yml`（overlay 写 insert row）。注意 overlay 是启动时一次性读入、不热重载（重启生效，见踩坑 14）。

### 4.3 构建（客户端 bundle 契约）

dsh 仓内的 `packages/client/tsdown.client.ts` preset 有 3 个仓内相对导入 + 硬编码 glob `packages/*/*/package.json`，**不能直接按字面复制**。两条路线：

**路线 A（最小契约，推荐起步）**：手写约 40 行 tsdown 配置，复刻 4 个 wire 契约：

1. 输出 `lib/client.js`：`entryFileNames: 'client.js'`、`format: 'cjs'`、`platform: 'browser'`、`sourcemap: true`、`clean: false`（不能 clean，否则清掉 node 半产物）、`dts: false`。
2. closure-factory 三段包装（**顺序不可错**）：
   - `banner: 'window.__ModuleLoader__.load({ id: "<pkg>", factory: (require) => {'`
   - `intro: 'var module = { exports: {} }; var exports = module.exports;'`（必须在内层先执行）
   - `footer: 'return module.exports; } });'`
3. externals 规则：baseline 模块表 + 自身 `dsh.client.external` 保持 import，其余全部内联。baseline 常量（来自 `packages/client/web/src/platform.ts`，升级 dsh 时对照此文件）：
   - `PLATFORM_MODULES` = `react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`
   - `PRELOADED_CLIENT_EXTERNALS` = `@deepseek-ai/dsh-client-runtime/client`
4. env define（三键都要，truthiness 键最易漏）：`process.env.NODE_ENV`、`import.meta.env.MODE`、`import.meta.env`（zustand 会 probe `import.meta.env ? import.meta.env.MODE : ...`）。

**路线 B（完整 preset 复制）**：把 `tsdown.client.ts` 连同 3 个依赖文件（`modules/src/client/manifest.ts`、`web/src/platform.ts`、`scripts/client-build-environment.ts`）整体复制进 my-dsh，且 my-dsh 采用 `packages/<group>/<pkg>` 布局。获得 CSS Modules / purity gate 全部能力，但承担跟随上游演进成本。需要 CSS Modules 走 B，纯逻辑/简单 UI 走 A。

**无论哪条路线**，都必须同时产出 node 半 `lib/index.js`（loader entry 要 `import(this.options.name)`，缺它则 fiber 建不起来，更谈不上被扫描为 client row）。

### 4.4 安装（落点：DSH_HOME 沙箱，已实测）

**边界与思路**：不动现有 `web`/`headless` profile 的任何持久状态，也不手写任何 profile 文件——把整个 home 指到沙箱目录，沙箱内 profile 名仍叫 `web`（命中 `PROFILE_TEMPLATES`，`loadProfile` 自动初始化为正确的 web 模板）。`resolveDshHome` 优先级 configured > `$DSH_HOME` 环境变量 > `~/.dsh`。

**沙箱路径约定**：`my-dsh/.dsh-home`（已加入 my-dsh 的 `.gitignore`）。

**首次安装**（先完整构建一次，`lib/index.js` + `lib/client.js` 必须存在）：

```cmd
set "DSH_HOME=d:\...\my-dsh\.dsh-home"
dsh plugin --profile web add link:<my-dsh 包绝对路径>
```

实测（2026-08-26，`ui-hello`）：首跑自动初始化 `my-dsh/.dsh-home/profiles/web`（三件套 + pnpm-lock + node_modules symlink），pnpm `link:` 1.4s 完成，reconcile 把 `@my-org/dsh-client-ui-hello` 挂进 `dsh.profile.bundles`（与 `dsh-base`/`dsh-web-app` 并列第三层）；`dsh web --dump-config` 组合树出现 `# == @my-org/dsh-client-ui-hello` 的 insert row。原 `~/.dsh` 零接触。

`link:` 是 symlink（源目录编辑直接可见，dev 正解）；`file:` 是复制（改代码需重装，不利于 debug）。相对路径会被 `anchorPathSpec` 锚定到调用 cwd，统一用绝对路径。之后**重启 dsh**（`pkgMeta` 负缓存含「非 client 包」结论，插件集变更只在重启后生效）。

**启动（三选一，都必须带 `DSH_HOME`）**：

- 终端：`my-dsh\scripts\dev-web.cmd`（封装 set + cd dsh 仓 + `pnpm dsh web`，已建）
- VSCode 调试：`my-dsh/.vscode/launch.json` 的「dsh web (DSH_HOME sandbox)」配置（多根工作区 `fork/dsh.code-workspace` 含两个仓，会聚合各 folder 的 launch.json；folder 级配置里 `${workspaceFolder}` 解析为该 folder 自身，见 4.6）
- 手动：`set "DSH_HOME=..."` 后 `pnpm dsh web`（cmd 的 `set` 只对当前会话生效；不建议 `setx` 永久化——会劫持所有不想用沙箱的场合）

**沙箱的持久性（不是临时目录）**：`initProfile` 双重幂等（`loadProfile` 只在 package.json 缺失时 init；`initProfile` 内部逐文件 `existsSync` 才写），装好的 profile/依赖/symlink 持久复用，重启不重跑 pnpm。每次启动仅有的写入：重写 root config `cordis.yml`（内容恒定的空 entry list，非状态变化）+ `healProfilesModuleFallback` 幂等维护共享层 symlink（沙箱**首次**启动从零建 app 依赖闭包链接，稍慢，之后只校验修复）。删掉 `.dsh-home` 即完全回滚，重建只需重跑一次 `add`。

**注意**：沙箱里 session 数据从零开始（不共享 `~/.dsh` 的历史 session；API key 是环境变量，不受影响）。

**备选：fork `web-poc` profile**（不想每次启动带 `DSH_HOME` 时用）：在**默认 home** 下手写 `$DSH_HOME/profiles/web-poc/` 三文件（模板按名字查，新名字不能靠命令初始化成 web，见踩坑 13）——`package.json`（`dsh.profile.bundles` 抄 web 模板 `["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]`）+ 空 `cordis.patch.yml` + `pnpm-workspace.yaml`（`nodeLinker: hoisted` + `autoInstallPeers: false`，仓外插件 peer 解析的关键，不能省）；已初始化过 web 则复制目录改名等价。之后 `dsh plugin --profile web-poc add link:...` + `dsh --profile web-poc` 启动，无需任何环境变量。fork 很轻：bundle 不装在 profile 里，由 `$DSH_HOME/profiles/node_modules` 共享层解析。

### 4.5 dev 循环（热更新）

1. my-dsh 侧跑自己的 watcher（`tsdown --watch`），重写 `lib/client.js`（**不需要 `DSH_HOME`**——watcher 只看本地文件）；
2. 沙箱方式启动 dsh web（`my-dsh\scripts\dev-web.cmd` 或 VSCode 调试配置，见 4.4；web-app bundle 自带 HMR row）；
3. 源码编辑 → watcher 重写 bundle → dsh 的 client-HMR stat-poll（每 500ms `statSync(clientPath)`）→ `rebuilt(id)` → SSE 广播 → 浏览器刷新。

边界：node 半（`lib/index.js`）变更不走 HMR，需重启 dsh；`inject`/`external` 声明变更同样需重启。**热更新链路与 DSH_HOME 位置无关**：`clientPath` 解析自沙箱 profile 的 symlink，但 stat/读取锚定的是 my-dsh 的同一个物理文件——symlink 建在哪个 home，poll 看到的都是它。

### 4.6 断点 debug

- **Node 半（host 进程）**：调试配置只建一份，在 `my-dsh/.vscode/launch.json`（配置跟开发仓走，可入库）。开发用多根工作区 `fork/dsh.code-workspace`（folders = dsh 仓 + my-dsh）——多根工作区聚合各 folder 的 launch.json，folder 级配置里 `${workspaceFolder}` 解析为该 folder 自身，故 `program`/`cwd` 写 `${workspaceFolder}/../deepseek-harness/apps/cli/src/bin.ts`（`--import tsx/esm` 要从 dsh 仓的 node_modules 解析，cwd 必须指回 dsh 仓）。配置要素：`runtimeArgs: ["--import", "tsx/esm"]` + `stopOnEntry: true` + **`env.DSH_HOME: ${workspaceFolder}/.dsh-home`**。漏配 env 的症状隐蔽：调试进程静默连默认 `~/.dsh`，沙箱里装的插件「全部不存在」，看起来像插件坏了（踩坑 15）。`link:` 安装使 sourcemap 把断点映射回 my-dsh 的 TS 源——映射链（symlink → 真实路径 → sourcemap）与 home 位置无关。
- **浏览器半**：**不要用 Node 调试器**——`src/client/index.ts` 由浏览器通过 `window.__ModuleLoader__.load` 执行，Node 进程（`type: "node"`）永远执行不到，断点显示「未绑定」是环境错配而非代码问题。正确做法：用浏览器 DevTools（F12 → Sources），靠 `lib/client.js` 的 sourcemap（`sources` 是相对路径 `../src/client/index.ts`，且内嵌 `sourcesContent`）直接断在**源文件**上。实测（2026-08-26）：DevTools 里源文件显示为 `src/client/index.ts` 原始 TS 源码，断点命中。注意插件是页面加载时注入执行，改断点后要刷新页面（F5）重新触发 `apply`。路线 A 手写 config 已带 `sourcemap: true`，无需额外路径映射（sourcemap 的 `sources` 相对 `lib/` 解析，正好指回 `src/`）。

### 4.7 检查对齐

- `verify-export-jsdoc`：直接 `tsx` 调用 dsh 仓脚本的导出函数 `collectExportJsdocViolations('<my-dsh 绝对路径>')`（布局同构使其开箱即用），或复制脚本。
- lint（oxlint）/ typecheck / vitest：独立配置于 my-dsh，沿用 dsh 的 `.oxlintrc` 主体与 strict tsconfig。
- `verify-cordis-config` 类约束（bare plugin 必须在 resolver manifest 的 dependencies 中）：仓外场景由 pnpm 安装本身满足。

## 5. 踩坑清单（易错点）

1. **三个前置条件缺一不可**（前端插件）：
   - 必须 install 进 profile（`healProfilesModuleFallback` 只维护 dsh app 依赖闭包，**不覆盖仓外自定义包**，必须显式 install）。
   - 必须自带构建出 `exports["./client"]` 指向的 `lib/client.js`（否则 `initialBundleRevision` 抛 `MissingClientBundleError`，激活期大声失败）。
   - 声明必须含 `dsh.client.platform: "web"`。
2. **entry name 必须恰为包名**（前端 client row）：子路径 entry（如 `pkg/gateway`）会使 `require.resolve('<spec>/package.json')` 失败，被永久判 null。多个后端 entry 可用子路径行，但前端插件必须用包名行。
3. **closure-factory 三段顺序**：`intro`（定义 `module`/`exports`）必须在内层先执行，`banner` 开工厂、`footer` 返回——顺序错会导致 `module` 未定义。
4. **env define 的 truthiness 键**：`import.meta.env` 这个裸键（非 `.MODE`）是 zustand 的 truthiness probe 所需，漏掉会 `ReferenceError`。
5. **client bundle purity**：跨插件 value import 在构建期硬失败（`dsh-client-bundle-purity` gate），跨插件协作走 cordis services（`inject` + `ctx.slots`）。
6. **忘重启**：install 后或声明变更后不重启 → 「装了但没生效」（负缓存）。诊断第一步：`dsh web --dump-config`（沙箱 env 下）+ 重启。
7. **`link:` 指绝对路径**：my-dsh 目录移动后 symlink 失效，需重新 `dsh plugin add link:`。
8. **文件树需要文件列表**：`host.listDirectory` 只列目录不列文件，文件树若要文件条目须自建后端路由（`ctx.webServer.register`，对齐 client-modules 的 `/plugins` 模式），而非 apiproxy（其 RPC 方法表编译期 hardcode，仓外插件不能追加方法）。
9. **依赖版本精确锁定对齐 dsh，不要用 `^` 放任漂移**：`"tsdown": "^0.22.2"` 会被 pnpm 解析到 `0.22.14`（rolldown 1.1.5→1.2.5），在 Node 22 下触发 `.ts` 配置加载 bug（报错建议 `--config-loader tsx` 或升级 Node 24，均为误判）。正解是精确锁 `"tsdown": "0.22.2"` 对齐 dsh 仓 lockfile，Node 22 下直接 `tsdown` 即可。**教训**：仓外依赖版本应以 dsh 仓 lockfile 为准，而非 `^` 最新。
10. **pnpm 10+ 会拦截 esbuild 的 install script**：`strictDepBuilds` 默认拦截带 build script 的依赖（esbuild 原生二进制），报 `ERR_PNPM_IGNORED_BUILDS`。在 `pnpm-workspace.yaml` 加 `allowBuilds: esbuild: true`（对齐 dsh 仓做法）。
11. **tsdown 配置注释里别写 `packages/*/*`**：块注释中 `/*` 序列会干扰 esbuild 的注释解析，报 `Unexpected "*"`。改写成 `packages/<group>/<pkg>` 等不含 `*/` 的表述。
12. **node 半必须由构建产出**：路线 A 手写 config 若只配 `entry: { client }` 会漏掉 `lib/index.js`，loader entry 无法 import、fiber 建不起来。用 tsdown 数组导出两个 config（node 半 ESM/platform node/target es2024 + client 半），且两个都要 `clean: false`（先跑 node 半、后跑 client 半，后者默认 clean 会清掉前者）。
13. **fork profile 的模板陷阱**：`PROFILE_TEMPLATES` 按名字查（仅 `web`/`headless` 两键），新名字（如 `web-poc`）经 `dsh plugin --profile <name> add` 初始化走 `DEFAULT_PROFILE_BUNDLES`（仅 `dsh-base`，无 `dsh-web-app`，起不了 web UI）；直接 `dsh --profile <name>` 则抛「does not exist」。fork web 等价 profile 必须手写三文件或复制现有 web 目录（见 4.4）。
14. **`--patch` overlay 不热重载**：`watchUserPatches` 只盯 profile 的 `cordis.patch.yml` 与 `$DSH_HOME/cordis.patch.yml` 两个用户层文件，overlay 是启动时一次性读入（`composeLive` 复用已解析结果）——改 overlay 必须重启；bundle 层 patch 同样不被 watch。
15. **沙箱忘带 `DSH_HOME` 的隐蔽症状**：终端/VSCode 调试/脚本任一启动方式漏了 `DSH_HOME`，dsh 静默连默认 `~/.dsh`——沙箱里装的插件「全部不存在」，看起来像插件坏了。排查第一步：确认该启动进程的环境变量；沙箱 profile 实际位置是 `my-dsh/.dsh-home/profiles/web`。三个启动入口（dev-web.cmd / launch.json / 手动 set）都已封装，风险集中在自己临时开终端时。
16. **NodeNext 下相对导入别写 `.tsx` 后缀**：`moduleResolution: "NodeNext"` + `verbatimModuleSyntax` 下，`import { X } from './X.tsx'` 报「找不到模块」（`.tsx` 结尾被禁止，除非 `allowImportingTsExtensions`），不带后缀又报「ESM 需带扩展名」。正解是写 **`.js` 后缀**（`'./X.js'`），NodeNext 自动映射到 `.tsx` 源文件。这是从 `bundler` 切到 `NodeNext` 时最高频的迁移坑，`tsc --noEmit` 报 TS5097 即此。
17. **VS Code 任务 cwd 三连坑（多根工作区）**：① `npm` 任务类型不接受 `path` 也不接受顶层 `cwd`（它会自行定位 package.json）；② `shell` 任务的 `cwd` 必须写在 `options.cwd` 而非顶层；③ 多根 workspace（`.code-workspace` 多 folder）下 `${workspaceFolder}` 会被当相对路径拼接，须用带限定符的 `${workspaceFolder:<文件夹名>}`。可用形态：`{"type":"shell","command":"pnpm run build","options":{"cwd":"${workspaceFolder:my-dsh}"}}`。

## 6. 诊断速查

| 现象 | 排查 |
|---|---|
| 装了但没生效 | 重启 dsh（负缓存）；`dsh web --dump-config`（沙箱 env 下）确认 insert row 进入组合树；确认启动进程带了 `DSH_HOME`（踩坑 15） |
| 启动报 `ClientPackageCompositionError` | 缺 bundle（`lib/client.js` 未构建），看报错点名的包与路径 |
| `GET /plugins/<id>/client.js` 返回 404 | 注册了但 bundle 不可读（未构建） |
| 浏览器无面板 | 检查 `window.__DSH_BOOT__.entries`（id/url/rev/external）确认图行；确认 slot 名与 `kind`（single/list）匹配 |

## 7. 上游漂移风险与应对

- **baseline externals 漂移**（路线 A 唯一硬漂移点）：升级 dsh 后模块表基线变化 → 本应 external 的包被内联。应对：升级 dsh 时对照 `packages/client/web/src/platform.ts`。
- **slot 契约 / `dsh.client` 字段 / Service Definition API 变化**：dsh 处 pre-release 姿态，可能 rename/repack。应对：依赖 Service Definitions 而非具体 providers；peerDependencies 不锁死版本；把 dsh 升级作为 my-dsh 的例行检查。

## 8. 待验证（PoC 后再回填）

- [x] 路线 A 手写 tsdown 契约实测（closure-factory 三段 + env define 三键 + node 半数组导出）——已验证（2026-08-26，`ui-hello` 构建产出 `lib/index.js` + `lib/client.js`，产物核对正确）。
- [x] 依赖版本锁定（`tsdown` 精确 `0.22.2`）——已验证，Node 22 下无需 `--config-loader`。
- [x] DSH_HOME 沙箱路线实测——已验证（2026-08-26：`add` 自动初始化沙箱 web profile + reconcile 挂入 bundles 第三层 + `dump-config` 组合树出现 ui-hello insert row；原 `~/.dsh` 零接触；dev-web.cmd / launch.json / .gitignore 已搭好）。
- [x] 前端注入链路 PoC（浏览器侧）——已验证（2026-08-26：DevTools 中 `src/client/index.ts` 源文件可见、sourcemap 断点命中、时钟面板渲染；详见 [journal 05](../journal/2026-08-26-05-browser-debug-and-ide-tooling.md)）。
- [ ] fork `web-poc` 备选路线实测（不需要 env 的替代落点）。
- [ ] 文件树面板的具体 slot 选型与数据通道（`ctx.webServer.register` 路由）。
- [ ] Windows 下 `link:` symlink + `healProfilesModuleFallback` 共存的实测（部分已随沙箱 `dump-config` 通过，浏览器侧待验）。

## 事实源（链接）

- [packages/client/modules/src/index.ts](../../packages/client/modules/src/index.ts) — `ClientModuleRegistry` 的 `processOne`/`resolveMeta`/`initialBundleRevision`
- [packages/client/tsdown.client.ts](../../packages/client/tsdown.client.ts) — client bundle preset（wire 契约）
- [packages/client/web/src/platform.ts](../../packages/client/web/src/platform.ts) — `PLATFORM_MODULES` / `PRELOADED_CLIENT_EXTERNALS`
- [packages/client/ui-jobs/](../../packages/client/ui-jobs/) — 纯 UI 前端插件范例（package.json + node 半 + browser 半）
- [packages/client/ui-sidebar/src/client/contract/slots.ts](../../packages/client/ui-sidebar/src/client/contract/slots.ts) — sidebar slot 扩展点
- [packages/bundle/web-app/cordis.patch.yml](../../packages/bundle/web-app/cordis.patch.yml) — `dsh.client` rows 形态
- [apps/cli/src/plugin.ts](../../apps/cli/src/plugin.ts) — `dsh plugin`（pnpm forwarder + `anchorPathSpec` + `reconcilePlugins`）
- [apps/cli/src/profile-boot.ts](../../apps/cli/src/profile-boot.ts) — overlay insert row 进入 Loader tree 的链路
- [packages/boot/app-boot/src/profile.ts](../../packages/boot/app-boot/src/profile.ts) — `PROFILE_TEMPLATES` / `initProfile` / `loadProfile` / `healProfilesModuleFallback`（profile 初始化与共享模块层）
- [packages/util/home-paths/src/index.ts](../../packages/util/home-paths/src/index.ts) — `resolveDshHome` 优先级（DSH_HOME 沙箱依据）
- 认知单元笔记：[notes/architecture/out-of-tree-plugin.zh.md](../notes/architecture/out-of-tree-plugin.zh.md)
- 认知事件：[journal/2026-08-26-01-out-of-tree-plugin-frontend-injection.md](../journal/2026-08-26-01-out-of-tree-plugin-frontend-injection.md)
