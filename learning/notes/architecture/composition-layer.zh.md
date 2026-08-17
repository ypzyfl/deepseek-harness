# 组合层（profile / bundle / patch）学习笔记

状态：草稿 | 已对照验证（2026-08-17 对照 docs/architecture.zh.md「组合层」节、packages/boot/app-boot/src/profile.ts、app-boot/README.zh.md「Profiles」节、packages/bundle/README.zh.md）

## 事实源（链接，不复述）

- [docs/architecture.zh.md](../../../docs/architecture.zh.md)「Profile 与组合包」节
- [packages/boot/app-boot/src/profile.ts](../../../packages/boot/app-boot/src/profile.ts) — profile 发现/初始化/层组合
- [packages/boot/app-boot/README.zh.md](../../../packages/boot/app-boot/README.zh.md)「Profiles」节
- [packages/bundle/README.zh.md](../../../packages/bundle/README.zh.md)

## 它是什么（用自己的话）

组合层把「静态的插件包」装配成「一棵可运行的插件树」。核心是三个名词：**profile**（一套具名组装方案）、**bundle**（一份可安装、可被 patch 的插件包）、**patch**（按 id 定位、整行替换 config 或插入新行的覆盖操作）。运行中的 dsh = 空列表上按序叠加各层的结果。

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
   bundle（npm 包，本体 = 插件代码 + 一份 patch 清单）
   ┌──────────────────────────────────────────────┐
   │ @deepseek-ai/dsh-headless                    │
   │   ├─ lib/index.js   ← 插件代码（本体）        │
   │   ├─ lib/startup.js ← 插件代码（本体）        │
   │   └─ cordis.patch.yml ← 清单：怎么挂这些代码  │
   │        "dsh": { "bundle": {                  │
   │          "patch": "./cordis.patch.yml" } }   │
   └──────────────────────┬───────────────────────┘
                          │ 清单里的 name 指向本体代码
                          ▼
   cordis.patch.yml 的每一行 = 一条「插件挂载指令」
   ┌──────────────────────────────────────────────┐
   │ - insert:                                    │
   │     - id: headless-startup                   │
   │       name: '@deepseek-ai/dsh-headless/startup' │ ← 指向 lib/startup.js
   │     - id: headless-runner                    │
   │       name: '@deepseek-ai/dsh-headless'      │ ← 指向 lib/index.js
   └──────────────────────┬───────────────────────┘
                          │ 逐层应用到空列表
                          ▼
   插件树（空列表 + bundle 层 + profile patch + home patch + --patch）
   ┌──────────────────────────────────────────────┐
   │ dsh --profile headless --dump-config         │
   │   - id: headless-startup  (来自 dsh-headless)│
   │   - id: headless-runner   (来自 dsh-headless)│
   │   - id: session           (来自 dsh-base)    │
   │   ...                                        │
   └──────────────────────────────────────────────┘
```

### 关系说明（按图自上而下）

- **① profile 只「点名」bundle**：profile 的 `package.json` 里 `dsh.profile.bundles` 是一个有序的 bundle 包名列表，本身不包含任何插件；它只决定「用哪几个 bundle、按什么顺序叠加」。
- **② bundle 的本体是「插件代码」**：一个 bundle 就是普通的 npm 包（如 `@deepseek-ai/dsh-headless`），它的 `lib/` 里有真正运行的插件模块（`startup.js`、`index.js` 等）。**这些插件代码才是「最终被挂上树、真正干活」的东西。**
- **③ patch 清单是「怎么挂本体」的说明书**：bundle 的 `cordis.patch.yml` 里每一行 `- id: xxx / name: '...'` 都是「把 bundle 本体里的某个插件模块，以这个 id、这个 config 挂上树」。`name` 里的 specifier（如 `@deepseek-ai/dsh-headless/startup`）指向的就是本体代码。

  > **关键辨析：本体 vs patch = 内容 vs 通道**。bundle 的本体代码**不会自动上树**——它必须先被写进 bundle 自己的 `cordis.patch.yml` 清单里，组合器才会去挂它。**patch 清单是「本体上树的唯一通道」**，两者不是并列的两种贡献来源，而是「本体是内容、patch 是挂载指令」。所以 bundle 必须有 `"dsh": { "bundle": { "patch": ... } }` 声明——没有它，bundle 的代码永远上不了树（`profile.ts` 对缺失该声明的 bundle 明确报错）。

- **④ patch 的两种操作**：在 patch 清单里，「新增」用 `insert:` 挂新条目（新插件），「替换」用 `id: 已有条目 / config: 新值` 覆盖已存在条目的 config。`dsh-headless` 的清单里两者并存：`id: system-prompt` 是**替换**（覆盖 dsh-base 已挂的 persona），`insert: - id: headless-runner` 是**新增**（挂自己的代码）。
- **⑤ patch 层层覆盖**：bundle 层之后，依次叠加 profile 级 patch、home 级 patch、`--patch` overlay；越靠后优先级越高，按 id 整行替换 config（或 insert 新增）。
- **一句话**：profile 点名 bundle → bundle 的 patch 清单把自己的插件代码挂上树 → 后续 patch 按 id 覆盖 → 得到插件树。

## 关键实体

- **profile**：`$DSH_HOME/profiles/<name>` 目录，含 `package.json`（`dsh.profile.bundles` 有序列表）+ `cordis.patch.yml`（用户自己的 patch 层）+ `node_modules/`。
- **bundle**：npm 包，manifest 声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`。`dsh-base` 是第一层（模型/工具/持久化/沙箱/设置/凭据/遥测），`dsh-web-app`/`dsh-headless` 叠加其上。
- **patch 层**（按应用顺序，后者覆盖前者）：
  1. bundle 层（按 `dsh.profile.bundles` 顺序）
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

## 验证方式

- `ls ~/.dsh/profiles/<name>/` 应看到 `package.json` + `cordis.patch.yml`（空 `[]`）。
- `ls ~/.dsh/cordis.patch.yml` 应不存在（除非手动创建）。
- `dsh --profile headless --dump-config` 输出的 `# ==` 注释对应 bundle 来源层。

## 遗留问题（登记进 questions.zh.md）

- patch 的「按 id 定位」在「一个 bundle 用 insert 插入了新条目、后续 patch 能否再对它 patch」这个边界上的确切语义（vendor/README 提到过 `applyEntryPatches` 的 inserted-row 索引修复，但未读 include 源码）。
