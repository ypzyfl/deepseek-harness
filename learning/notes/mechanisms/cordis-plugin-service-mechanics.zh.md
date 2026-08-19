# Cordis 插件与服务的机制细节 学习笔记

状态：草稿 | 已对照验证（2026-08-18 对照 vendor/cordis/src/service.ts、docs/cordis-tutorial/01-first-plugin.zh.md、03-services.zh.md；2026-08-19 对照 vendor/cordis/src/registry.ts、fiber.ts、vendor/loader/src/index.ts、tree.ts、config/entry.ts、packages/boot/app-boot/src/index.ts）

## 事实源（链接，不复述）

- [vendor/cordis/src/service.ts](../../../vendor/cordis/src/service.ts) — `Service` 构造函数（第 42–58 行）
- [vendor/cordis/src/registry.ts](../../../vendor/cordis/src/registry.ts) — `ctx.plugin()` 创建 runtime、读 `plugin.name`（第 322–326 行）
- [vendor/cordis/src/fiber.ts](../../../vendor/cordis/src/fiber.ts) — `Fiber.name` getter 回退链（第 335–341 行）
- [vendor/loader/src/index.ts](../../../vendor/loader/src/index.ts) — `unwrapExports` 解包逻辑（第 192–199 行）
- [vendor/loader/src/config/tree.ts](../../../vendor/loader/src/config/tree.ts) — `import()` 三种导入方式（第 145–162 行）
- [vendor/loader/src/config/entry.ts](../../../vendor/loader/src/config/entry.ts) — `_init`/`_start` 解包后挂载（第 277–296 行）
- [packages/boot/app-boot/src/index.ts](../../../packages/boot/app-boot/src/index.ts) — dsh 的 `boot()` 用同一套 Loader（第 14–16、771、774 行）
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

## 四、注册可逆的实现侧：Fiber 的 disposer 收集机制

「注册可逆」的**使用侧**是「每个注册配 disposer」（见实践规则），而**实现侧**是 Cordis 的 Fiber 机制。这一节回答两个问题：卸载时注销**由谁实现**、**哪些 API 会自动注销**。

### 实现机制：`ctx.effect` 是唯一原语，Fiber 卸载时逆序执行

**完整因果链**（以 `ctx.tools.register` 为例，`tools/src/index.ts` 第 1037–1062 行）：

```
ctx.tools.register(tool)
  → 内部调 ctx.effect(...)，disposer = 「把 tool 从 registry 删掉」
  → disposer 被收集进当前 fiber 的 _disposables 列表
  → 插件（fiber）卸载时，Fiber.dispose 逆序调用所有 disposer
  → 其中就包括「注销工具」这个 disposer
```

关键点：

1. **核心原语只有 `ctx.effect` 一个**，其余都是它的封装：
   - `ctx.on(event, cb)` = effect + 往事件表注册，disposer = 注销监听器；
   - `ctx.plugin(plugin)` = effect + 挂子 fiber，disposer = 卸载子 fiber。
2. **`Fiber.dispose` 逆序执行 disposer**（`fiber.ts` 第 71 行 JSDoc：Disposers run in reverse registration order when the owning fiber unloads）。逆序保证「后注册的先拆」，满足 teardown 顺序要求。
3. **`tools.register` 不是「自己知道怎么注销」**，而是借助 `ctx.effect` 把「注销动作」登记为当前 fiber 的 effect。真正执行注销的是 Fiber 生命周期——这解释了为什么「卸载时注销」不由 `register` 自己实现，而由 Cordis 统一调度。

### 如何判断一个方法「会自动注销」

**通用法则**：看返回值——**返回 `() => void`（disposer 函数）的方法，必然内部走了 `ctx.effect`，卸载时自动注销**；其 JSDoc 通常写「`@returns the exact disposer that ...`」。

**同类自动注销 API（举例）**：

| 层次 | API | 注册什么 |
|---|---|---|
| Cordis 原语 | `ctx.effect(fn)` | 任意副作用 |
| Cordis 原语 | `ctx.on(event, cb)` | 事件监听器 |
| Cordis 原语 | `ctx.plugin(plugin)` | 子插件 fiber |
| harness 服务 | `ctx.tools.register(tool)` | 工具 |
| harness 服务 | `ctx.tools.restrict(filter)` | 工具可见性限制 |
| harness 服务 | `ctx.systemPrompt.section(...)` | 系统提示词片段 |
| 各能力服务 | `shell`/`fs`/`web`/`subagent` 的 `register` 类方法 | 对应 provider |

核心规律：**注册即 effect，effect 必可逆，可逆靠 fiber 逆序执行 disposer**。这也正是根 AGENTS.md「Registrations are effects」的机制内涵。

## 五、插件入口与命名：`export const name` 的真相

### 1. `export const name` 是「显示名」，与 Service 的注册 key 是两回事

