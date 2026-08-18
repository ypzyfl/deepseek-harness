# 阶段 2（Cordis 框架）执行路线与进度

本文是阶段 2 的**执行路线 + 逐步勾选进度**：把 [learning-path.zh.md](../learning-path.zh.md) 阶段 2 的「精读材料 + 动手任务 + 过关检验」拆成可逐步推进的小步骤，并标出每步的验证点与学习区落盘动作。事实源仍是 learning-path.zh.md，本文不重复其内容、只做执行拆解；冲突以 learning-path.zh.md 为准。

过关标准（来自 learning-path.zh.md 完成标志表阶段 2 行）：① 能指出一段插件代码里 `ctx.effect()` / `ctx.on()` 各自产生的可逆注册；② 能解释 waterfall 监听器为何必须调用 `next()`，以及不调用的后果；③ Cordis 教程 01–07 的练习全部跑通。

## 路线总览（三步，由概念到动手再到仓库）

```
第 1 步  精读 cordis-primer.zh.md ── 建立五个核心概念 + 分发模式心智模型
第 2 步  cordis-tutorial 01–07 动手 ── 每章一个可逆注册/事件分发的实感
第 3 步  回仓库验证（动手任务）── 对照「Registrations are effects」定位可逆注册
```

## 第 1 步：精读 cordis-primer.zh.md

概念框架，建立阶段 2 的入口锚点。

- [x] 五个核心概念（插件 / ctx / inject / 类型化事件 / 可逆注册）
- [x] 分发模式表格（emit / parallel / serial / bail / waterfall）
- [x] 「是否 await」列的真实含义（分发器是否 async，与监听器串行正交）—— 见 [journal/2026-08-18-01-cordis-dispatch-modes.md](../journal/2026-08-18-01-cordis-dispatch-modes.md)
- [x] 「Cordis Waterfall 语义」节（`next()` 委托与短路）—— 对应过关标准 ②
- [x] Loader 配置节（`!!js` 表达式、overlay）—— 见 [journal/2026-08-18-02-cordis-loader-js-tag.md](../journal/2026-08-18-02-cordis-loader-js-tag.md)
- [x] 实践规则节 —— 见 [journal/2026-08-18-03-cordis-practice-rules.md](../journal/2026-08-18-03-cordis-practice-rules.md)

## 第 2 步：cordis-tutorial 01–07 动手

教程文档在 [docs/cordis-tutorial/](../../docs/cordis-tutorial/index.zh.md)，每章对应一个核心概念的动手验证，全部无 key 可跑。

| 章 | 主题 | 对应过关点 | 状态 |
|---|---|---|---|
| [01](../../docs/cordis-tutorial/01-first-plugin.zh.md) | 第一个插件（函数 + loader 挂载） | 动手起点 | [x] |
| [02](../../docs/cordis-tutorial/02-lifecycle-and-effects.zh.md) | 生命周期与 effect | 过关标准 ① 的 `ctx.effect()` | [x] |
| [03](../../docs/cordis-tutorial/03-services.zh.md) | 服务（`ctx` 上公开能力 + `inject` 依赖） | 服务挂载机制 | [x] |
| [04](../../docs/cordis-tutorial/04-events.zh.md) | 事件（类型化、广播、waterfall 短路） | 过关标准 ① 的 `ctx.on()` + ② waterfall | [ ] |
| [05](../../docs/cordis-tutorial/05-config.zh.md) | 配置（`cordis.yml` 校验） | 与阶段 1 组合层衔接 | [ ] |
| [06](../../docs/cordis-tutorial/06-composition-and-hmr.zh.md) | 组合与 HMR（配置 = 插件树） | 与阶段 1 profile/bundle 衔接 | [ ] |
| [07](../../docs/cordis-tutorial/07-into-the-harness.zh.md) | 进入 harness（注册真实工具） | 把教程接到本仓库 | [ ] |

环境准备（教程 [index.zh.md](../../docs/cordis-tutorial/index.zh.md)「准备工作」节）：

```sh
mkdir -p tmp/cordis-tutorial
cd tmp/cordis-tutorial
node --import tsx ../../vendor/cordis/bin.js
```

## 第 3 步：回仓库验证（动手任务）

把教程 01 的第一个插件在本机跑起来；对照根 AGENTS.md「Registrations are effects」一行，确认自己能指出**哪一行代码产生了哪个可逆注册**。

- [ ] 跑通教程 01 第一个插件
- [ ] 定位「哪行代码 → 哪个可逆注册」（`ctx.effect()` / `ctx.on()` 各自的可逆性）

工具书（按需查，不精读）：[cordis-api/context.zh.md](../../docs/cordis-api/context.zh.md) 先读开头定位方式即可。

## 已完成的落盘产出

journal（4 篇）：

- [2026-08-18-01-cordis-dispatch-modes.md](../journal/2026-08-18-01-cordis-dispatch-modes.md) — 分发模式两个误解的修正
- [2026-08-18-02-cordis-loader-js-tag.md](../journal/2026-08-18-02-cordis-loader-js-tag.md) — `!!js` 的澄清
- [2026-08-18-03-cordis-practice-rules.md](../journal/2026-08-18-03-cordis-practice-rules.md) — 实践规则两条纪律
- [2026-08-18-04-runtime-vs-type-resolution.md](../journal/2026-08-18-04-runtime-vs-type-resolution.md) — 运行时 vs 类型解析

notes（新增 2 篇 + 补 2 篇）：

- [notes/architecture/plugin-service-seam.zh.md](../notes/architecture/plugin-service-seam.zh.md) — 插件 / Service / seam 层级关系（新增）
- [notes/mechanisms/cordis-plugin-service-mechanics.zh.md](../notes/mechanisms/cordis-plugin-service-mechanics.zh.md) — 插件/服务机制细节（新增）
- [notes/architecture/composition-layer.zh.md](../notes/architecture/composition-layer.zh.md) — 补「cordis.yml vs cordis.patch.yml」辨析
- [notes/architecture/core-spine.zh.md](../notes/architecture/core-spine.zh.md) — 补「两套分层不要混淆」辨析

## 过关检验自测（完成时逐条打勾）

- [ ] ① 能指出 `ctx.effect()` / `ctx.on()` 各自产生的可逆注册
- [ ] ② 能解释 waterfall 为何必须调用 `next()` 及短路后果
- [ ] ③ 教程 01–07 练习全部跑通
