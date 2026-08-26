# 浏览器半断点收尾：Node 断点错位 + `.tsx` 导入报错 + tasks.json cwd 三连坑

日期：2026-08-26

## 起因

[journal 04](2026-08-26-04-dsh-home-sandbox-three-questions-switch.md) 的遗留「浏览器侧 PoC」要收尾：`dev-web.cmd` 启动后确认侧栏时钟面板 + sourcemap 断点。动手时先撞上 `.tsx` 导入报错（IDE 红字「找不到模块 `./HelloPanel.tsx`」），修完后启动调试，又发现 `src/client/index.ts` 里的断点灰色「未绑定」，最后踩进 VS Code tasks.json 的 cwd 三连坑。三件事各有独立价值，合并记录。

## 坑 1：NodeNext 下 `.tsx` 扩展名导入报错

`tsconfig.base.json` 是 `moduleResolution: "NodeNext"` + `verbatimModuleSyntax: true`。在 NodeNext 下，相对导入路径**不允许显式以 `.tsx` 结尾**（除非开启 `allowImportingTsExtensions`，而本项目未开）。

- 症状：`import { HelloPanel } from './HelloPanel.tsx'` 报「找不到模块」。改成不带后缀 `'./HelloPanel'` 也会报（NodeNext 要求 ESM 带扩展名）——两条路都看似堵死。
- 正解：**用 `.js` 后缀**。NodeNext 会自动把 `.js` 映射到对应的 `.ts`/`.tsx` 源文件。`'./HelloPanel.js'` 既满足「带扩展名」又绕开「不允许 `.tsx` 结尾」。
- 验证：`npx tsc --noEmit -p packages/client/ui-hello/tsconfig.json` 由报 TS5097 到零输出。
- 额外收获：`src/index.ts`（node 半）里如果也用相对 `.tsx` 导入，同样要写 `.js` 后缀；纯类型导入（`import type { ReactElement } from 'react'`）不受影响（外部包照常写包名）。

## 坑 2：Node 断点「未绑定」——调试器类型与执行环境错配

修好导入后启动 `dsh web (DSH_HOME sandbox)` 调试，在 `src/client/index.ts:33`（`ctx.slots.inject(...)`）打的断点显示灰色「未绑定」。

- 根因：`launch.json` 是 `type: "node"`，只调试 CLI 的 **Node 进程**；而 `src/client/index.ts` 是**浏览器半**，由浏览器通过 `window.__ModuleLoader__.load`（closure-factory 包装，见 `tsdown.config.ts`）执行，两者分属不同进程，Node 调试器永远覆盖不到。
- 正解：**用浏览器 DevTools**（F12 → Sources）。`lib/client.js` 带 sourcemap（`sources: ["../src/client/HelloPanel.tsx", "../src/client/index.ts"]` + 内嵌 `sourcesContent`），DevTools 把 bundle 映射回源文件，断点直接打在 `src/client/index.ts` 原始 TS 源码上。
- 关键操作细节：插件是**页面加载时注入执行**（`apply` 在模块加载时跑一次）。如果面板已渲染再打断点已经晚了，**刷新页面（F5）** 让插件重新加载执行，断点才会命中。实测刷新后命中。
- 认知校准：`browserSourcePath` 对仓外源码的「路径映射限制」此前被当成需要自己处理 sourcemap 映射的依据——实测**不需要**：路线 A 手写 config 的 sourcemap `sources` 是相对 `lib/` 的 `../src/client/index.ts`，天然指回 my-dsh 的 `src/`，DevTools 开箱即用（已回填 [guide 4.6](../guide/custom-plugin.zh.md)）。

## 坑 3：VS Code tasks.json 的 cwd 三连坑（多根工作区）

给 my-dsh 配 `dev`/`test`/`build` 三个任务，cwd 一路踩坑：

