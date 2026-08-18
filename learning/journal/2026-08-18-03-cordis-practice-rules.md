# Cordis 实践规则：两条插件编写纪律

日期：2026-08-18

## 起因

阶段 2 第 1 步收尾，快速过 [cordis-primer.zh.md](../../docs/cordis-primer.zh.md)「实践规则」节（两条规则）。

## 规则 1：将行为封装为插件，且「去哪注册」有固定归属

原文要点：工具流水线事件属于 `ctx.tools`，模型流式输出属于 `ctx.llm`，实时 agent 协调属于 `ctx.agents`；拦截和策略优先用事件，直接能力调用优先用服务方法。

三层理解：

1. **行为封装成插件**：呼应「everything is a plugin」，新能力写成插件挂到 ctx，不往核心函数塞代码。
2. **贡献挂到固定 key**：工具 → `ctx.tools`；模型流 → `ctx.llm`；agent 生命周期 → `ctx.agents`。
3. **「改行为走事件，用能力走方法」**：想拦截/改变（工具执行前校验、模型输出后改写）→ 用事件（尤其 waterfall，能短路/包装）；想直接调用（执行 shell 命令）→ 用服务方法（`ctx.shell.exec(...)`）。

一句话记忆：**「改别人的行为」走事件，「用别人的能力」走方法。**

## 规则 2：每个注册都要有对应的 disposer

原文要点：每个注册配 disposer（从 `ctx.effect()` 返回，或用 Cordis 辅助方法自动处理）；teardown 顺序有要求时放同一个 effect。

两条途径：

1. `ctx.effect(fn)`：fn 里做注册，返回 disposer，卸载时 Cordis 调用它撤销。
2. Cordis 辅助方法（`ctx.on()`、`ctx.setInterval()` 等）：内部已绑定 disposer，无需手写。

「teardown 顺序有要求放同一 effect」：A 须先于 B 撤销，就把 A、B 注册放进同一 effect，Cordis 按 effect 内逆序释放。

这一条是「注册副作用可逆」的**使用侧答案**（实现侧答案在教程 02）。

## 这一节的本质

两条规则合起来回答「如何写出可正确装配、可正确卸载的插件」：

- 规则 1 管「**装在哪**」——贡献挂正确 key，拦截走事件、调用走方法。
- 规则 2 管「**怎么卸**」——每个注册配 disposer，卸载时干净撤销。

正是过关标准 ①（`ctx.effect()`/`ctx.on()` 可逆注册）在「实践纪律」层面的呼应：**注册即效果，效果必可逆。**

## 事实源

- [docs/cordis-primer.zh.md](../../docs/cordis-primer.zh.md)「实践规则」节。

## 遗留 / 待验证

- 规则 2 的「实现侧」——`ctx.effect()`/Fiber 如何逆序释放 disposer——留到教程 02 动手验证。
