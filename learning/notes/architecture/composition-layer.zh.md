# 组合层（profile / bundle / patch）学习笔记

状态：草稿 | 已对照验证（2026-08-17 对照 docs/architecture.zh.md「组合层」节、packages/boot/app-boot/src/profile.ts、app-boot/README.zh.md「Profiles」节、packages/bundle/README.zh.md；2026-08-25 对照 apps/cli/src/profile-boot.ts 修正 `cordis.yml` 的来源结论）

## 事实源（链接，不复述）

- [docs/architecture.zh.md](../../../docs/architecture.zh.md)「Profile 与组合包」节
- [packages/boot/app-boot/src/profile.ts](../../../packages/boot/app-boot/src/profile.ts) — profile 发现/初始化/层组合（`initProfile` 只创建三样，不创建 `cordis.yml`）
- [apps/cli/src/profile-boot.ts](../../../apps/cli/src/profile-boot.ts) — `prepareProfile` 每次启动重写根 `cordis.yml`（第 67、101 行）
- [packages/boot/app-boot/README.zh.md](../../../packages/boot/app-boot/README.zh.md)「Profiles」节
- [packages/bundle/README.zh.md](../../../packages/bundle/README.zh.md)

## 它是什么（用自己的话）

组合层把「静态的插件包」装配成「一棵可运行的插件树」。核心是三个名词：**profile**（一套具名组装方案）、**bundle**（少数特殊的 npm 包在组合层扮演的「装配者」角色，把分散的插件包「捆」成一份 patch 清单）、**patch**（按 id 定位、整行替换 config 或插入新行的覆盖操作）。运行中的 dsh = 空列表上按序叠加各层的结果。

### 关系图（ASCII）

以 headless profile 为例（`PROFILE_TEMPLATES` 硬编码了它的 bundle 列表）：

```
   profile 的 package.json
   ┌──────────────────────────────────────────────┐
   │ "dsh": { "profile": {                        │
   │   "bundles": ["@deepseek-ai/dsh-base",       │  ① profile 点名 bundle（有序）
   │               "@deepseek-ai/dsh-headless"]   │
   │ } }                                          │
   └──────────────────────┬───────────────────────┘
                          │ 按顺序读每个 bundle
                          ▼
   bundle（少数特殊的 npm 包，本质是把分散的插件包「捆/束」成一份装配清单）
   ┌──────────────────────────────────────────────┐
   │ @deepseek-ai/dsh-headless                    │
   │   ├─ lib/index.js   ← 内含的插件代码（可选）  │
   │   ├─ lib/startup.js ← 内含的插件代码（可选）  │
   │   └─ cordis.patch.yml ← 清单：点名要挂哪些包  │
   │        "dsh": { "bundle": {                  │
   │          "patch": "./cordis.patch.yml" } }   │
   └──────────────────────┬───────────────────────┘
                          │ 清单里的 name 点名各「插件包」
                          ▼
   cordis.patch.yml 的每一行 = 一条「插件挂载指令」
   ┌──────────────────────────────────────────────┐
   │ - insert:                                    │
   │     - id: session                            │
   │       name: '@deepseek-ai/dsh-session'       │ ← 别的包（dsh-base 挂的）
   │     - id: headless-startup                   │
   │       name: '@deepseek-ai/dsh-headless/startup' │ ← 指向自己的 lib/startup.js
   │     - id: headless-runner                    │
   │       name: '@deepseek-ai/dsh-headless'      │ ← 指向自己的 lib/index.js
   └──────────────────────┬───────────────────────┘
                          │ 逐层应用到空列表
                          ▼
   插件树（空列表 + bundle 层 + profile patch + home patch + --patch）
   ┌──────────────────────────────────────────────┐
   │ dsh --profile headless --dump-config         │
   │   - id: session           (来自 dsh-base)    │
   │   - id: headless-startup  (来自 dsh-headless)│
   │   - id: headless-runner   (来自 dsh-headless)│
   │   ...  ← 每行都是「插件包」，没有 bundle 本身 │
   └──────────────────────────────────────────────┘
```

### 关系说明（按图自上而下）

