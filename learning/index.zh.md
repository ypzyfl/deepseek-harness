# 学习区索引

本区是系统学习本仓库的工作区。读什么、按什么顺序由 [learning-path.zh.md](learning-path.zh.md) 回答；学习过程如何记录、笔记如何组织由 [method.zh.md](method.zh.md) 回答；本页只做两件事——列出本区文件的入口，登记学习进度。

## 文件索引

| 位置 | 内容 |
|---|---|
| [learning-path.zh.md](learning-path.zh.md) | 学习路线：读什么、按什么顺序（七阶段） |
| `plan/` | 各阶段执行路线与逐步勾选进度，见 [plan/stage-2.zh.md](plan/stage-2.zh.md)、[plan/stage-3.zh.md](plan/stage-3.zh.md)、[plan/stage-4.zh.md](plan/stage-4.zh.md)、[plan/stage-5.zh.md](plan/stage-5.zh.md) |
| [method.zh.md](method.zh.md) | 学习方法：宪法、目录规则、记录方式（journal 两级 / questions 三态 / map 两级）、笔记模板 |
| [questions.zh.md](questions.zh.md) | 开放问题池（三态流转） |
| `experiments/` | 动手实验，见 [experiments/001-log-anchor.zh.md](experiments/001-log-anchor.zh.md)、[experiments/002-llm-inspector.zh.md](experiments/002-llm-inspector.zh.md)、[experiments/003-turn-trace.zh.md](experiments/003-turn-trace.zh.md)、[experiments/004-dump-config-seam-roles.zh.md](experiments/004-dump-config-seam-roles.zh.md) |
| `journal/` | 认知事件原始记录（`YYYY-MM-DD-slug.zh.md`） |
| `notes/` | 认知单元（每篇一个可独立复述的理解）：architecture / mechanisms / modules |
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
- [2026-08-22-01-stage3-log-event-flips.md](journal/2026-08-22-01-stage3-log-event-flips.md) — 阶段 3 收尾：日志/事件概念的三次认知翻转（日志三层模型 / 系统提示词进 request-header / 持久vs扩展点判据）
- [2026-08-22-02-stage4-seam-catalog-reading.md](journal/2026-08-22-02-stage4-seam-catalog-reading.md) — 阶段 4 开头：缝全景图读法 + 「mode 三列」的两次认知翻转（三列是手工标注 / bundle 判据是「替换发生在哪一层」）
- [2026-08-23-01-stage4-seam-scope-structure.md](journal/2026-08-23-01-stage4-seam-scope-structure.md) — 阶段 4 第 2 步：从「记术语」升级到「记结构」（seam 完整性与 lineage 是数据不是结构）
- [2026-08-23-02-stage4-shell-seam-reading.md](journal/2026-08-23-02-stage4-shell-seam-reading.md) — 阶段 4 第 3b 步：shell.zh.md 读不下去 → 抓住「Def 契约」主线
- [2026-08-25-01-composition-layer-bundle-nature.md](journal/2026-08-25-01-composition-layer-bundle-nature.md) — 组合层深挖：bundle 从「普通包」到「少数特殊、本质是捆」的五次连续翻转（cordis.yml 根 vs 层 / bundle 挂别的包 / bundle 无层级 / 声明≠装配 / bundle 少数特殊）

### journal 主题聚合

- [journal/topics/cordis-mechanics.zh.md](journal/topics/cordis-mechanics.zh.md) — Cordis 核心机制（串起 08-18 四篇：分发模式 / `!!js` / 实践规则 / 运行时vs类型解析）

## 进度看板

阶段划分与过关标准以 [learning-path.zh.md](learning-path.zh.md) 为准，本表只登记执行状态与本区产出。状态取值：未开始 / 进行中 / 完成；完成一行时同步登记产出链接。"阶段 0"不属于 learning-path 的七阶段，是本区附加的入门实验（learning-path"读者与前置"一节指向它）。

