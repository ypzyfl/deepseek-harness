# install 落点裁决：`--patch` 管挂载不管解析；fork profile 撞上「模板按名字查」

日期：2026-08-26

## 起因

PoC 构建已打通（[journal 02](2026-08-26-02-poc-build-tsdown-version-drift.md)），下一步是运行时注入验证。外部 AI 助手建议的路线是 `dsh plugin --profile web add link:...` + `dsh web`，并解释「为什么会改 `$DSH_HOME/profiles/web`、`--patch` 为什么不够」。我请 CodeBuddy 对这套说法逐条做源码裁决；裁决过程中我的诉求边界进一步收紧——「不动现有 `web`/`headless` profile」——引出了新问题：**install 到底落在哪个 profile**。

## 对外部 AI 说法的三点裁决（源码核对）

1. **核心正确**：`--patch` 只解决组合树挂载，不解决模块解析。`resolveMeta` 用 `createRequire(ctx.baseUrl)` 解析 `<pkg>/package.json`，`ctx.baseUrl` 锚定在 profile 目录（config tree 的 cordis.yml 所在处，构造函数注释明写 resolution anchor）；解析失败被永久判 null（`pkgMeta` 负缓存），前端面板不出现。而 `createRequire(profileDir)` 的 parent-walk 链（profile/node_modules → profiles/node_modules → … → 主目录）不经过 my-dsh 的 workspace node_modules，`healProfilesModuleFallback` 又只维护 dsh app 依赖闭包——**install 进 profile 是唯一官方解析通道**。

2. **漏看了关键声明**：`ui-hello` 的 package.json 自带 `dsh.bundle.patch`。`reconcilePlugins` 对声明了 `dsh.bundle` 的依赖会自动 append 进 `dsh.profile.bundles`，insert row 随 bundle 层生效——**`add` 一次做完解析 + 挂载 + 持久化三件事，`--patch` 从头到尾都用不上**。「`--patch` 还是 `add`」对带声明的包是伪选择；`--patch` 只对**不带** `dsh.bundle` 的普通插件有意义（add 只装不挂，row 得另给）。

3. **热重载说法是错的**：「改 overlay 文件即可热重载」不成立。`watchUserPatches` 只盯两个用户层文件（profile 的 cordis.patch.yml 与 `$DSH_HOME/cordis.patch.yml`），而 live recomposition 的 `composeLive` 复用启动时已解析的 `composed.overlays`——`--patch` 文件是启动时一次性读入，改它不热重载、也不进下一次 recomposition，必须重启。顺带确认：bundle 层（ui-hello insert row 所在层）同样不被 watch。

## 边界升级：不动现有 profile → fork web-poc

`dsh plugin --profile web add` 会写现有 web profile 的三处持久状态（dependencies、`dsh.profile.bundles`、node_modules symlink），被新边界排除。于是问题变成「fork 一个 web 等价 profile」——可行（profile 机制的设计意图：每 profile 一个独立目录，CLI 帮助文本自带自定义 profile 示例），但撞上一个隐蔽陷阱：

- **模板按名字查**：`PROFILE_TEMPLATES` 只有 `web` / `headless` 两个键。直接 `dsh --profile web-poc` 抛「does not exist」；用 `dsh plugin --profile web-poc add` 创建则走 `DEFAULT_PROFILE_BUNDLES`（只有 `dsh-base`，**没有 `dsh-web-app`**）——初始化出来的不是 web profile，起不了 web UI。
- **正解是手写三个文件**（照抄 `initProfile` 的产物）：`package.json`（bundles 抄 web 模板 `[dsh-base, dsh-web-app]`）+ 空 `cordis.patch.yml` + `pnpm-workspace.yaml`（`nodeLinker: hoisted`，仓外插件 peer 解析的关键，不能省）。已初始化过 web 的话，直接复制目录改名等价。
- **fork 之所以轻**：bundle 不装在 profile 目录里，`healProfilesModuleFallback` 维护共享层 `$DSH_HOME/profiles/node_modules`（dsh app 依赖闭包的 symlink），所有 profile 从那里解析 bundle——fork 目录只是「清单」不是「安装」，与原 web profile 互不干扰。

## 备选：DSH_HOME 沙箱

`resolveDshHome` 优先级：configured > `$DSH_HOME` 环境变量 > `~/.dsh`。把 `DSH_HOME` 指到 `my-dsh/.dsh-home` 后，沙箱里 profile 名还叫 `web`（命中 `PROFILE_TEMPLATES['web']`，auto-init 正确的 web 模板），所有命令原样可用；原 home 的 web/headless 一个字节不动，删沙箱目录即完全回滚。

## 关键认知

- **挂载与解析是两件事**：`--patch`/profile patch 管组合树，`dsh plugin add`（pnpm 进 profile）管 `createRequire` 可达性；对带 `dsh.bundle` 声明的包，add 一并完成挂载，`--patch` 是给无声明插件补 row 的通道。
- **「零污染」的真实自由度在 install 落点**：install 必须落在某个 profile 的 node_modules（结构上绕不开），可选的只是落在哪——现有 web（违反边界）/ fork 的 web-poc（当前选择）/ DSH_HOME 沙箱里的全新 web（更彻底，待尝试）。
- **profile 名字有语义**：模板表按名字匹配，名字不只是目录名——起新名字等于放弃 shipped 模板的自动初始化。
- 精确性注：即使不装任何插件，每次启动都会重写 profile 的 `cordis.yml`（root config），但内容是恒定的空 entry list 模板，非状态改动。

## 决策

- **当前**：fork `web-poc`（手写三文件 + `dsh plugin --profile web-poc add link:...` + `dsh --profile web-poc` 启动）。
- **以后**：尝试 `DSH_HOME` 沙箱方案（登记遗留）。

## 事实源

- [packages/client/modules/src/index.ts](../../packages/client/modules/src/index.ts) — `createRequire(ctx.baseUrl)` 解析锚（301–311）、`resolveMeta` 失败永久 null（429–463）
- [apps/cli/src/plugin.ts](../../apps/cli/src/plugin.ts) — `dsh plugin add` 机制（120–158）、`reconcilePlugins`（59–91）
- [apps/cli/src/profile-boot.ts](../../apps/cli/src/profile-boot.ts) — `composeLive` 复用启动时 overlays（240–245）、`watchUserPatches` 只盯两个用户层文件（285–294）
- [packages/boot/app-boot/src/profile.ts](../../packages/boot/app-boot/src/profile.ts) — `PROFILE_TEMPLATES`/`DEFAULT_PROFILE_BUNDLES`（114–125）、`initProfile` 三文件（152–168）、`loadProfile` 按名字查模板（371–403）、`healProfilesModuleFallback` 共享层（204–252）
- [packages/util/home-paths/src/index.ts](../../packages/util/home-paths/src/index.ts) — `resolveDshHome` 优先级（87–91）
- [apps/cli/src/args.ts](../../apps/cli/src/args.ts) — `dsh web` 是 `--profile web` 别名（156–168）、通用 `--profile <name>` 入口（131）

## 遗留

- 前端注入链路 PoC 仍未执行（journal 02 遗留的下一步，落点已从 `--profile web` 修正为 `--profile web-poc`）。
- DSH_HOME 沙箱方案已裁决可行，待后续实测（注意 cmd 的 `set DSH_HOME` 只对当前会话生效）。
- `--patch` overlay 不热重载已从源码确认，但「无 `dsh.bundle` 声明的普通插件 + `--patch`」组合尚未实测。
