# 学习区索引

本区是系统学习本仓库的工作区。读什么、按什么顺序由 [learning-path.zh.md](learning-path.zh.md) 回答；学习过程如何记录、笔记如何组织由 [method.zh.md](method.zh.md) 回答；本页只做两件事——列出本区文件的入口，登记学习进度。

## 文件索引

| 位置 | 内容 |
|---|---|
| [learning-path.zh.md](learning-path.zh.md) | 学习路线：读什么、按什么顺序（七阶段） |
| [method.zh.md](method.zh.md) | 学习方法：宪法、目录规则、记录方式（journal 两级 / questions 三态 / map 两级）、笔记模板 |
| [questions.zh.md](questions.zh.md) | 开放问题池（三态流转） |
| `experiments/` | 动手实验，见 [experiments/001-log-anchor.zh.md](experiments/001-log-anchor.zh.md) |
| `journal/` | 认知事件原始记录（`YYYY-MM-DD-slug.zh.md`） |
| `notes/` | 认知单元（每篇一个可独立复述的理解） |
| `map.zh.md` | 认知地图（整体心智模型快照，理解浮现后落笔） |

### journal 现有记录

- [2026-08-16-01-cli-profile-alias.md](journal/2026-08-16-01-cli-profile-alias.md) — CLI profile 别名与参数归属
- [2026-08-16-02-composition-tree-to-loop.md](journal/2026-08-16-02-composition-tree-to-loop.md) — 从组合树到 loop 引擎
- [2026-08-16-03-log-anchor-reading.md](journal/2026-08-16-03-log-anchor-reading.md) — 日志精读：概念澄清与第一段

## 进度看板

阶段划分与过关标准以 [learning-path.zh.md](learning-path.zh.md) 为准，本表只登记执行状态与本区产出。状态取值：未开始 / 进行中 / 完成；完成一行时同步登记产出链接。"阶段 0"不属于 learning-path 的七阶段，是本区附加的入门实验（learning-path"读者与前置"一节指向它）。

| 阶段 | 主题 | 状态 | 本区产出 |
|---|---|---|---|
| 0 | 日志锚点（入门第一步） | 完成 | [experiments/001-log-anchor.zh.md](experiments/001-log-anchor.zh.md)；[journal/2026-08-16-03-log-anchor-reading.md](journal/2026-08-16-03-log-anchor-reading.md) |
| 1 | 仓库结构与无 key 启动 | 进行中 | 架构总览已完成，见 [notes/architecture/core-spine.zh.md](notes/architecture/core-spine.zh.md)；组合层（profile/bundle/patch）见 [notes/architecture/composition-layer.zh.md](notes/architecture/composition-layer.zh.md)；剩余：仓库地图（README/AGENTS 三节/CLI README/development）+ web --dump-config |
| 2 | Cordis 框架 | 未开始 | — |
| 3 | 核心 spine 与回合流 | 未开始 | — |
| 4 | 能力缝与 scope | 未开始 | — |
| 5 | 扩展实践 | 未开始 | — |
| 6 | 测试策略与 keyless | 未开始 | — |
| 7 | 专项深入（按需） | 未开始 | — |

## 重点学习清单

学习过程中标记出的、需要优先抓重点深入的主题。与进度看板的区别：看板登记"阶段执行状态"，本清单登记"哪些主题值得重点深入"，两者正交。

| 主题 | 为什么重要 | 状态 | 相关产出 |
|---|---|---|---|
| agent-loop（含 headless-runner） | 回合引擎是 harness 最底层、最稳定的核心；runner 是其 one-shot 外壳，二者关系是理解"loop 可替换、能力外挂"的钥匙 | 待深入 | [journal/2026-08-16-02-composition-tree-to-loop.md](journal/2026-08-16-02-composition-tree-to-loop.md) |
| agent / agent-loop 的分工（接口与实现分离） | `dsh-agent` 定义 `AgentFactory` 接口 + `AgentRegistry`（登记活体 agent 的仓库）；`dsh-agent-loop` 是接口的默认实现（工厂 + 引擎）。「登记」与「创建」分离，接口/实现分离是「loop 可替换」的根源。另：`inject:['agents']` 的 `agents` 是服务（`ctx.agents`），与 `config.agents:[]` 的配置数组同名不同物 | 待深入 | [journal/2026-08-16-02-composition-tree-to-loop.md](journal/2026-08-16-02-composition-tree-to-loop.md) |