- **① profile 用于组合 bundle（只「点名」，不包含插件）**：profile 的职责就是把若干 bundle 组合成一套方案。它的 `package.json` 里 `dsh.profile.bundles` 是一个有序的 bundle 包名列表，本身不包含任何插件；它只决定「用哪几个 bundle、按什么顺序叠加」。
- **② bundle 是「特殊」的少数 npm 包**：bundle 底子确实是 npm 包（有 `name`/`version`/`main`/`dependencies` 等字段），但它的**特殊之处才是重点**——`package.json` 里多了 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` 这个声明，正是这个字段把它「标记」成 bundle。全仓库只有 **5 个**包有这份声明（`dsh-base`/`dsh-web-app`/`dsh-headless`/`dsh-subagent-claude-code`/`dsh-subagent-codex`），其余几十个功能包都不是 bundle。「bundle」这个词本身道出了它的本质——把**分散的插件包「捆/束」成一份装配清单**；大多数包只是「被捆进去」的插件包，没有资格当 bundle。它的 `lib/` 里可能有真正运行的插件模块（如 `startup.js`、`index.js`），但那是它「作为插件包」的一面，不是它「作为 bundle」的核心——bundle 的核心是那份 patch 清单。
- **③ patch 清单是「点名挂哪些包」的说明书**：bundle 的 `cordis.patch.yml` 里每一行 `- id: xxx / name: '...'` 都是「把 `name` 点名的那个插件包，以这个 id、这个 config 挂上树」。`name` 里的 specifier 绝大多数指向**别的功能包**（如 `@deepseek-ai/dsh-session`），少数指向 bundle 自己内含的插件（如 `@deepseek-ai/dsh-headless/startup`）。

  > **`name` 的 specifier 可以是「包名 + 子路径」，指向同一个包导出的多个插件入口**。一个 npm 包可以通过 `package.json` 的 `exports` 字段声明多个子路径，每个子路径对应一个独立的插件模块。以 `dsh-headless` 为例（其 `exports` 有 `"."`→`lib/index.js`、`"./startup"`→`lib/startup.js`、`"./invariant"`→`lib/invariant.js` 三个入口）：
  >
  > | 清单里的 `name` | 解析到 | 角色 |
  > |---|---|---|
  > | `@deepseek-ai/dsh-headless/startup` | `lib/startup.js` | provider：解析命令行参数，提供 `headlessStartup` 服务 |
  > | `@deepseek-ai/dsh-headless` | `lib/index.js` | consumer：直接驱动器，`inject: [headlessStartup]` 消费上面的服务，创建 Agent 并打印结果 |
  >
  > 这种「startup 提供参数 + runner 消费参数」的拆分，是**职责分离**在 bundle 内部的应用：参数来源（startup）和执行（runner）各自独立、可替换，靠 Cordis 的 `inject` 服务依赖连接。所以 patch 清单里的 `name` 写「包名」还是「包名+子路径」，取决于你要挂的是该包的**主入口**（`index.js`）还是**某个子入口**（如 `/startup`）。
  >
  > **`exports` 的本质是「路径重定向表」，不是「符号导出表」**：`exports` 里 `"./startup": "./lib/startup.js"` 这一行，说的是「当别人 `import '包名/startup'` 时，去加载 `./lib/startup.js` 这个文件」，而不是「导出名叫 startup 的函数」。它的粒度是**模块文件**（一个子路径 = 一个模块入口文件），不是函数/符号；被指到的那个文件内部才真正 `export` 具体的符号（插件的 `name`/`inject`/`apply`）。所以「一个包导出多个入口」≈「一个包通过 `exports` 暴露多个**插件模块**」，每个模块才是真正导出符号的地方——这与 DLL 导出多个函数形似，但粒度是「模块文件」而非「函数」，机制是「路径映射」而非「运行时符号表」。

  > **关键辨析：bundle 的 patch 清单挂的是「别的包」，不是「自己」**。通读 `dsh-base`（450 行）和 `dsh-web-app`（446 行）的 `cordis.patch.yml`，绝大多数 `name` 指向**功能包**（`@deepseek-ai/dsh-tools`、`dsh-session`、`dsh-agent-loop`、`dsh-web`…），而不是 bundle 自己。bundle 的角色不是「把自己挂上树」，而是「**把一整套功能装配起来**」——它是一份「横跨许多包的插件清单」+ 对这些包的依赖。只有极少数行指向 bundle 自己（如 `dsh-web-app` 的 `name: '@deepseek-ai/dsh-web-app/startup'` 和 `name: '@deepseek-ai/dsh-web-app'`），那些才是 bundle 自己的本体代码。
  >
  > 因此「本体 vs patch = 内容 vs 通道」这个框架，适用的对象是**某个插件包**（一个插件包的代码要上树，必须被某个 patch 清单用 `name` 点名），而不是 **bundle**。bundle 不通过 patch「上树」——bundle 通过 `dsh.profile.bundles` 被点名，然后它的 patch 清单去挂别的包。bundle 必须有 `"dsh": { "bundle": { "patch": ... } }` 声明，是因为组合器要读它的清单来装配；缺失该声明则 fail loud（`profile.ts` 明确报错）。

  > **`cordis.yml` vs `cordis.patch.yml` 的语义区分**：两者是**同一格式**（Cordis 配置条目列表，每项 `name` + `config`），区别只在**用途语义**——`cordis.yml` 是「完整配置」，这份列表就是全部、从零装配（教程 `bin.js` 读的就是它）；`cordis.patch.yml` 是「一层补丁」，对已有配置做增删改（insert / 按 id 覆盖 config）。**但 profile 目录里确实存在一个 `cordis.yml`**——它是 profile 的「根」（root config），内容固定为空列表 `[]`，由 `prepareProfile` 在每次启动时现场重写（详见下方第 71 行的修正）。它与 `cordis.patch.yml` 的区分是「根 vs 层」，而不是「完整配置 vs 补丁」。

  > **profile 目录里确实存在一个 `cordis.yml`，它是「根」，不是「补丁」**：`~/.dsh/profiles/<name>/` 下除了 `package.json` + `cordis.patch.yml` + `pnpm-workspace.yaml`，**还有 `cordis.yml`**。它由 `apps/cli/src/profile-boot.ts` 的 `prepareProfile` 每次启动时现场重写（第 101 行 `writeFileSync(join(profile.dir, PROFILE_ROOT_FILENAME), PROFILE_ROOT_CONFIG)`，`PROFILE_ROOT_FILENAME = 'cordis.yml'`，第 67 行），内容固定是空列表 `[]`（`PROFILE_ROOT_CONFIG`，第 60–64 行）。它存在的**唯一理由**（第 86–93 行注释）：给 Loader 一个真实的 include 根，用来把 `baseUrl` 锚定在 profile 目录（config dump 也锚定在同一文件，保证两者组合在相同 base 上）。**每次启动都重写**，因为 Loader 的 tree write-back（插件自销毁会持久化当前树）可能把已组合的行「烤」进这个文件，导致下次启动重复每个 bundle 的 insert。
  >
  > **区分两个创建者**：`initProfile`（`profile.ts`，负责「初始化 profile 目录」）只创建 `package.json` + `cordis.patch.yml` + `pnpm-workspace.yaml` 三样，**不创建 `cordis.yml`**；`prepareProfile`（`profile-boot.ts`，负责「每次启动前准备」）才在每次 boot 时重写 `cordis.yml`。所以「initProfile 只创建三样」和「profile 目录里有 cordis.yml」并不矛盾——`cordis.yml` 是启动期产物，不是初始化产物。
  >
  > **根 vs 层的最终区分**：`cordis.yml` 是 profile 的「根配置」（root / leaf config，空 `[]`，用户不应编辑，每次启动被重置）；`cordis.patch.yml` 是「补丁层」（用户/bundle 的覆盖，可编辑、可叠加）。二者名字相近但语义正交。整个装配是「`cordis.yml`（空根） + 层层 patch 叠加」，`composeEntries` 的起点就是这个空根。

- **④ patch 的两种操作**：在 patch 清单里，「新增」用 `insert:` 挂新条目（新插件），「替换」用 `id: 已有条目 / config: 新值` 覆盖已存在条目的 config。`dsh-headless` 的清单里两者并存：`id: system-prompt` 是**替换**（覆盖 dsh-base 已挂的 persona），`insert: - id: headless-runner` 是**新增**（挂自己的代码）。
- **⑤ patch 层层覆盖**：所有层本质上都是「一份 patch 列表」，只是提供者不同。顺序是：

  ```
  空列表
    → bundle 1（如 dsh-base）        ← 实际 = 应用 dsh-base 的 cordis.patch.yml
    → bundle 2（如 dsh-headless）    ← 实际 = 应用 dsh-headless 的 cordis.patch.yml
    → profile 的 cordis.patch.yml     ← 用户对这套 profile 的定制
    → home 级的 cordis.patch.yml      ← 用户全局定制（~/.dsh/cordis.patch.yml）
    → --patch overlay                 ← 命令行临时覆盖
  ```

  越靠后优先级越高，按 id 整行替换 config（或 insert 新增）。**「bundle 层」就是「bundle 的 cordis.patch.yml」**——所谓「应用 bundle 1」就是「应用 dsh-base 的 patch 清单」。注意：bundle 的 patch 清单里 `name` **绝大多数指向别的功能包**（`dsh-tools`、`dsh-session`、`dsh-agent-loop`…），只有极少数行指向 bundle 自己（如 web 的 `/startup`、`index`）。所以「应用 bundle」的本质是「**按这份清单，把横跨多个包的一整套插件挂上树**」，而非「把 bundle 自己挂上树」。其余层（profile/home/--patch）则是「用户对已挂载条目的覆盖」，自己不挂代码，只改/增条目。
- **一句话**：profile 点名 bundle（装配者）→ bundle 的 patch 清单点名各插件包（被装配者）挂上树 → 后续 patch 按 id 覆盖 → 得到插件树（只含插件包，不含 bundle）。

## 关键实体

- **profile**：`$DSH_HOME/profiles/<name>` 目录，含 `package.json`（`dsh.profile.bundles` 有序列表）+ `cordis.patch.yml`（用户自己的 patch 层）+ `node_modules/`。
- **bundle**：**少数特殊的 npm 包**——它的特殊之处，在于 `package.json` 里声明了 `dsh.bundle.patch` 字段，指向一份 `cordis.patch.yml` 装配清单。**「bundle」这个词本身就体现了它的含义：把许多分散的插件包「捆」（bundle）成一份装配清单**；全仓库只有 5 个包承担这个角色，绝大多数功能包只是「被捆进去」的插件包。bundle 不靠继承或注册，靠的是「一个声明字段 + 一份 YAML 清单」。`dsh-base` 是第一层（模型/工具/持久化/沙箱/设置/凭据/遥测），`dsh-web-app`/`dsh-headless` 叠加其上。
  - **bundle 无层级（全部「顶层」）**：所有 bundle 都**只由 profile 的 `dsh.profile.bundles` 数组点名**，这个数组平铺有序、没有嵌套。不存在「bundle A 的 patch 清单里再引用 bundle B」这种层级关系——bundle 的 patch 清单里 `name` 指向的永远是**插件包**，不是 bundle。`loadProfile`（`profile.ts` 第 387–397 行）用 `bundles.map(...)` 一次性平铺处理所有 bundle，没有递归解析 bundle 的逻辑。所以「bundle 被 profile 的 bundles 数组引用」对所有 bundle 都成立，没有例外，也不需要「顶层/非顶层」的区分。
- **bundle vs 插件包（同一 npm 包的两种角色）**：二者不是两类不同的包，而是**同一个 npm 包在组合层扮演的不同职能**。

  | | bundle（装配者） | 插件包（被装配者） |
  |---|---|---|
  | 包的贡献 | 一份 `cordis.patch.yml` 清单 | `apply`/`inject`（或 `Service`） |
  | 谁引用它 | profile 的 `package.json` 里 `dsh.profile.bundles` 数组 | 某份 `cordis.patch.yml` 清单里的 `name: '包名'` |
  | 判据 | 自己的 `package.json` 里声明了 `dsh.bundle.patch` | 被某份 `cordis.patch.yml` 里的 `name` 点名 |
  | 是否出现在最终树 | **不出现**（清单被消费后消失） | **出现**（树的每一行都是插件包） |

  同一个包可以**同时**是两者。自洽的例子——`dsh-web-app` 这个 npm 包同时是 bundle 又是插件包：

  - **作为 bundle**：声明了 `dsh.bundle.patch`，被 profile 的 `bundles` 数组点名，贡献了一份 446 行的装配清单。
  - **作为插件包**：它的 `index.js` 导出了 `apply`，清单里那行 `name: '@deepseek-ai/dsh-web-app'` 就是把它（的 `index.js`）当插件挂上树。

  所以「bundle」和「插件包」这两个词，描述的是**同一个 npm 包在组合层承担的不同职能**，而不是两类物理上不同的东西。判断一个包是什么，看它**声明了什么、被谁引用**，而不是看它的名字。
- **`cordis.patch.yml` 是 bundle 的判据（但「声明」≠「被装配」）**：全仓库只有 **5 个** `cordis.patch.yml`，其余几十个功能包都没有——因为**插件包不需要它**（插件包靠「被点名」上树，不靠「自己装配别人」），只有 bundle 需要它（bundle 的存在意义就是「贡献装配清单」）。
  - **全仓库的 bundle 清单（仅这 5 个）**：

    | 包名 | 角色 | 被 profile 装配吗 |
    |---|---|---|
    | `@deepseek-ai/dsh-base` | 每个 profile 的第一层（核心能力） | ✅ `web`/`headless` 都点名 |
    | `@deepseek-ai/dsh-web-app` | 浏览器界面层 | ✅ `web` 点名 |
    | `@deepseek-ai/dsh-headless` | 无界面 one-shot 层 | ✅ `headless` 点名 |
    | `@deepseek-ai/dsh-subagent-claude-code` | 可选的 Claude Code 子代理提供者 | ❌ 未被任何 profile 点名（按需启用） |
    | `@deepseek-ai/dsh-subagent-codex` | 可选的 Codex 子代理提供者 | ❌ 未被任何 profile 点名（按需启用） |

    前 3 个是「随发行版交付、默认装配」的 bundle（对应 `PROFILE_TEMPLATES` 里的 `web`/`headless` 两个 profile）；后 2 个是「可选能力」的 bundle，声明了资格但默认不装。**对比之下，几十个功能包（`dsh-tools`、`dsh-session`、`dsh-agent-loop`…）都不是 bundle**——它们没有 `dsh.bundle.patch` 字段，只是「被 bundle 的清单捆进去」的插件包。
  - **`dsh.bundle.patch` 声明的是「资格」（capability），不是「已装配」的事实**：声明了它的包是**潜在的、可选的 bundle**，准备了一份装配清单**等某个 profile 的 `bundles` 数组来点名**。若没有任何 profile 点名它，它就只是一份「躺在那里、没被激活」的清单，不会上树、不产生任何插件。上表后 2 个 subagent 包正是如此：它们的 patch 注释自述为 "optional Profile layer"，`dsh-base` 的 `base.spec.ts` 甚至断言它们的行数为 0、且不在 `dsh-base` 的依赖里——**默认不装、按需启用**，用户/部署想启用时在 profile 的 `bundles` 数组里加上包名即可。

### 概念拼图完整链

把上述实体串成一条链，组合层就闭环了：

```
profile（组装方案，点名 bundle）
  → bundle（装配者，贡献 patch 清单）
  → patch 清单（点名插件包）
  → 插件包（被装配者，贡献 apply）
  → 插件树（只含插件包，bundle 消费后消失）