1. **`npm` 类型任务不接受 `path`**：最初写 `"type": "npm"` + `"path": "${workspaceFolder}"`，VS Code 把 `path` 当相对路径拼到默认 cwd 后面，产生 `...\my-dsh\D:\...\my-dsh` 这种不存在的路径。
2. **`npm` 类型也不接受顶层 `cwd`**：改成 `"cwd": "${workspaceFolder}"` 报「不允许属性 cwd」——`npm` 任务类型会自行定位 `package.json`，schema 里根本没有 cwd 字段。
3. **`shell` 类型的 `cwd` 必须在 `options` 里**：改成 `type: "shell"` 后，顶层 `cwd` 仍报「不允许属性 cwd」；正确位置是 `"options": { "cwd": "..." }`（`TaskDescription.options.cwd` 才是 schema 认可的位置）。
4. **多根工作区里 `${workspaceFolder}` 解析异常**：`options.cwd` 写 `${workspaceFolder}` 后，报错 cwd 变成 `...\my-dsh\D:\...\my-dsh`——`${workspaceFolder}` 在多根 workspace（`dsh.code-workspace` 含 `deepseek-harness` + `my-dsh`）里被当相对字符串拼接了。正解是**带文件夹限定符** `${workspaceFolder:my-dsh}`（`my-dsh` 是 workspace 里该文件夹的 name，默认取路径最后一段）。

最终可用的任务形态：

```jsonc
{
  "label": "build (my-dsh)",
  "type": "shell",
  "command": "pnpm run build",
  "options": { "cwd": "${workspaceFolder:my-dsh}" },
  "problemMatcher": []
}
```

## 关键认知

- **调试器类型必须匹配代码执行环境**：Node 半（host 进程）用 Node 调试器，浏览器半用 DevTools/浏览器调试器。断点「未绑定」先问「这段代码在哪个进程跑」，再问「我用的是哪个调试器」——环境错配是这类问题最高频的根因，且症状与「代码没被加载」极易混淆（区分：DevTools 里能否看到源文件）。
- **NodeNext + ESM 的相对导入，`./foo.tsx` 是错的，`./foo.js` 是对的**——`.js` 后缀是 TS 在 NodeNext 下的「指回源文件」惯例，不是笔误。这是把 `moduleResolution` 从 `bundler` 切到 `NodeNext` 时最常见的迁移坑。
- **多根 workspace 的 `${workspaceFolder}` 要带限定符**：单根下 `${workspaceFolder}` 干净，多根（`.code-workspace` 多 folder）下它可能被当相对路径拼接，`${workspaceFolder:<name>}` 才是明确写法。这解释了为什么同一个变量在 `launch.json`（folder 级，解析为该 folder 自身）和 `tasks.json` 里行为不一致。

## 事实源

- `my-dsh/tsconfig.base.json` — `moduleResolution: NodeNext` + `verbatimModuleSyntax: true`（`.tsx` 导入报错的根因）
- `my-dsh/packages/client/ui-hello/tsdown.config.ts` — client 半 `sourcemap: true` + closure-factory 三段包装（浏览器执行方式的依据）
- `my-dsh/packages/client/ui-hello/lib/client.js.map` — `sources: ["../src/client/HelloPanel.tsx", "../src/client/index.ts"]` + `sourcesContent`（DevTools 断点映射依据）
- `my-dsh/.vscode/tasks.json` / `my-dsh/.vscode/launch.json` — 三连坑的现场
- `fork/dsh.code-workspace` — 多根 workspace（`deepseek-harness` + `my-dsh`），`${workspaceFolder:my-dsh}` 的依据

## 遗留

- Node 半的断点实测尚未做（本次只验了浏览器半）——`src/index.ts` 是空 `apply`，无断点可打，留到真正写 node 半逻辑时验证「`--import tsx/esm` source launch + `env.DSH_HOME`」这条链。
- 浏览器调试若需在 VS Code 内打断点（而非 DevTools），需另配 `chrome` 类型 launch + 手动带 `--remote-debugging-port` 启动浏览器；dsh web 目前用系统默认浏览器打开、无 remote-debugging 端口，此路线留作备选。
