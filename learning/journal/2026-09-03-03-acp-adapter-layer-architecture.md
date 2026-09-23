# ACP 统一中间适配层：方向 B 落定与背靠背架构

日期：2026-09-03

## 起因

[方向辨析](2026-09-03-02-acp-client-adapter-directions.md)之后定下方向 B（多后端统一），且假设升级为「多前端统一 + 多后端统一」：做一个 TypeScript ACP 中间适配层，前端的多种消费者与后端的多种 ACP server 都经由它对接。这轮讨论把架构形态和设计要点定了下来。

## 关键认知：背靠背结构

当中间层既对多前端统一、又对多后端统一时，它必然是**背靠背**的：对后端 ACP server 它是 **ACP client**，对前端它自己得是 server（ACP server 投影 + TS SDK 投影，两个薄壳共享同一个内核）。这个定位决定整个架构。

更深一层的发现：**dsh 仓库本身就是这个结构的实例**——`dsh-acp` 是「Agent 抽象 → ACP server」的前端半边，`dsh-subagent-acp` 是「统一接口 → 任意 ACP agent」的后端半边。要做的东西可以理解为把这两个半边抽出仓库、拼成独立中间层，中间填上转换矩阵。

## 架构分层（讨论定稿）

```
前端 A（标准 ACP 客户端，如编辑器/Zed）──┐
前端 B（TS 程序，直接 import SDK）───────┤
                                        ▼
                    ┌─ 统一内核（纯 TS 库）─┐
                    │ 前端投影：ACP server 面 + TS SDK 面（薄壳）
                    │ 统一 Agent 抽象（会话/更新流/权限/取消）
                    │ 后端 adapter：dsh / claude-code / gemini …（每个 = ACP client + 进程管理）
                    └───────────────────────┘
```

各层要点：

1. **统一内核 = 最小公分母 + 能力协商升级**：核心接口按标准 ACP v1 最小面定义（session 生命周期 / prompt / update 流 / stopReason / permission / cancel）；超出部分（`session/list`/`resume`、`set_config`、图片 prompt）做成可选 capability，由后端 adapter 声明、由前端探测。dsh-acp「`initialize` 只广告已挂载支持、绝不虚报」的诚实能力原则照搬。
2. **无能力后端的两条路要显式选择**：降级（显式 unsupported / 空结果）或补齐（中间层自己持久化模拟）。第一版一律降级，补齐等真实需求。
3. **复杂度大头是转换矩阵**：stopReason 词表（蓝本：`subagent-acp/src/run.ts` 的 ACP → 共享词表映射）、更新流粒度（dsh 发 generic tool lifecycle，其他后端各有事件形状）、权限语义（dsh one-shot allow/reject；策略统一放中间层，adapter 只透传）、内容块支持度、连接模型。
4. **连接模型抹平**：内核统一「逻辑会话」，adapter 声明 `connectionModel: 'multiplexed' | 'per-session'`（dsh 一连接多会话；有的后端一进程一会话，由 adapter 内部管进程池，上层无感）。
5. **进程管理独立成层**：`ConnectionManager`（spawn/握手/崩溃/重连/EOF 宽限→SIGTERM→SIGKILL 阶梯）与 `SessionAdapter`（协议语义）分层；「ACP wire 是序列化边界」（hostile input 只在 wire 校验）照搬。
6. **独立项目而非 dsh 仓库内包**：服务多后端、不专属 dsh；dsh 仓库的角色是参考实现来源 + 第一个后端。

## 测试与落地顺序（讨论定稿）

- **契约测试先于多 adapter**：定义所有 adapter 必须满足的统一内核语义，用 mock ACP server 驱动（零 key，平移 dsh `llm-mock-server` 思路）。
- **最小闭环三步**：① 内核接口 + dsh adapter（抄 `subagent-acp/run.ts`）；② 写一个**能力残缺的假后端**（无 resume、无 list、per-session 连接）验证降级路径——这比先接第二个真后端更能暴露抽象漏洞；③ ACP server 前端投影，用标准 ACP 客户端连自己，形成 dsh → 中间层 → 编辑器的端到端链路。
- 第二个真实后端（Claude Code ACP）放在抽象经过假后端验证之后。

## 增值点校验原则

单后端透传时 ACP→ACP 中间层没有存在价值。中间层的增值点清单要显式写进项目 README 第一段：多后端路由/选择、统一权限策略、能力协商降级、（将来的）会话持久化补齐、统一遥测。每个设计决策对着清单校验。

## 事实源

- [packages/subagent/subagent-acp/src/run.ts](../../packages/subagent/subagent-acp/src/run.ts) — 后端半边参考实现（ACP client + stopReason 映射 + 停稳退出）
- [packages/acp/acp/src/index.ts](../../packages/acp/acp/src/index.ts) — 前端半边参考实现（Agent 抽象 → ACP server + 诚实能力广告）
- [packages/subagent/subagent-acp/README.md](../../packages/subagent/subagent-acp/README.md) — Dev Note 三未做方向（进程池/远程工作区/continuable children）是方向 B 会撞上的取舍
- [journal/2026-09-03-02-acp-client-adapter-directions.md](2026-09-03-02-acp-client-adapter-directions.md) — 方向辨析（A vs B）

## 遗留

- 内核接口的具体 TypeScript 定义未起草（下一步：最小面 + capability 枚举的第一版类型）。
- 转换矩阵逐项未展开（每个维度一行一行的映射表）。
- 中间层项目骨架（独立 repo / 目录结构 / 契约测试框架选型）未定。

→ 均登记进 [questions.zh.md](../questions.zh.md)。
