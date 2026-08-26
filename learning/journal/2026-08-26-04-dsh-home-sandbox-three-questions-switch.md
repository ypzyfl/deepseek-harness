# DSH_HOME 沙箱三问（持久性 / debug / 热更新）与落点切换

日期：2026-08-26

## 起因

[journal 03](2026-08-26-03-install-target-and-profile-isolation.md) 定了「先 fork `web-poc`，以后试 DSH_HOME 沙箱」。追问沙箱的三个使用性问题（会不会反复生成 profile、对断点 debug 和热更新的影响）后，评估结论是「好处多而几乎无坏处」，决定直接切换到沙箱并把环境搭好。

## 三问三答（源码核对）

1. **沙箱每次会重新生成 profile 文件吗？** 不会——沙箱是持久 home，不是临时目录。`loadProfile` 只在 package.json 缺失时 init，`initProfile` 内部逐文件 `existsSync` 才写（双重幂等，注释明说「Existing files are never touched」）；装好的 profile/依赖/symlink 持久复用，重启不重跑 pnpm。每次启动仅有的写入：重写 root config `cordis.yml`（内容恒定的空 entry list）+ `healProfilesModuleFallback` 幂等维护共享层 symlink（首次从零建 app 依赖闭包，稍慢，之后只校验修复）。
2. **对断点 debug 的影响？** 机制零影响——映射链（`link:` symlink → 真实路径 → sourcemap）与 home 位置无关。唯一操作成本：调试进程必须带 `DSH_HOME`（launch.json 配 `env`），漏配则静默连默认 `~/.dsh`，症状是「沙箱里装的插件全部不存在」，极易误诊为插件坏了。
3. **对持续热更新的影响？** 零影响——client-hmr 每 500ms `statSync(clientPath)`，`clientPath` 解析自沙箱 profile 的 symlink 但锚定 my-dsh 的同一物理文件；my-dsh 侧 watcher 完全不需要 `DSH_HOME`。

## 环境搭建（已落地）

- dsh 仓 `.vscode/launch.json`：新建「dsh web (DSH_HOME sandbox)」配置（`--import tsx/esm` + `program: apps/cli/src/bin.ts` + `stopOnEntry` + `env.DSH_HOME`）。
- `my-dsh/scripts/dev-web.cmd`：终端启动封装（set DSH_HOME + cd dsh 仓 + `pnpm dsh web`）。
- `my-dsh/.gitignore`：加 `.dsh-home/`。
- 决策要点：不用 `setx` 永久化（会劫持所有不想用沙箱的场合），靠三个封装入口（脚本 / launch.json / 手动 set）兜住。

## 实测结果

沙箱首跑 `dsh plugin --profile web add link:<ui-hello 绝对路径>`：auto-init `my-dsh/.dsh-home/profiles/web`（三件套 + pnpm-lock + node_modules symlink），pnpm 1.4s 完成，无「declares no dsh.bundle」警告；沙箱 manifest 的 `dsh.profile.bundles` = `[dsh-base, dsh-web-app, @my-org/dsh-client-ui-hello]`（reconcile 挂入第三层）；`dsh web --dump-config` 组合树出现 `# == @my-org/dsh-client-ui-hello` insert row。原 `~/.dsh` 零接触。**journal 03 遗留的「装进去 + dump-config 看组合树」步骤完成**。

## 关键认知

- 「沙箱」不等于「临时」：隔离的是**位置**，不是**生命周期**；`DSH_HOME` 只是 `resolveDshHome` 的路径选择，无任何一次性语义。
- 沙箱方案的真实成本只有一项——**每次启动带环境变量**，且可被脚本/调试配置完全摊薄；换来的是原 home 零接触 + profile 名不变（`dsh web` 原样可用）+ 免手写三文件 + 删目录即回滚。
- 认知校准：journal 03 担心的「fork 手写三文件」整段被沙箱方案作废——沙箱里 auto-init 直接给正确模板。方案对比的胜负手不是「哪个机制更对」，而是「哪个把人为出错面收得更小」。

## 事实源

- [packages/boot/app-boot/src/profile.ts](../../packages/boot/app-boot/src/profile.ts) — `initProfile` 双重幂等（152–168）、`loadProfile` 按名字查模板 auto-init（371–403）
- [packages/client/hmr/src/index.ts](../../packages/client/hmr/src/index.ts) — stat-poll 每 500ms `statSync(watch.path)`（99–114），watch 路径来自 `ctx.clientModules.clientPath(row.id)`
- [packages/client/modules/src/index.ts](../../packages/client/modules/src/index.ts) — `clientPath(id)` 返回 `resolveMeta` 解析的物理路径（362）
- [packages/util/home-paths/src/index.ts](../../packages/util/home-paths/src/index.ts) — `resolveDshHome` 优先级（87–91）
- 搭建产物：dsh 仓 `.vscode/launch.json`、`my-dsh/scripts/dev-web.cmd`、`my-dsh/.gitignore`

## 遗留

- 浏览器侧 PoC：`dev-web.cmd` 启动后确认侧栏时钟面板 + `window.__DSH_BOOT__.entries` + `GET /plugins/<id>/client.js` 200 + sourcemap 断点。
- 沙箱里 session 数据从零开始（不共享 `~/.dsh` 历史 session）；API key 走环境变量不受影响。