`export const name = 'xxx'` 是**可选的插件显示名称**，唯一作用是「诊断/日志里标识这个插件是谁」，不是功能必需。它与 `super(ctx, 'xxx')` 里的 `name` **完全无关**：

| | `export const name` | `super(ctx, name)` 的 name |
|---|---|---|
| 是什么 | 插件的**显示名称**（诊断用） | 服务的**注册 key**（`ctx.<key>`） |
| 谁读 | `ctx.plugin()` 存进 `runtime.name` | `reflect.provide(name, ...)` 注册服务 |
| 可否省略 | 可（回退到 'root'） | 不可（服务必须有个 key） |

教程 03 里两者都叫 `'greeter'` 纯属巧合（同名），是**两个独立的 name**。

### 2. `Fiber.name` 的回退链（不写 `export const name` 时显示什么）

`registry.ts` 第 324–326 行：`ctx.plugin()` 创建 runtime 时读 `plugin.name`，**若恰好等于 `'apply'` 就清成 `undefined`**：

```typescript
let name = plugin.name
if (name === 'apply') name = undefined   // 视为「没起名」，避免一堆插件都显示成 apply
```

`fiber.ts` 第 335–341 行：`Fiber.name` 的取值优先级（高→低）：

1. 显式 `export const name = 'xxx'` → 用它（推荐做法）。
2. 无显式 name，但函数名非 `apply`（如 `export default function myPlugin`）→ 用函数原生 `.name`（`myPlugin`）。
3. 函数名恰好是 `apply`（教程最常见的 `export function apply`）→ 被清成 `undefined`，等于「没起名」。
4. 以上都没有 → 沿父 fiber 向上找，最终到根 → **`'root'`**。

**对教程来说**：所有示例都是 `export function apply`，所以不写 `name` 的实际结果是 `'root'`。

### 3. 「命名导出 apply」vs「default 导出函数」：loader 拿到的不是同一个东西

loader 导入模块后，用 `unwrapExports`（`loader/index.ts` 第 192–199 行）解包：

```typescript
unwrapExports(exports) {
  exports = exports.default ?? exports   // 有 default 用 default，否则整个模块对象
  ...
}
```

两种写法的差异：

| 写法 | loader 拿到什么 | 插件形态 | 函数名要求 |
|---|---|---|---|
| `export function apply`（命名导出） | 整个模块对象（含 apply/name/类等） | 对象插件（取 `.apply`） | 必须叫 `apply` |
| `export default function xxx` | 函数本身 | 函数插件 | 任意 |

所以「只有 apply 会被调用」不是普遍规则，而是「教程这种 `export function apply` 写法」的结果：模块导出的是**对象**，loader 按「对象插件」取它的 `.apply` 方法。若用 `export default function xxx`，loader 拿的是函数本身，名字无所谓。

### 4. 教程 loader = dsh loader：同一套 vendored loader

dsh 实际用的就是教程那套 `@deepseek-ai/cordis-plugin-loader` + `include`。`app-boot/src/index.ts` 的 `boot()`（第 771、774 行）就是教程 `bin.js` 的「放大版」：

| | 教程 `bin.js` | dsh `boot()` |
|---|---|---|
| 挂 Loader | `ctx.plugin(Loader)` | `ctx.plugin(Loader)` |
| 挂 Include 读配置 | `loader.create({ path: './cordis.yml' })` | `mountRootInclude(ctx, absoluteConfigPath, ...)` |
| 解包导出 | `unwrapExports` | 同一个 `unwrapExports` |

唯一升级：dsh 的 `mountRootInclude` 给 `import` 加了「双锚点解析」（安装目录 + profile 目录），用来解析 `@deepseek-ai/dsh-base` 这类裸包名（对应 `profile.ts` 的 `resolveBundleDir`）。但**这不影响「插件入口怎么识别」**——`apply` 约定、三种形态完全一致。所以教程里建立的 loader 心智模型可直接迁移到 dsh。

### 5. `cordis.yml` 的 `id` / `name` 与插件的 `export const name` 三方辨析

`cordis.yml` 的每个配置项有 `id` 和 `name` 两个字段（`loader/src/config/entry.ts` 的 `EntryOptions` 接口）：

```typescript
export interface EntryOptions {
  id: string      // Stable id inside the containing entry tree. —— 配置项稳定标识
  name: string    // Module specifier imported by the entry tree. —— 模块标识符
  config?: any
}
```

三者完全不同，别被「都叫 name / 都像标识」骗到：

| | `cordis.yml` 的 `id` | `cordis.yml` 的 `name` | `.ts` 的 `export const name` |
|---|---|---|---|
| 是什么 | 配置项在配置树里的**稳定标识** | **模块标识符（specifier）** | 插件的**显示名称** |
| 谁写 | 你在 cordis.yml 写 | 你在 cordis.yml 写 | 你在插件文件写 |
| 层级 | 配置层 | 配置层 | 插件层 |
| 作用 | loader 按 id 判断「改」还是「删了重加」 | loader import 这个模块 | 诊断/日志标识插件 |
| 可否省略 | 可，但省略会每次生成随机 id（导致热重载时被当成删了重加） | 不可（必须能 import 到东西） | 可（回退 'root'） |

