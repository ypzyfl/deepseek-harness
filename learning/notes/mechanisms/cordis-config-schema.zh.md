# Cordis 配置校验与默认值机制 学习笔记

状态：草稿 | 已对照验证（2026-08-19 对照 vendor/cordis/src/fiber.ts、docs/cordis-tutorial/05-config.zh.md；2026-08-25 对照 vendor/include/src/index.ts 的 `applyEntryPatches`、scripts/verify-cordis-config.ts 的字段校验逻辑，补 `cordis.yml` vs `cordis.patch.yml` 内容说明与 patch 边界语义）

## 事实源（链接，不复述）

- [vendor/cordis/src/fiber.ts](../../../vendor/cordis/src/fiber.ts) — `resolveConfig`（第 50–60 行）、`_resolveConfig`（第 641–644 行）、`_reload`（第 646–658 行）、`ValidationError`（第 18–40 行）
- [docs/cordis-tutorial/05-config.zh.md](../../../docs/cordis-tutorial/05-config.zh.md) — 配置 + schema + 默认值 + `!!js`
- [vendor/include/src/index.ts](../../../vendor/include/src/index.ts) — `applyEntryPatches`（第 58–128 行）、`PatchOptions`（第 145–156 行）：patch 的 insert/覆盖边界语义
- [scripts/verify-cordis-config.ts](../../../scripts/verify-cordis-config.ts) — `metadataFields`（第 40 行）、`metadataExpressionErrors`（第 453–475 行）：哪些字段可 `!!js` 插值

## 附：`cordis.yml` vs `cordis.patch.yml` 内容说明

两者是**同一种格式**（Cordis Loader 配置条目列表），区别只在用途语义：

- **`cordis.yml`** —— 根配置（root/leaf config），顶层是 YAML 数组，每个元素是一条 Loader 条目（entry），这份列表就是全部，从零装配。
- **`cordis.patch.yml`** —— 一层补丁（patch layer），对已有条目做增 / 改 / 禁。

profile 场景下 `~/.dsh/profiles/<name>/cordis.yml` 内容固定是空列表 `[]`，由 `prepareProfile` 每次启动重写，唯一作用是给 Loader 一个真实 include 根来锚定 `baseUrl`；真正装配全由 `cordis.patch.yml` 层完成（空根 + 层层 patch）。

### 条目字段清单

来源是 `verify-cordis-config.ts` 的 `metadataFields`（`id`/`name`/`group`/`inject`/`intercept`/`isolate`），加上 `config`/`disabled`/`insert`：

| 字段 | 含义 | 能否用 `!!js` |
|---|---|---|
| `id` | 条目唯一标识，后续 patch 按它定位（覆盖/禁用） | ❌ 必须静态 |
| `name` | 插件包 specifier（包名，或「包名 + 子路径」指向该包的某个导出入口） | ❌ 必须静态 |
| `group` | 分组（`cordis:group` 条目，把 provider 与 consumer 放进同一 `isolate` realm） | ❌ 必须静态 |
| `inject` | 服务依赖注入列表（激活前等待这些服务就绪） | ❌ 必须静态 |
| `intercept` | 拦截的服务列表 | ❌ 必须静态 |
| `isolate` | 隔离 realm | ❌ 必须静态 |
| `config` | 插件配置（传给 `apply(ctx, config)`，经 schema 校验 + 补默认值） | ✅ **可插值**（注入激活后、对该插件上下文求值） |
| `disabled` | 布尔，禁用该条目 | ✅ **可插值**（每次挂载决策时、对 loader 上下文求值） |
| `insert` | patch 操作：新增一个/多个条目 | 其内部条目按普通 entry 规则校验 |

只有 `config` 与 `disabled` 允许 `!!js`，其余 metadata 字段必须完全静态——在这些字段写 `!!js` 会被 `verify-cordis-config` 报 `!!js is not interpolated here`，且表达式会变成「真值数据」静默改变组合（隐患）。

### patch 的三种操作 + 边界语义

`applyEntryPatches` 把每个 patch 元素按是否含 `insert` 分成两类，边界行为是精确的（不是「猜」）：

```yaml
# ① 覆盖：按 id 定位，整行替换 config（未改字段也要重述）
- id: system-prompt
  config:
    persona: >-
      You are a coding agent powered by the {{model}} model.

# ② 新增：insert 一个或多个新条目
- insert:
    - id: headless-runner
      name: '@deepseek-ai/dsh-headless'
      inject: [headlessStartup]
      config:
        task: !!js ctx.headlessStartup.task

# ③ 禁用：置 disabled（可写 !!js 表达式）
- id: tool-bash
  disabled: !!js process.platform === 'win32'
```

边界语义的源码证据（`applyEntryPatches` 第 77–125 行，节选）：

```javascript
for (const patch of patches) {
  const { id, insert, name, ...overrides } = patch

  if (insert) {
    if (id) { ... target.config.push(...insert) }   // 有 id：往 group 里追加
    else { data.push(...insert) }                    // 无 id：往顶层数组追加
    buildMap(insert)   // 关键：把新增的行索引进 entryMap
    continue
  }

  const target = entryMap.get(id)
  if (!target) {
    warn('patch: entry %C not found', id)
    continue        // ← 覆盖遇 id 不存在：跳过，不新增
  }
  if (name && name !== target.name) {
    warn('patch: name mismatch for %C ...', id)
    continue
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (key === 'id') continue
    target[key] = value
  }
}
```

边界语义（源码第 77–125 行）：

- **覆盖（非 insert）遇到 id 不存在：不新增，警告 `patch: entry <id> not found` 并跳过**（第 110–114 行）。覆盖只作用于已存在条目，绝不隐式创建。
- **insert 遇到 id 已存在：不覆盖，直接 `push` 追加**（第 80–95 行）。insert 不检查目标 id 是否已存在，若插入同 id 新行，数组里会出现两条同 id 条目；`buildMap` 的 `entryMap.set` 后写覆盖前写，后续 patch 命中最后插入那条，旧行仍在树里可能被重复激活。
- **带 `name` 的覆盖有 name 一致性校验**：patch 写了 `name` 且与目标 `name` 不一致时，警告 `name mismatch ... skipping` 并跳过（第 116–119 行）；`name` 缺省或一致才继续覆盖。
- **`buildMap(insert)` 让同层后续 patch 能命中刚 insert 的行**（第 96–102 行注释）：insert 的新条目立即被索引，所以同一份 patch 列表里，后面的 patch 可以覆盖/禁用前面刚 insert 的行。
- **覆盖的「整行」具体指**：除 `id`/`insert`/`name` 外的其余字段（`config`/`disabled`/`inject`/`intercept`/`isolate`/`group`）全算 overrides，逐一 `target[key] = value` 赋到目标上（第 78、121–124 行），所以 `config` 是整体替换、不做深度合并。

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
