# Cordis 插件 PENDING 诊断手册

状态：草稿 | 已对照验证（2026-08-19 对照 docs/cordis-tutorial/06-composition-and-hmr.zh.md「诊断始终无法加载的插件」节）

## 何时用本手册

插件「既不执行任何操作，也不报告任何内容」——最常见原因是它 `inject` 了某个**无人提供**的服务，一直停在 PENDING。PENDING 是合法状态（提供方可能稍后才挂载），不是错误，所以不会报错、不会崩溃，进程还可能静默以 0 退出。

## 事实源（链接，不复述）

- [docs/cordis-tutorial/06-composition-and-hmr.zh.md](../../../docs/cordis-tutorial/06-composition-and-hmr.zh.md)「诊断始终无法加载的插件」节
- 相关机制见 [cordis-plugin-service-mechanics.zh.md](cordis-plugin-service-mechanics.zh.md)「inject 依赖机制」节

## 诊断代码（可直接复用）

创建 `diagnose.ts`，遍历插件注册表，找出所有 PENDING 的 fiber：

```ts
import { FiberState, type Context } from '@deepseek-ai/cordis'

export const name = 'diagnose'

export function apply(ctx: Context) {
  setTimeout(() => {
    for (const runtime of ctx.registry.values()) {
      for (const fiber of runtime.fibers) {
        if (fiber.state === FiberState.PENDING) {
          console.log(`${fiber.name} is PENDING — a required service is missing`)
        }
      }
    }
  }, 500)
}
```

要点：

- `ctx.registry.values()` 枚举所有插件 runtime；每个 runtime 有 `fibers`（同一插件可能被 `ctx.plugin()` 挂多次）。
- `fiber.state === FiberState.PENDING` 判断「等依赖未就绪」。
- `setTimeout(..., 500)` 给启动留时间，避免在依赖尚未决议时就过早检查。

## 复现一个 PENDING 场景（验证诊断代码有效）

创建依赖无法满足的插件 `needs-timer.ts`：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'needs-timer'
export const inject = ['timer']

export function apply(ctx: Context) {
  console.log('needs-timer loaded')
}
```

```yaml
- name: './needs-timer.ts'
- name: './diagnose.ts'
```

运行 `node --import tsx ../../vendor/cordis/bin.js`，预期输出：

```
needs-timer is PENDING — a required service is missing
```

修复：向列表加 `- name: '@deepseek-ai/cordis-plugin-timer'` 提供 `timer` 服务，插件即加载。

## 关键注意点（容易踩的坑）

1. **PENDING 不是错误**：不要假设「没报错 = 没问题」。PENDING 是「合法等待」状态，服务可能稍后挂载，也可能永远不挂。
2. **不加 PENDING 过滤会看到 loader 自身插件**：`Loader`、`Include` 等也是通过插件挂载的，它们在 ACTIVE 状态；若想看清全貌，去掉 `if (fiber.state === PENDING)` 过滤，能一并看到 ACTIVE 的 loader 插件。
3. **诊断代码本身也是插件**：`diagnose.ts` 也要写进 `cordis.yml` 才会被挂载运行，别忘加。
4. **HMR 场景更隐蔽**：教程 06 提到 HMR 会 `inject` `timer` 服务做去抖，没有 timer 时它「永远停在 PENDING 且不发出任何提示」——诊断时也要把 HMR 这类「静默 PENDING 的服务插件」纳入排查范围。

## 排查思路（口诀）

```
插件没反应
  → 先查 fiber.state 是否 PENDING
    → 是 PENDING：查 inject 了哪些服务、哪些没提供方（添对应 provider 包）
    → 是 ACTIVE 但没输出：查插件逻辑本身（不是依赖问题）
    → 是 FAILED：查加载报错（import/apply/config 抛异常）
```

## 遗留问题

（无）