### 6. 配置项字段的完整语义

上一节的表格是「三方辨析」，这里补足两个字段各自的**完整机制**，避免只停留在「它们不同」的层面。

#### `id`：省略的代价是热重载退化为「删了重加」

- **`id` 只活在 `cordis.yml`，不是插件的任何导出**，和 `.ts` 文件无对应关系。
- 它给配置项一个**稳定标识**，让 loader 能区分「修改一个已有配置项」与「先删除再加一个新配置项」。
- **省略 `id` 的后果**（教程 06 明确强调）：每次读取配置，loader 都会用 `Math.random()` 生成一个新随机 id（`tree.ts` 第 66–73 行 `ensureId`）。于是「改配置」会被当成「删了旧的、加了新的」，导致插件**重新挂载**（而不是就地更新），丢失运行时状态、触发不必要的卸载/重载。
- **结论**：需要热重载/就地更新的插件，**显式写 `id`**；一次性装配、不在意状态的场景才可省。

#### `name`：模块标识符的三种形式

`name` 是 loader 用来 `import` 模块的 **specifier**，按前缀分派（`tree.ts` 第 145–162 行 `import(name)`）：

| 形式 | 写法示例 | 解析方式 |
|---|---|---|
| 内置 | `cordis:include` | `ctx.loader.builtins[name.slice(7)]`，查内置表 |
| 相对路径 | `./hello.ts` | `import(new URL(name, ctx.baseUrl).href)`，相对配置所在目录 |
| 裸包名 | `@deepseek-ai/cordis-plugin-timer` | `import(name)`，走 node_modules 解析 |

- `name` 的语义是「**import 的模块标识符**」，不是「必须是 package 或目录」——三种形式最终都落到「能不能 import 到东西」。
- dsh 组合层里，`bareModuleBaseUrl` 会替换 `name` 的解析锚点（对应 profile 的「双锚点解析」），但三种形式的分派逻辑不变。

## 我曾经的误解（原以为 → 实际是 → 修正来源）

1. **原以为** `Service` 抽象类一定声明了抽象方法、子类必须实现才能用；**实际是** 它不声明抽象方法，「服务化」全在构造函数 `super(ctx, name)` 里，`abstract` 只是禁止直接 `new Service()`。修正来源：`service.ts` 第 42–58 行。
2. **原以为** 插件必须 `export function apply`；**实际是** `apply` 只是函数/对象形态的入口名，类插件没有 `apply`，靠 `super(ctx, name)` 注册。修正来源：教程 01「其他两种插件形态」。
3. **原以为** 教程 03 里 `GreeterService` 类和 `apply` 是「两种等价入口」；**实际是** 是「定义 + 挂载」的分工——类负责「是什么」，`apply` 负责「把它 `ctx.plugin` 挂上树」。修正来源：教程 03 代码结构。
4. **原以为** `export const name` 和 `super(ctx, name)` 里的 name 是同一个东西；**实际是** 前者是「显示名」（诊断用、可省），后者是「注册 key」（`ctx.<key>`、不可省），两个独立的 name。修正来源：`registry.ts` 第 324–326 行 + `service.ts` 第 57 行。
5. **原以为** 不写 `export const name` 时显示为「默认函数名」；**实际是** 教程的 `export function apply` 会被 Cordis 特意清掉（名字恰是 apply 视为未命名），最终回退到 `'root'`。修正来源：`registry.ts` 第 325 行 + `fiber.ts` 第 335–341 行。
6. **原以为** 「只有 apply 会被调用」是普遍规则；**实际是** 那是「`export function apply`（命名导出）→ 对象插件取 `.apply`」的特定结果，`export default function` 则拿函数本身、名字无所谓。修正来源：`loader/index.ts` `unwrapExports` + `entry.ts` `_init`/`_start`。

## 验证方式

- 教程 03 动手：交换 `cordis.yml` 两行顺序 → 输出不变（依赖决定启动）；移除 `greeter.ts` → 静默退出无输出（PENDING）。
- `vendor/cordis/src/service.ts` 第 57 行 `reflect.provide` 是注册核心。
- `vendor/cordis/src/registry.ts` 第 324–326 行：`plugin.name` 读取 + `apply` 清空。
- `vendor/loader/src/index.ts` 第 192–199 行：`unwrapExports` 解包。

## 遗留问题

- `ctx.get()` 与 `ctx.<key>` 直接访问在「缺失时」的行为差异（`ctx.get` 返回 undefined，`ctx.<key>` 是否抛错）尚未逐一验证。
