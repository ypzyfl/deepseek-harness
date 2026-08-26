# 组合层深挖：bundle 从「普通包」到「少数特殊、本质是捆」的连续翻转

日期：2026-08-25

## 起因

阶段 5 动手（greet 工具 + 独立插件工程）过程中，为了搞清楚「自定义插件如何部署」，一路追问进组合层，意外地把 bundle / 插件包 / npm 包三者的关系彻底厘清了。这一串不是一次性的豁然开朗，而是**连续多次「我以为 X → 实际是 Y」的翻转**，由我不断「亲自读文件质疑 AI 的表述」推动。

## 翻转链条（按时间顺序）

1. **`cordis.yml` 是不是随手起的名字？** 我观察到 `~/.dsh/profiles/{web,headless}/` 里**同时**有 `cordis.yml` 和 `cordis.patch.yml`，怀疑 `cordis.yml` 不是 AI 说的「随手起的名字」。查证后确认：`cordis.yml` 是**正式常量名**（`profile-boot.ts` 的 `PROFILE_ROOT_FILENAME`），是 profile 的「根配置」（空 `[]`），由 `prepareProfile` 每次启动现场重写。修正了笔记里「profile 目录没有 cordis.yml」的错误结论。

2. **bundle 是不是「自己把自己挂上树」？** 我查看所有 bundle 的 `cordis.patch.yml`，发现清单里**绝大多数 `name` 指向别的功能包**（`dsh-tools`、`dsh-session`…），几乎没有写自己。修正了「bundle 自挂载」的错误——bundle 是「装配者」，它挂的是别的包。

3. **bundle 有没有层级？** 我问「非顶层 bundle 不会被 profile 引用吧」，引出「bundle 无层级」的澄清：所有 bundle 都只由 profile 的 `bundles` 数组平铺点名，`loadProfile` 用 `bundles.map(...)` 一次性处理，没有递归，不存在 bundle 引用 bundle。

4. **`subagent-claude-code` 声明了 bundle 却没被 profile 引用？** 我发现它声明了 `dsh.bundle.patch` 却不在任何 profile 的 `bundles` 里。由此得出：`dsh.bundle.patch` 声明的是「资格」（capability），不是「已装配」的事实。

5. **bundle 是「特别的 npm 包」还是「普通 npm 包」？** 这是最大的翻转。我一直被「bundle 是插件包」误导，以为大部分 npm 包都是 bundle。实际是：全仓库只有 **5 个**包是 bundle（`dsh-base`/`dsh-web-app`/`dsh-headless`/`dsh-subagent-claude-code`/`dsh-subagent-codex`），其余几十个功能包都不是。「bundle」这个词本身的含义——把分散的插件包「捆/束」成一份装配清单——反而让我更能理解它的特殊性了。

## 关键认知

全部结论沉淀在 [notes/architecture/composition-layer.zh.md](../notes/architecture/composition-layer.zh.md)，核心是：

- bundle ≠ 插件包，而是**同一个 npm 包的两种角色**（装配者 vs 被装配者），判据是「声明了什么字段、被谁引用」。
- bundle 是**少数特殊的** npm 包，本质是把分散插件包「捆」成一份装配清单；大多数包只是「被捆进去」的插件包。
- `cordis.yml`（根）vs `cordis.patch.yml`（层）是「根 vs 层」的区分。

## 方法论收获

这一串翻转最大的收获不是记住了「bundle 是什么」，而是**验证了「亲自读文件质疑 AI 表述」的价值**：我连续 5 次用「读 `cordis.patch.yml` / `package.json` / `profile-boot.ts`」的方式，推翻或修正了 AI 的表述。这比单向听讲有效得多。

## 事实源

- [packages/boot/app-boot/src/profile.ts](../../packages/boot/app-boot/src/profile.ts) — `loadProfile` 的 `bundles.map(...)`（无递归）、`initProfile`（只创建三样）
- [apps/cli/src/profile-boot.ts](../../apps/cli/src/profile-boot.ts) — `PROFILE_ROOT_FILENAME = 'cordis.yml'`、`prepareProfile` 每次重写根
- [packages/bundle/base/cordis.patch.yml](../../packages/bundle/base/cordis.patch.yml)、[packages/bundle/web-app/cordis.patch.yml](../../packages/bundle/web-app/cordis.patch.yml) — 清单里 name 大多指向别的包
- [notes/architecture/composition-layer.zh.md](../notes/architecture/composition-layer.zh.md) — 认知落点

## 遗留 / 待验证

- 本地路径 spec（`file:`/`link:`/裸路径）在 `dsh plugin add` 时的 link-vs-copy 语义差异，尚未实验验证（已登记进 questions 池）。