| 阶段 | 主题 | 状态 | 本区产出 |
|---|---|---|---|
| 0 | 日志锚点（入门第一步） | 完成 | [experiments/001-log-anchor.zh.md](experiments/001-log-anchor.zh.md)；[journal/2026-08-16-03-log-anchor-reading.md](journal/2026-08-16-03-log-anchor-reading.md) |
| 1 | 仓库结构与无 key 启动 | 完成 | 架构总览见 [notes/architecture/core-spine.zh.md](notes/architecture/core-spine.zh.md)；组合层（profile/bundle/patch）见 [notes/architecture/composition-layer.zh.md](notes/architecture/composition-layer.zh.md)；五术语（seam/scope/turn/step/round）；web --dump-config |
| 2 | Cordis 框架 | 完成 | 执行路线见 [plan/stage-2.zh.md](plan/stage-2.zh.md)；插件/Service/seam 关系见 [notes/architecture/plugin-service-seam.zh.md](notes/architecture/plugin-service-seam.zh.md)；机制细节见 [notes/mechanisms/cordis-plugin-service-mechanics.zh.md](notes/mechanisms/cordis-plugin-service-mechanics.zh.md)；配置校验见 [notes/mechanisms/cordis-config-schema.zh.md](notes/mechanisms/cordis-config-schema.zh.md)；PENDING 诊断手册见 [notes/mechanisms/cordis-pending-diagnosis.zh.md](notes/mechanisms/cordis-pending-diagnosis.zh.md)；journal 四篇（分发模式 / `!!js` / 实践规则 / 运行时vs类型解析） |
| 3 | 核心 spine 与回合流 | 完成 | 执行路线见 [plan/stage-3.zh.md](plan/stage-3.zh.md)；七包笔记见 [notes/modules/](notes/modules/)（scope / session / system-prompt / tools / agent / agent-default-model / agent-loop）；横切机制「日志」见 [notes/mechanisms/log.zh.md](notes/mechanisms/log.zh.md)、「事件持久性」见 [notes/mechanisms/event-persistence.zh.md](notes/mechanisms/event-persistence.zh.md)；动手实验见 [experiments/002-llm-inspector.zh.md](experiments/002-llm-inspector.zh.md)、[experiments/003-turn-trace.zh.md](experiments/003-turn-trace.zh.md) |
| 4 | 能力缝与 scope | 完成 | 执行路线见 [plan/stage-4.zh.md](plan/stage-4.zh.md)；缝全景目录（三堆分类 + 三角色表 + mode 判据）见 [notes/architecture/capability-seam-catalog.zh.md](notes/architecture/capability-seam-catalog.zh.md)；seam 通用结构（三角色对齐 + request/spec + 换 Provider/能力面扩展）见 [notes/architecture/seam-structure.zh.md](notes/architecture/seam-structure.zh.md)；可替换四机制扩充见 [notes/architecture/seam-and-replaceability.zh.md](notes/architecture/seam-and-replaceability.zh.md)；scope 两级扁平 + shadowing/restriction 见 [notes/modules/scope.zh.md](notes/modules/scope.zh.md)；lineage 是数据不是结构见 [notes/mechanisms/lineage-data-not-structure.zh.md](notes/mechanisms/lineage-data-not-structure.zh.md)；拆三角色动手见 [experiments/004-dump-config-seam-roles.zh.md](experiments/004-dump-config-seam-roles.zh.md)；读法辨析见 [journal/2026-08-22-02-stage4-seam-catalog-reading.md](journal/2026-08-22-02-stage4-seam-catalog-reading.md) 与 [journal/2026-08-23-01-stage4-seam-scope-structure.md](journal/2026-08-23-01-stage4-seam-scope-structure.md)、[journal/2026-08-23-02-stage4-shell-seam-reading.md](journal/2026-08-23-02-stage4-shell-seam-reading.md) |
| 5 | 扩展实践 | 未开始 | 执行路线见 [plan/stage-5.zh.md](plan/stage-5.zh.md) |
| 6 | 测试策略与 keyless | 未开始 | — |
| 7 | 专项深入（按需） | 未开始 | — |

## 重点学习清单

学习过程中标记出的、需要优先抓重点深入的主题。与进度看板的区别：看板登记"阶段执行状态"，本清单登记"哪些主题值得重点深入"，两者正交。

| 主题 | 为什么重要 | 状态 | 相关产出 |
|---|---|---|---|
| agent-loop（含 headless-runner） | 回合引擎是 harness 最底层、最稳定的核心；runner 是其 one-shot 外壳，二者关系是理解"loop 可替换、能力外挂"的钥匙 | 回合流已深入（见 [notes/modules/agent-loop.zh.md](notes/modules/agent-loop.zh.md) 核心重点四）；循环状态机/竞态仍待深入（阶段 7 专项） | [journal/2026-08-16-02-composition-tree-to-loop.md](journal/2026-08-16-02-composition-tree-to-loop.md) |
| agent / agent-loop 的分工（接口与实现分离） | `dsh-agent` 定义 `AgentFactory` 接口 + `AgentRegistry`（登记活体 agent 的仓库）；`dsh-agent-loop` 是接口的默认实现（工厂 + 引擎）。「登记」与「创建」分离，接口/实现分离是「loop 可替换」的根源。另：`inject:['agents']` 的 `agents` 是服务（`ctx.agents`），与 `config.agents:[]` 的配置数组同名不同物 | 已印证（core.zh.md 第 20 行：「扩展插件依赖 agent，绝不直接依赖 agent-loop，因此循环保持可替换」） | [journal/2026-08-16-02-composition-tree-to-loop.md](journal/2026-08-16-02-composition-tree-to-loop.md) |
| Agent Teams（`packages/experimental/agent-team` + `tool-agent-team`） | rc.8 引入的实验能力：多 agent 协作运行时，新增 `team/member`、`team/message/delivered`、`team/message/queued`、`team/task` 四个会话事件 | 待深入 | [map.zh.md](map.zh.md)（rc.8 变更） |

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