```

这链条回答的核心问题是「谁负责把静态的插件包变成可运行的树」：profile 决定「用哪几个 bundle、按什么顺序」，bundle 的清单决定「挂哪些插件包、怎么配」，组合器按序叠加，最终得到一棵只含插件包的树。
- **patch 层**（按应用顺序，后者覆盖前者；每一层都是一份 patch 列表，只是提供者不同）：
  1. bundle 层 = 各 bundle 自己的 `cordis.patch.yml`（按 `dsh.profile.bundles` 顺序）
  2. profile 级 patch：`~/.dsh/profiles/<name>/cordis.patch.yml`（自动创建空 `[]`）
  3. home 级 patch：`~/.dsh/cordis.patch.yml`（**可选，不自动创建**，优先级高于 profile 级）
  4. `--patch` overlay

## 与相邻单元的关系（依赖谁 / 被谁依赖）

- **组合层是 Cordis loader/include 机制的应用**：`applyEntryPatches` / `loadOverlayPatches` 来自 `@deepseek-ai/cordis-plugin-include`。
- **组合树 = 命令输出，不是文档**：`dsh --profile X --dump-config` 现场生成，规则在文档、内容靠跑。
- 组合层回答「谁在场」（静态装配事实），日志回答「发生了什么」（动态运行事实），两者互补。

## 我曾经的误解（原以为 → 实际是 → 修正来源）

1. **原以为** home 级 patch 会自动创建、应该在 `~/.dsh/` 下看到一个 `cordis.patch.yml`；**实际是** home 级 patch 是**可选**的，`loadOptionalPatches` 对「缺失文件」返回 `undefined`（= 无此层），不会自动创建。修正来源：`index.ts` 的 `loadOptionalPatches` + app-boot README 第 40-43 行。
2. **原以为**「home 级 patch」在 profile.ts 里看不到，怀疑文档和源码不一致；**实际是** profile.ts 只负责 profile 级，home 级在 CLI bin 组装层加载，文档（app-boot README）记载了它。修正来源：完整读 app-boot README「Profiles」节。
3. **原以为**「profile 目录里没有 `cordis.yml`」（`initProfile` 只创建三样）；**实际是** profile 目录里**确实有 `cordis.yml`**，它是 profile 的「根配置」（空 `[]`），由 `prepareProfile` 每次启动现场重写，`initProfile` 不创建它。修正来源：`apps/cli/src/profile-boot.ts` 第 67、101 行 + 实证 `~/.dsh/profiles/{web,headless}/cordis.yml`。教训：只读 `initProfile` 会漏掉「启动期产物」，profile 的完整文件集合要同时看 `initProfile`（初始化）和 `prepareProfile`（启动）两处。
4. **原以为**「bundle 自己把自己挂上树」（它的 patch 清单里 `name` 指向自己的代码）；**实际是** bundle 的 patch 清单里 `name` **绝大多数指向别的功能包**（`dsh-tools`、`dsh-session`、`dsh-agent-loop`…），bundle 的角色是「把横跨多包的一整套功能装配起来」，只有极少数行指向 bundle 自己（如 web 的 `/startup`、`index`）。修正来源：通读 `dsh-base`、`dsh-web-app` 的完整 `cordis.patch.yml`。教训：「bundle 是装配单元，不是被挂载的本体」——bundle 通过 `dsh.profile.bundles` 被点名，它的 patch 清单去挂别的包。
5. **原以为**「大部分 npm 包都会是 bundle」（被「bundle 是插件包」这个说法误导了）；**实际是** bundle 是**特别的、少数**的——全 `packages/` 下几十个功能包里，只有 5 个包声明了 `dsh.bundle.patch`（有 `cordis.patch.yml`）。明白这一点后，反而更能理解「bundle」这个词本身的含义：它是「把分散的插件包**捆（bundle）成一份装配清单**」的特殊角色，大多数包只是「被捆进去」的普通插件包，自己并没有资格当 bundle。修正来源：清点 `packages/` 下所有 `cordis.patch.yml`（仅 5 个）+ 理解 bundle 与插件包是「同一 npm 包的两种角色、但只有少数包承担 bundle 角色」。

## 验证方式

- `ls ~/.dsh/profiles/<name>/` 应看到 `package.json` + `cordis.patch.yml`（空 `[]`）。
- `ls ~/.dsh/cordis.patch.yml` 应不存在（除非手动创建）。
- `dsh --profile headless --dump-config` 输出的 `# ==` 注释对应 bundle 来源层。

## 遗留问题（登记进 questions.zh.md）

- ~~patch 的「按 id 定位」在「一个 bundle 用 insert 插入了新条目、后续 patch 能否再对它 patch」这个边界上的确切语义~~ **已解答**：`applyEntryPatches`（`vendor/include/src/index.ts` 第 96–102 行）在每次 insert 后调用 `buildMap(insert)`，把新增行立即索引进 `entryMap`，因此同层后续 patch 可命中刚 insert 的行。完整边界语义（覆盖遇 id 不存在→警告跳过；insert 遇 id 已存在→追加不覆盖）见 [cordis-config-schema.zh.md](../mechanisms/cordis-config-schema.zh.md)「patch 的三种操作 + 边界语义」。
