# Cordis 配置校验与默认值机制 学习笔记

状态：草稿 | 已对照验证（2026-08-19 对照 vendor/cordis/src/fiber.ts、docs/cordis-tutorial/05-config.zh.md）

## 事实源（链接，不复述）

- [vendor/cordis/src/fiber.ts](../../../vendor/cordis/src/fiber.ts) — `resolveConfig`（第 50–60 行）、`_resolveConfig`（第 641–644 行）、`_reload`（第 646–658 行）、`ValidationError`（第 18–40 行）
- [docs/cordis-tutorial/05-config.zh.md](../../../docs/cordis-tutorial/05-config.zh.md) — 配置 + schema + 默认值 + `!!js`

## 它是什么（用自己的话）

Cordis 的配置校验靠「同名双写」：一个名字 `Config` 同时指代两个东西——`interface Config`（编译期类型，喂给消费方）和 `const Config`（运行期 schema，喂给 Cordis 校验）。默认值的「执行」发生在插件每次激活前的校验阶段，由 Cordis 调 `validate` 完成，而不是你写 `Schema.object` 时。

## 一、同名双写：一个 `Config`，两个空间

```typescript
export interface Config {          // 类型空间：编译后消失
  greeting: string
  targets: string[]
}

export const Config: Schema<Config> = Schema.object({   // 值空间：运行时存在
  greeting: Schema.string().default('Hello'),
  targets: Schema.array(String).default(['world']),
})
```

- `interface Config` 活在 **TypeScript 类型空间**，编译后完全消失，运行时不存在。
- `const Config` 活在 **值空间**，是一个真实的 schema 对象，运行时存在。
- 两者能同名共存，因为 TS 的「类型空间」和「值空间」是分离的，互不冲突。

分工：

| | 消费方（写代码时） | Cordis（运行时） |
|---|---|---|
| 用的是 | `interface Config`（类型） | `const Config`（schema 对象） |
| 何时 | 编译期 | 运行期 |
| 作用 | 让 `config.greeting` 有类型提示、自动补全 | 校验 config、补默认值 |

## 二、`Schema<Config>` 泛型是「类型 ↔ schema」的对齐点

`const Config: Schema<Config>` 里的 `Schema<Config>` 泛型，保证「schema 校验出来的结果，其类型就是 `Config` 接口」。于是：

- 消费方在 `apply(ctx, config: Config)` 里声明的类型；
- 与 Cordis 运行时用 schema 校验后得到的值；

两者类型一致，不会出现「类型说 string、运行时给 number」的错位。

## 三、默认值的执行时机与执行者

**核心：默认值是「声明」与「执行」分离的。**

- 你写 `Schema.string().default('Hello')` 只是**声明**规则，此时默认值**还没被填入**。
- 真正「执行」填默认值，是 Cordis 在插件启动前调 `validate` 的那一刻。

执行链路（`fiber.ts`）：

```
插件 fiber 激活（_reload，第 655 行）
  → this.config = this._resolveConfig(this._config)
    → ① internal/config waterfall（第 642 行，给别的插件拦截改写 config 的机会）
    → ② resolveConfig(runtime, config)（第 643 行）
        → runtime.Config['~standard'].validate(config)  ← 校验 + 填默认值，第 53 行
        → 有 issues 抛 ValidationError；否则返回 result.value（补全后的 config）
  → apply(ctx, this.config)  ← 拿到的已是补全后的 config
```

关键点：

1. **默认值在「每次激活/重载」时执行**，不是「写 cordis.yml 时」。`_reload` 每次激活都会重走 `_resolveConfig`。
2. **被 Cordis（fiber）执行，不是被你执行**。你从没主动调 `validate`，是 Cordis 启动插件前替你调。
3. **`apply` 收到的 `config` 永远是「校验通过 + 默认值已填」的最终形态**，可放心用 `config.greeting`，不必担心 cordis.yml 没写而 `undefined`。
4. **`internal/config` waterfall 在校验之前**：先给别的插件改写 config 的机会，再进 schema 校验。这呼应「配置是效果」——config 也是可被事件拦截的。

## 我曾经的误解（原以为 → 实际是 → 修正来源）

1. **原以为** `export const Config` 和 `export interface Config` 是「重复定义、会冲突」；**实际是** TS 的类型空间与值空间分离，两者同名共存是 dsh 的贯穿性模式。修正来源：教程 05 代码结构 + TS 类型/值空间知识。
2. **原以为** 默认值在 `Schema.object(...)` 里就「被填好了」；**实际是** `Schema.object` 只声明规则，真正填入发生在 Cordis 启动时调 `validate`。修正来源：`fiber.ts` `resolveConfig` 第 53 行。

## 验证方式

- 教程 05 动手：`cordis.yml` 只写 `targets` 不写 `greeting` → 输出 `Hello, ...`（默认值被补）；写 `targets: 'not-an-array'` → `ValidationError`（校验报错）。
- `vendor/cordis/src/fiber.ts` 第 53 行 `validate` 是校验 + 默认值的执行点。

## 遗留问题

（无）
