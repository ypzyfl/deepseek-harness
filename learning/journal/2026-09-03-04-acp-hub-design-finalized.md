# acp-hub 设计定稿与 M0 启动：四决策 + 调研 + 设计 v1

日期：2026-09-03

## 起因

进入实现前出详细设计方案（要求：详细到可直接编码、ASCII 图 + 表格、不确定先问）。过程分三步：调研三块事实源 → 四问决策 → 落盘设计 v1。

## 四项决策（ask_followup_question 裁决）

| # | 决策 | 选择 |
|---|---|---|
| D1 | 项目位置 | `d:/Tech/Github/acp-hub` 独立 git repo + pnpm workspace，与 dsh 仓库平级 |
| D2 | 前端投影面 | SDK 面 + ACP server 面同步实现 |
| D3 | 后端传输 | 仅 stdio（spawn + ndJsonStream） |
| D4 | 命名 | acp-hub，npm scope `@acp-hub/*` |

## 调研发现（设计的客观依据）

1. **SDK 1.4.0 已内置大量此前以为要自研的东西**：`ActiveSession`（prompt + 更新流队列组装，即"双通道抽象"的拉模式版）、`agent()`/`client()` builder、`clientApp.connect(agentApp)` in-process 直连（契约测试可完全不 spawn 进程）、`AcpServer`（HTTP/WS，第一版不用）、实验性 v2 协议。
2. **协议面精确形状**：`SessionUpdate` 14 种变体；`ContentBlock` 4 种；`StopReason` 5 种；agent 侧方法分稳定面（session 全生命周期）与实验面（nes/providers/document）。
3. **`subagent-acp/run.ts` 是完整的进程管理蓝本**：spawn 竞态（成功臂永停）、启动失败分类（stage×category 有界词表）、停稳退出阶梯（EOF 宽限 6s → SIGTERM → SIGKILL 3s）。

## 设计 v1 定稿要点（详见 [design/acp-hub-design-v1.zh.md](../design/acp-hub-design-v1.zh.md)）

- **核心立场**：第一版内核词表 = ACP v1 稳定子集直接复用（re-export SDK 类型），转换层 = 能力协商降级器，不是方言翻译器。接非 ACP 后端时才引入自有词表（触发条件 O5 显式记录）。
- **结构**：4 包 + 1 CLI——core / adapter-mock / adapter-dsh / server-acp + hub-cli，依赖严格单向。
- **能力协商**：协议内能力由 connect() 握手动态探测（诚实原则照搬 dsh-acp），协议外事实（connectionModel）由 adapter 静态声明。
- **权限策略**是内核唯一主动决策点：reject / allowFirst / passThrough（server 面专用转发）。
- **契约测试 14 用例矩阵**（◎ 加跑 dsh、◇ 加跑残缺 mock）作为 TDD 顺序；mock 后端用声明式场景脚本（full/minimal/per-session/crashy/echo 五场景）。
- **里程碑 M0–M4**，每步有可运行验收物。

## 关键认知（本轮增量）

1. **"所有后端都说 ACP"大幅改变了抽象层形态**：方向 B 初期讨论时预设了"方言转换矩阵"是复杂度大头；调研后发现第一版后端同构（全是 ACP），update 流/stopReason/内容块可以透传，真正的复杂度收缩到能力协商降级、连接模型抹平、权限策略、进程生命周期四件事。方言翻译要等真出现异构后端。
2. **SDK 能力边界要先摸清再设计**：ActiveSession/AcpServer/in-process 直连三个发现直接改写了设计（泵实现、测试速度、传输选型）。教训：设计前先读要依赖的库的 .d.ts 全貌。

## 落盘

- 设计 v1：[design/acp-hub-design-v1.zh.md](../design/acp-hub-design-v1.zh.md)（learning 侧历史快照，正式版移至 acp-hub/docs/design-v1.zh.md）
- M0 骨架初始化：d:/Tech/Github/acp-hub（workspace + tsconfig project references + vitest + 4 空包 + CLI 占位，`pnpm typecheck` / `pnpm test` 绿为验收）

## 遗留

O1 dsh 图片能力探测 / O2 ACP server 面多后端动态选择 / O3 PromptHandle 泵背压细节 / O4 dsh keyless 测试方案 / O5 非 ACP 后端触发词表重构——均登记 [questions.zh.md](../questions.zh.md)。
