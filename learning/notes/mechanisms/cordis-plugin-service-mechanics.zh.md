# Cordis 插件与服务的机制细节 学习笔记

状态：草稿 | 已对照验证（2026-08-18 对照 vendor/cordis/src/service.ts、docs/cordis-tutorial/01-first-plugin.zh.md、03-services.zh.md）

## 事实源（链接，不复述）

- [vendor/cordis/src/service.ts](../../../vendor/cordis/src/service.ts) — `Service` 构造函数（第 42–58 行）
- [docs/cordis-tutorial/01-first-plugin.zh.md](../../../docs/cordis-tutorial/01-first-plugin.zh.md) — 三种插件形态
- [docs/cordis-tutorial/03-services.zh.md](../../../docs/cordis-tutorial/03-services.zh.md) — 服务 + inject 依赖
- [notes/architecture/plugin-service-seam.zh.md](../architecture/plugin-service-seam.zh.md) — 概念层级（姊妹篇，本篇是机制深化）

## 它是什么（用自己的话）

本篇回答「插件/服务**具体怎么运转**」的三个机制问题：`Service` 子类凭什么「什么都不实现」就成了服务？插件入口为什么有的是 `apply` 有的是类？`inject` 依赖如何调度启动？这三个问题合起来，是把「插件/Service」从「概念」落到「机制」的关键。

## 一、`Service` 抽象类：抽象性在「禁止直接实例化」，不在「要求实现方法」

`Service` 是 `abstract class`，但它**不声明任何抽象方法**。它的「服务化」动作全部在**构造函数**里，核心只有一行：

```typescript
constructor(protected ctx: Context, name: string) {
  name ??= this.constructor['provide'] as string   // 服务名：显式传参优先，否则用静态 provide 字段
  let self = this
  // ... 若实现了 [Service.invoke]，把 self 换成「可调用对象」...
  self.ctx = ctx
  self.name = name
  // ...
  self.ctx.reflect.provide(name, self, this[symbols.check])  // ← 核心：注册到 ctx.<name>
  return self
}
```

要点：

- **「成为服务」= 执行到 `reflect.provide(name, self)` 这一行**。子类唯一必须做的，是调用 `super(ctx, name)` 让构造函数跑起来，其余基类代劳。
- **`abstract` 的作用是「禁止 `new Service()`」**（基类没有具体服务名和业务，直接实例化无意义），不是「强制子类实现方法」。
- **那些 `static readonly init/check/config/invoke/extend = symbol`** 是「可选扩展点」钩子，不是必须实现的抽象方法：`invoke`（让服务可被调用，如 `ctx.logger()`）、`check`（可用性谓词）、`extend`（派生扩展实例）。`GreeterService` 一个都不实现也能正常工作。
- **`return self`**：如果 `self` 被 `invoke` 替换成了可调用对象，`new` 表达式应返回那个对象而非原始 `this`，所以构造函数显式返回 `self`。

## 二、三种插件形态：`apply` 不是唯一入口

Cordis 接受三种插件形态（教程 01「其他两种插件形态」节）：

1. **函数插件**：`export function apply(ctx) {}` —— 最常见。
2. **对象插件**：`export const obj = { name, apply(ctx) {} }` —— 带 `apply` 方法的对象。
3. **类插件**：`export class X extends Service { constructor(ctx){ super(ctx, name) } }` —— **没有 `apply`**。

关键辨析：**`apply` 只是「函数/对象」形态里入口的名字，不是三种形态通用的必需物**。类插件靠「构造函数 + `super(ctx, name)`」完成注册，不导出 `apply`。

**「定义类」≠「挂载类」**：教程 03 里 `greeter.ts` 同时有 `GreeterService` 类和一个 `apply` 函数，是因为：

```typescript
export class GreeterService extends Service { ... }  // 定义服务
export function apply(ctx: Context) {
  ctx.plugin(GreeterService)   // apply 是入口，负责把类挂上树
}
```

