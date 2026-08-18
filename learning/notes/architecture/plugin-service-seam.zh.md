# 插件 / Service / seam 的层级关系 学习笔记

状态：草稿 | 已对照验证（2026-08-18 对照 vendor/cordis/src/service.ts、vendor/cordis/README.md、docs/glossary.zh.md capability-seam 词条、docs/cordis-primer.zh.md）

## 事实源（链接，不复述）

- [docs/cordis-primer.zh.md](../../../docs/cordis-primer.zh.md) — 五个核心概念（「插件是实现 Service 的对象」）
- [vendor/cordis/src/service.ts](../../../vendor/cordis/src/service.ts) — `Service` 抽象基类（`super(ctx, name)` 注册到 `ctx.<name>`）
- [docs/glossary.zh.md](../../../docs/glossary.zh.md) — capability-seam 词条（Service Definition 是 Cordis `Service`）
- [notes/architecture/seam-and-replaceability.zh.md](seam-and-replaceability.zh.md) — seam 三角色（姊妹篇）

## 它是什么（用自己的话）

「插件」「Service」「seam」是三个不同抽象层次的词，描述同一运行中的东西，只是视角不同：插件是 Cordis 框架层的「挂载单元」，Service 是「挂在 `ctx.<key>` 上的能力」，seam 是 harness 产品层的「可替换能力」。Service 是两者的交汇点——它既是插件能实现的东西，也是 seam 的「定义」这一角。

## 层级关系

```
Cordis 层（阶段 2）：  插件 ──实现──▶ Service（ctx.<key>）
harness 层（阶段 4）：  seam = Service Definition + Provider + Consumer
                              └── 定义这一角就是一个 Service
```

## 三个概念的边界

1. **插件（挂载单元）**：被 `ctx.plugin()` 挂载、得到 Fiber 的代码单元，有生命周期、可卸载。它**可以**是 `Service` 子类（有 key），**也可以**只是用 `ctx.on()`/`ctx.effect()` 注册副作用的纯函数（无 key，如 primer Quick Start 的 `greeter`）。所以「插件是实现 Service 的对象」是常见形态而非唯一形态。

2. **Service（挂载点）**：`service.ts` 里 `Service` 是抽象基类，`super(ctx, name)` 把实例注册到 `ctx.<name>` 上（`ctx.reflect.provide(name, this, ...)`），随所属 fiber 卸载自动移除。它回答「有没有挂在 ctx 上、对外暴露 API」。

3. **seam（可替换能力）**：围绕同一个 Service 的「一群插件 + 那个 Service 定义本身」——Service Definition（`ctx.<key>` 的 Cordis `Service`）+ Provider（实现它的插件）+ Consumer（`inject` 它的插件）。glossary 强调「seam 是完整能力，绝不是其中一个角色」。

## 「是 Service」与「是 seam」是两个独立判断

| | 是 Service（占据 ctx key） | 是 seam（可替换能力） |
|---|---|---|
| `ctx.shell` | ✅ | ✅（Provider 可换） |
| `ctx.session` / `ctx.tools` / `ctx.agents` | ✅ | ❌（spine，稳定骨干） |
| 纯函数插件（如 greeter） | ❌ | ❌（只是副作用） |

一句话：**Service 是「有没有挂在 ctx 上」；seam 是「这个挂载点能不能换实现」。两者正交。**

## seam ≠ 「可替换的 Service」

常见但错误的措辞是「seam 就是可替换的 Service」。要收紧：seam 不是「一个 Service」，而是「**以某个 Service 为中心、由 Def + Provider + Consumer 三角色拼成的完整可替换能力**」；Service 只是「定义」这一角落到 Cordis 上的载体。

- 错误读法会把「Service」当成核心、把「seam」当成 Service 的一个修饰语，进而推出「`ctx.session` 是『不可替换的 Service』」这类表述——逻辑没错，但把语义重心放错了位置。
- harness 里的语义是反过来的：**seam 是产品层的组织单位（一个可替换能力），Service 只是它「定义」这一角借用的 Cordis 机制**。glossary 原文「seam 是完整能力，绝不是其中一个角色」正是堵这个口。

## 与 spine 的连接（补昨天「core 是不是 seam」的底层解释）

core 七包（`session`/`tools`/`agent`/…）**也是 Cordis Service**（有 `ctx.session`/`ctx.tools`/`ctx.agents` 等 key），但它们**不是 seam**，因为它们承诺 stable API、不可替换。所以「是 Service」和「是 seam」必须分开判断，不能从「挂上了 ctx」推出「可替换」。

## 我曾经的误解（原以为 → 实际是 → 修正来源）

1. **原以为**「插件」和「Service」是同一概念的两个别名，可随意混用；**实际是** 它们侧重不同——「插件」强调可挂载/有生命周期，「Service」强调占据 `ctx.<key>` 暴露 API，且存在无 key 的纯函数插件。修正来源：`service.ts` + primer Quick Start 的 `greeter` 反例。

## 验证方式

- `vendor/cordis/src/service.ts` 第 42–58 行：`Service` 构造函数 `super(ctx, name)` 调 `ctx.reflect.provide(name, this, ...)`。
- `vendor/cordis/README.md` Quick Start：`Counter extends Service`（有 key）与 `greeter`（纯函数插件、无 key）对照。

## 遗留问题

（无）
