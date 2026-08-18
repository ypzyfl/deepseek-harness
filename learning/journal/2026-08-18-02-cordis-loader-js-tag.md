# Cordis Loader 配置：`!!js` 的澄清

日期：2026-08-18

## 起因

读 [cordis-primer.zh.md](../../docs/cordis-primer.zh.md)「Loader 配置」节时，不明白这节的重点是什么、在说哪件事、为什么强调 `!!js`。

## 澄清结论

**这节在回答一个问题**：`cordis.yml` 是静态 YAML，但有些配置值要「加载时」才算得出来——怎么在静态文件里表达「动态值」？答案是 `!!js` 标签。

```
cordis.yml 是静态配置 → 但有些值要运行时才算 → !!js 允许把一段 JS 表达式写进 YAML
```

**为什么强调 `!!js`（三个层面）**：

1. **它是「静态 YAML」与「动态 JS」之间的唯一桥**。YAML 只能写字面量，`!!js` 让某个值从「字面量」变成「一段会执行的表达式」：`greeting: !!js process.env.DEMO_GREETING ?? 'Hello'` 里 `greeting` 的值是执行结果，不是字符串。

2. **它只允许用在两个字段：`config` 和 `disabled`**。其余字段（`name`/`id`/`inject`）保持静态，`!!js` 在那里是普通字面量不执行。原因是「结构字段决定组合结构（谁是谁、谁依赖谁），必须稳定可预测；`config`/`disabled` 是行为参数，允许动态」。这个「静态结构 + 动态参数」的边界是组合层可靠性的来源。

3. **配合 `disabled` 能按环境门控一行**：`disabled: !!js process.platform === 'win32'` 在每次挂载决策时基于 loader 上下文求值，可以「按平台决定这一行装不装」。与 overlay 配套：overlay 决定「哪些行在场」，`!!js disabled` 决定「某一行在什么条件下生效」。

## 关键提醒（根 AGENTS.md 的笔误陷阱）

根 AGENTS.md 强调 cordis.yml 允许 `!!js`（**never `!js`**）——`!js` 只有一个感叹号，是 YAML 里不同含义的标签，写错会导致表达式不执行，属于高危笔误。

### `!!js` 不是标准 YAML 标签，是 loader 自定义标签

追问「`!!js` 和 `!js` 似乎不是合法 YAML 语法」后澄清：`!!js` 不是 YAML 标准的内置标签，而是**本仓库 loader（`@deepseek-ai/cordis-plugin-include`）注册的自定义标签**；它只在被这个 loader 读取时才触发「执行 JS 表达式」，换标准 YAML 解析器去读，`!!js` 就只是一个不认识的标签、不会执行任何东西。

- `!!js`（双感叹号）= YAML「全局标签」语法，指向显式声明的标签；本仓库 loader 注册了它。
- `!js`（单感叹号）= YAML「本地标签」语法，语义取决于文档自己的 `%TAG` 指令，无 `%TAG` 时就是未绑定标签；本仓库 loader **不注册它**。

因此「never `!js`」的实质是：写 `!js` 会让本应「动态求值」的配置**静默退化成静态字符串**，且**不报错**——这是 silent failure，比直接报错更危险。

## 事实源

- [docs/cordis-primer.zh.md](../../docs/cordis-primer.zh.md)「Loader 配置」节。
- [docs/cordis-tutorial/05-config.zh.md](../../docs/cordis-tutorial/05-config.zh.md)「计算得到的配置值」节。

## 遗留 / 待验证

- `!!js` 的完整机制（`@deepseek-ai/cordis-plugin-include` 如何解析、嵌套表达式如何延迟到目标行激活）留到教程 05/06 动手后再回来补。