- `GreeterService` 类只是「定义」，不会自动上树；必须有人调 `ctx.plugin(GreeterService)`，Cordis 才会 `new` 它、执行 `super(ctx, 'greeter')` 完成注册。
- 这个「有人」就是 `apply` 函数——loader 加载模块时调 `apply(ctx)`，`apply` 里 `ctx.plugin(GreeterService)` 把类挂上树。
- 所以教程 03 是「类插件（服务本体）+ 函数插件（挂载入口）」的组合。
- 这是「注册是效果」的又一体现：`ctx.plugin(...)` 本身就是一个 effect。

**何时用哪种**（教程 01 官方建议）：默认用函数插件（轻量，适合注册副作用/监听事件）；需要公开服务时才用类插件（只有类能通过 `super(ctx, name)` 占据 `ctx.<key>`）。

## 三、`inject` 依赖机制：硬依赖 vs 可选依赖，且持续跟踪

**`inject` 声明硬依赖**：

```typescript
export const inject = ['greeter']   // 启动前必须已存在 ctx.greeter
```

- Cordis 让插件保持 PENDING，直到 `inject` 列出的每项服务都存在；`apply` 内可保证 `ctx.greeter` 已就绪。
- **加载顺序无关紧要**：决定启动的是依赖关系，不是 `cordis.yml` 的文件顺序（交换两行输出不变）。
- **consumer 只声明服务名，不导入提供方** → 换提供方无需改 consumer。这是「扩展插件只依赖 Service Definition、从不依赖具体 Provider」在 Cordis 层的落地。
- **缺失时静默 PENDING**：移除提供方，consumer 不输出、不崩溃，进程静默以 0 退出（PENDING fiber 不阻塞事件循环）。

**可选依赖用 `ctx.get()`**（缺了也能运行）：

```typescript
const greeter = ctx.get('greeter')   // 无提供方时返回 undefined
console.log(greeter?.greet('maybe') ?? 'no greeter available')
```

**依赖持续跟踪，不是一次性检查**：运行期间提供方被卸载/热替换，依赖它的 consumer 也跟着卸载（防止持失效引用），服务恢复后再加载。这是「配置里可替换服务」的生命周期基础——卸载 `dsh-bash-local`、挂另一个 shell 提供方，所有 `inject: ['shell']` 的插件自动重启用新实现。

## 我曾经的误解（原以为 → 实际是 → 修正来源）

1. **原以为** `Service` 抽象类一定声明了抽象方法、子类必须实现才能用；**实际是** 它不声明抽象方法，「服务化」全在构造函数 `super(ctx, name)` 里，`abstract` 只是禁止直接 `new Service()`。修正来源：`service.ts` 第 42–58 行。
2. **原以为** 插件必须 `export function apply`；**实际是** `apply` 只是函数/对象形态的入口名，类插件没有 `apply`，靠 `super(ctx, name)` 注册。修正来源：教程 01「其他两种插件形态」。
3. **原以为** 教程 03 里 `GreeterService` 类和 `apply` 是「两种等价入口」；**实际是** 是「定义 + 挂载」的分工——类负责「是什么」，`apply` 负责「把它 `ctx.plugin` 挂上树」。修正来源：教程 03 代码结构。

## 验证方式

- 教程 03 动手：交换 `cordis.yml` 两行顺序 → 输出不变（依赖决定启动）；移除 `greeter.ts` → 静默退出无输出（PENDING）。
- `vendor/cordis/src/service.ts` 第 57 行 `reflect.provide` 是注册核心。

## 遗留问题

- `ctx.get()` 与 `ctx.<key>` 直接访问在「缺失时」的行为差异（`ctx.get` 返回 undefined，`ctx.<key>` 是否抛错）尚未逐一验证。
- loader 具体如何「识别模块导出的三种形态」的源码逻辑（在 loader 包，非 cordis 核心）未读。
