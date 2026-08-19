# 学习区索引

本区是系统学习本仓库的工作区。读什么、按什么顺序由 [learning-path.zh.md](learning-path.zh.md) 回答；学习过程如何记录、笔记如何组织由 [method.zh.md](method.zh.md) 回答；本页只做两件事——列出本区文件的入口，登记学习进度。

## 文件索引

| 位置 | 内容 |
|---|---|
| [learning-path.zh.md](learning-path.zh.md) | 学习路线：读什么、按什么顺序（七阶段） |
| `plan/` | 各阶段执行路线与逐步勾选进度，见 [plan/stage-2.zh.md](plan/stage-2.zh.md) |
| [method.zh.md](method.zh.md) | 学习方法：宪法、目录规则、记录方式（journal 两级 / questions 三态 / map 两级）、笔记模板 |
| [questions.zh.md](questions.zh.md) | 开放问题池（三态流转） |
| `experiments/` | 动手实验，见 [experiments/001-log-anchor.zh.md](experiments/001-log-anchor.zh.md) |
| `journal/` | 认知事件原始记录（`YYYY-MM-DD-slug.zh.md`） |
| `notes/` | 认知单元（每篇一个可独立复述的理解） |
| `map.zh.md` | 认知地图（整体心智模型快照，理解浮现后落笔） |

### journal 现有记录

- [2026-08-16-01-cli-profile-alias.md](journal/2026-08-16-01-cli-profile-alias.md) — CLI profile 别名与参数归属
- [2026-08-16-02-composition-tree-to-loop.md](journal/2026-08-16-02-composition-tree-to-loop.md) — 从组合树到 loop 引擎
- [2026-08-16-03-log-anchor-reading.md](journal/2026-08-16-03-log-anchor-reading.md) — 日志精读：概念澄清 + seq 0–31 全三段 + 实验三问
- [2026-08-17-01-core-spine-and-seam.md](journal/2026-08-17-01-core-spine-and-seam.md) — core 主干 + seam 可替换性 + 组合层（三条认知主线）
- [2026-08-18-01-cordis-dispatch-modes.md](journal/2026-08-18-01-cordis-dispatch-modes.md) — Cordis 分发模式：两个误解的修正（「是否 await」列名误导）
- [2026-08-18-02-cordis-loader-js-tag.md](journal/2026-08-18-02-cordis-loader-js-tag.md) — Cordis Loader 配置：`!!js` 的澄清（静态结构 + 动态参数分界）
- [2026-08-18-03-cordis-practice-rules.md](journal/2026-08-18-03-cordis-practice-rules.md) — Cordis 实践规则：两条插件编写纪律（装在哪 / 怎么卸）
- [2026-08-18-04-runtime-vs-type-resolution.md](journal/2026-08-18-04-runtime-vs-type-resolution.md) — 运行时解析 vs 类型解析：hello.ts 报错但能跑（两套模块解析路径）

### journal 主题聚合

- [journal/topics/cordis-mechanics.zh.md](journal/topics/cordis-mechanics.zh.md) — Cordis 核心机制（串起 08-18 四篇：分发模式 / `!!js` / 实践规则 / 运行时vs类型解析）

## 进度看板

阶段划分与过关标准以 [learning-path.zh.md](learning-path.zh.md) 为准，本表只登记执行状态与本区产出。状态取值：未开始 / 进行中 / 完成；完成一行时同步登记产出链接。"阶段 0"不属于 learning-path 的七阶段，是本区附加的入门实验（learning-path"读者与前置"一节指向它）。

| 阶段 | 主题 | 状态 | 本区产出 |
|---|---|---|---|
| 0 | 日志锚点（入门第一步） | 完成 | [experiments/001-log-anchor.zh.md](experiments/001-log-anchor.zh.md)；[journal/2026-08-16-03-log-anchor-reading.md](journal/2026-08-16-03-log-anchor-reading.md) |
| 1 | 仓库结构与无 key 启动 | 完成 | 架构总览见 [notes/architecture/core-spine.zh.md](notes/architecture/core-spine.zh.md)；组合层（profile/bundle/patch）见 [notes/architecture/composition-layer.zh.md](notes/architecture/composition-layer.zh.md)；五术语（seam/scope/turn/step/round）；web --dump-config |
| 2 | Cordis 框架 | 完成 | 执行路线见 [plan/stage-2.zh.md](plan/stage-2.zh.md)；插件/Service/seam 关系见 [notes/architecture/plugin-service-seam.zh.md](notes/architecture/plugin-service-seam.zh.md)；机制细节见 [notes/mechanisms/cordis-plugin-service-mechanics.zh.md](notes/mechanisms/cordis-plugin-service-mechanics.zh.md)；配置校验见 [notes/mechanisms/cordis-config-schema.zh.md](notes/mechanisms/cordis-config-schema.zh.md)；PENDING 诊断手册见 [notes/mechanisms/cordis-pending-diagnosis.zh.md](notes/mechanisms/cordis-pending-diagnosis.zh.md)；journal 四篇（分发模式 / `!!js` / 实践规则 / 运行时vs类型解析） |
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

## 常用命令备忘

只记「跑什么命令看什么」，不存输出全文（组合树/日志是现场生成的、随版本漂移，存全文会过时）。

| 想查什么 | 命令 |
|---|---|
| 某 profile 实际装配了哪些插件（组合树，含用户 patch） | `pnpm dsh --profile <name> --dump-config` |
| 某 profile 的纯默认配置（不含用户 patch） | `pnpm dsh --profile <name> --dump-default-config` |
| 运行时真实落盘的会话日志 | 读 `~/.dsh/sessions/session.jsonl.zstd`（zstd 压缩，`zstd -dc` 解压） |
| 快照测试期望日志（可读、占位符化） | `examples/headless-agent/tests/snapshots/headless-profile/session.expected.jsonl` |

可用的 `<name>`：随发行版交付 `web`、`headless` 两个模板（`PROFILE_TEMPLATES` 硬编码）；其他任意名字需先 `pnpm dsh plugin --profile <name> add <package>` 创建。

组合层规则（层序、patch 语义、bundle 自挂载）见 [notes/architecture/composition-layer.zh.md](notes/architecture/composition-layer.zh.md)。
