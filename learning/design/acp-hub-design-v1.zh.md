# acp-hub 设计方案 v1

状态：v1 定稿（2026-09-03，基于四项已确认决策 + dsh 仓库与 @agentclientprotocol/sdk 1.4.0 源码调研）。项目初始化后本文档移至 acp-hub 仓库 docs/design-v1.zh.md，本处留指针。

前置阅读：[方向辨析](../journal/2026-09-03-02-acp-client-adapter-directions.md)、[架构讨论](../journal/2026-09-03-03-acp-adapter-layer-architecture.md)。

## 0. 决策记录

| # | 决策 | 选择 | 备注 |
|---|---|---|---|
| D1 | 项目位置 | `d:/Tech/Github/acp-hub` 独立 git repo + pnpm workspace | 与 dsh 仓库平级；dsh 仅作为第一个后端被 spawn |
| D2 | 前端投影面 | SDK 面 + ACP server 面同步实现 | |
| D3 | 后端传输 | 仅 stdio（spawn 子进程 + ndJsonStream） | dsh / Claude Code / Gemini CLI 均支持 stdio |
| D4 | 命名 | acp-hub，npm scope `@acp-hub/*` | |

调研事实（设计依据）：

| 事实 | 出处 |
|---|---|
| SDK 1.4.0 提供 `agent()` / `client()` builder、`ActiveSession`（prompt+更新流队列）、`AcpServer`（HTTP/WS，第一版不用）、实验性 v2 | `@agentclientprotocol/sdk` dist/acp.d.ts |
| `clientApp.connect(agentApp)` 支持 in-process 直连（测试无需 spawn） | SDK acp.d.ts `ClientApp.connect` |
| `SessionUpdate` 14 种变体；`ContentBlock` 4 种（text/image/audio/resource_link）；`StopReason` 5 种（end_turn/max_tokens/max_turn_requests/refusal/cancelled） | SDK schema/types.gen.d.ts |
| 进程停稳退出阶梯（EOF 宽限 → SIGTERM → SIGKILL）、stopReason 映射、权限自动应答的完整实现 | [subagent-acp/src/run.ts](../../packages/subagent/subagent-acp/src/run.ts) |
| dsh 后端能力：multiplexed 多会话、session/list/resume/close、set_config_option、图片 prompt（需路由支持）、one-shot 权限 | [packages/acp/acp/README.zh.md](../../packages/acp/acp/README.zh.md) |

## 1. 核心设计立场（一句话）

**第一版内核词表 = ACP v1 稳定子集的直接复用（re-export SDK 类型），转换层 = 能力协商降级器，不是方言翻译器。** 所有第一版后端都说 ACP，因此 update 流 / stopReason / 内容块直接透传，真正的复杂度在：能力协商降级、连接模型抹平、权限策略点、进程生命周期。将来接入非 ACP 后端（直接 LLM、MCP agent）时才引入自有内核词表——这是本设计显式记录的演进触发条件，不是第一版工作。

## 2. 总体架构

```
  前端 A: TS 程序                前端 B: 标准 ACP 客户端
  (import @acp-hub/core)         (Zed / 编辑器, spawn hub 进程)
          │                                │ stdio JSON-RPC
          ▼                                ▼
┌─────────────────────────────────────────────────────────┐
│                       acp-hub                            │
│                                                          │
│   ┌─────────────────┐         ┌──────────────────────┐   │
│   │ SDK 面           │         │ ACP server 面         │   │
│   │ Hub class API    │         │ AgentApp 投影 + CLI   │   │
│   └────────┬────────┘         └──────────┬───────────┘   │
│            │        两个薄投影，共享内核     │               │
│            ▼                               ▼               │
│   ┌──────────────────────────────────────────────────┐   │
│   │                 内核 (@acp-hub/core)               │   │
│   │   Hub / BackendAdapter 接口 / CapabilityRegistry  │   │
│   │   PermissionPolicy / AdapterError / 连接缓存       │   │
│   └───────────────────────┬──────────────────────────┘   │
│                           │ BackendAdapter 实现           │
│            ┌──────────────┼──────────────┐               │
│            ▼              ▼              ▼               │
│   ┌──────────────┐ ┌─────────────┐ ┌───────────────┐     │
│   │ adapter-dsh  │ │ adapter-mock│ │ (未来) claude │     │
│   │ multiplexed  │ │ 残缺能力脚本 │ │   ...         │     │
│   └──────┬───────┘ └──────┬──────┘ └───────────────┘     │
└──────────┼────────────────┼──────────────────────────────┘
           │ spawn          │ in-process (测试) / spawn (e2e)
           ▼                ▼
     dsh --profile acp   mock 假后端
       (stdio)           (能力残缺：无 list/resume、per-session)
```

包依赖方向（严格单向）：

```
adapter-dsh ──▶ core ◀── adapter-mock
                 ▲
                 ├── server-acp
                 └── hub-cli (组装一切，唯一可执行入口)
```

## 3. Monorepo 布局

```
acp-hub/
├── package.json              # private, "type": "module"
├── pnpm-workspace.yaml       # packages: packages/*, apps/*
├── tsconfig.base.json        # strict: true, NodeNext, ESM
├── vitest.workspace.ts
├── acp-hub.config.json       # hub-cli 的后端注册表（见 §8）
├── packages/
│   ├── core/                 # @acp-hub/core      内核：类型 + Hub + 契约测试套件
│   │   └── src/
│   │       ├── types.ts      #   §4 全部类型
│   │       ├── hub.ts        #   Hub 编排器（连接缓存/会话路由/dispose）
│   │       ├── prompt.ts     #   PromptHandle（updates AsyncIterable + result Promise）
│   │       ├── permission.ts #   权限策略（reject/allowFirst/passThrough/自定义）
│   │       ├── errors.ts     #   AdapterError
│   │       └── exports.ts    #   公共出口
│   ├── adapter-mock/         # @acp-hub/adapter-mock  假后端：in-process + 可 spawn 两形态
│   │   └── src/
│   │       ├── index.ts      #   BackendAdapter 实现（in-process 直连形态）
│   │       ├── backend.ts    #   AgentApp 假后端本体（声明式场景脚本驱动）
│   │       └── bin.ts        #   可 spawn 形态入口（mock-backend 命令）
│   ├── adapter-dsh/          # @acp-hub/adapter-dsh  dsh 后端
│   │   └── src/
│   │       ├── index.ts      #   BackendAdapter 实现（spawn + 握手 + 能力探测）
│   │       ├── connection.ts #   连接/进程生命周期（EOF 宽限阶梯）
│   │       └── session.ts    #   multiplexed 会话包装
│   └── server-acp/           # @acp-hub/server-acp  ACP server 投影面
│       └── src/
│           ├── app.ts        #   AgentApp 组装：hub 会话 ↔ ACP 方法互译
│           └── capabilities.ts # 按所选后端聚合广告能力（诚实投影）
├── apps/
│   └── hub-cli/              # acp-hub 命令：serve / doctor
├── examples/
│   └── quick-start.ts        # SDK 面最小示例（配 mock 后端跑通）
└── tests/
    └── contract/             # 跨 adapter 契约测试套件（§9）
```

技术基线：Node ≥ 22 / TypeScript strict / ESM only / vitest / 依赖仅 `@agentclientprotocol/sdk`（peer: zod）+ `tslib` 级别的零依赖纪律（第一版不引入更多运行时依赖）。

## 4. 核心类型（可直接落为 packages/core/src/types.ts）

### 4.1 复用层：ACP v1 稳定子集（不造新词）

```ts
export type {
  // 内容与更新（update 流直接透传，不翻译）
  ContentBlock, SessionUpdate, StopReason,
  // 请求/响应（前后端形状一致）
  PromptRequest, PromptResponse,
  NewSessionRequest, NewSessionResponse,
  ResumeSessionRequest, ResumeSessionResponse,
  CloseSessionRequest, CloseSessionResponse,
  ListSessionsRequest, ListSessionsResponse,
  SetSessionConfigOptionRequest, SetSessionConfigOptionResponse,
  // 权限（策略点的输入输出）
  RequestPermissionRequest, RequestPermissionResponse,
} from '@agentclientprotocol/sdk'
```

理由：第一版所有后端都是 ACP，直接复用让转换层趋近于零；re-export 集中在一个文件，是将来引入自有词表时唯一要改的边界。

### 4.2 hub 自有词表（内核真正拥有的类型）

```ts
/** 后端标识（配置文件中的 id，如 'dsh'、'mock'）。 */
export type BackendId = string

/**
 * 后端能力快照。协议内能力由 connect() 握手探测填充（诚实原则：
 * 只报 initialize 实际广告/实测的，不写死猜测）；协议外事实
 * （connectionModel）由 adapter 静态声明。
 */
export interface BackendCapabilities {
  /** 一条连接多会话（dsh）还是每会话一进程（模拟残缺后端）。 */
  connectionModel: 'multiplexed' | 'per-session'
  /** prompt 内容块支持度。不支持的视频为降级拒绝项。 */
  content: { text: true; image: boolean; audio: boolean; resourceLink: boolean }
  /** 会话生命周期能力。 */
  sessions: { list: boolean; resume: boolean; close: boolean }
  /** session/set_config_option 是否可用。 */
  configOptions: boolean
  /** 后端是否会发 session/request_permission。 */
  permissionRequests: boolean
}

/**
 * 后端适配器。每个后端一个实现；Hub 负责连接缓存与重连，
 * adapter 本身无状态（每次 connect 返回全新连接）。
 */
export interface BackendAdapter {
  readonly id: BackendId
  /** 建立连接、完成 initialize 握手与能力探测。signal abort 时中止并回收进程。 */
  connect(signal: AbortSignal): Promise<BackendConnection>
}

/** 一条到后端的活连接（multiplexed：整个后端一条；per-session：adapter 内部按需起）。 */
export interface BackendConnection {
  readonly backend: BackendId
  readonly capabilities: BackendCapabilities
  /** 连接终止信号（进程退出 / 流关闭 / 致命协议错误）。 */
  readonly closed: AbortSignal
  newSession(req: NewSessionRequest): Promise<BackendSession>
  listSessions?(req: ListSessionsRequest): Promise<ListSessionsResponse>
  resumeSession?(req: ResumeSessionRequest): Promise<BackendSession>
  /** 停稳关闭：取消在途工作 → 排空更新 → EOF 宽限 → 递进终止（§7）。 */
  close(): Promise<void>
}

/** 一个后端会话。实现不得在 prompt 的 onUpdate 回调里再入 prompt。 */
export interface BackendSession {
  readonly backend: BackendId
  /** 后端命名空间的会话 id（hub 侧再组合成全局 key）。 */
  readonly sessionId: string
  readonly capabilities: BackendCapabilities
  /**
   * 发送一轮 prompt。onUpdate 按后端交付顺序同步回调，本轮 resolve 后
   * 保证不再回调；每会话同一时刻仅允许一个在途 prompt（协议约束，
   * 由 Hub 强制，重复 prompt 在 Hub 层拒绝）。
   */
  prompt(
    req: PromptRequest,
    onUpdate: (update: SessionUpdate) => void,
    signal?: AbortSignal,
  ): Promise<PromptResponse>
  /** 取消在途 prompt（映射后端取消语义，§6.4）。 */
  cancel(): void
  setConfigOption?(req: SetSessionConfigOptionRequest): Promise<SetSessionConfigOptionResponse>
  /** 关闭此会话（不动连接上的其他会话；per-session 模型即回收子进程）。 */
  close(): Promise<void>
}
```

### 4.3 Hub 与前端视图

```ts
/** hub 命名空间的会话键：`${backendId}:${sessionId}`，branded 防裸 string 混用。 */
export type HubSessionKey = string & { readonly __brand: 'HubSessionKey' }

export class Hub implements AsyncDisposable {
  constructor(options: HubOptions)
  /** 惰性连接并缓存；重复调用同一 id 返回同一连接。 */
  backend(id: BackendId): Promise<BackendConnection>
  /** SDK 面：在指定后端新建会话。 */
  newSession(backend: BackendId, req: NewSessionRequest): Promise<HubSession>
  resumeSession(backend: BackendId, req: ResumeSessionRequest): Promise<HubSession>
  /** 聚合 list：跨已连接后端合并，每条带 backend 标注。 */
  listSessions(backend?: BackendId): Promise<HubSessionSummary[]>
  /** 停稳关闭所有连接（§7 阶梯）。 */
  dispose(): Promise<void>
}

export interface HubSession {
  readonly key: HubSessionKey
  readonly backend: BackendId
  readonly capabilities: BackendCapabilities
  /** prompt 双通道：updates 推模式流 + result 终值（§4.4）。 */
  prompt(input: string | ContentBlock[], opts?: { signal?: AbortSignal }): PromptHandle
  setConfigOption?(req: SetSessionConfigOptionRequest): Promise<SetSessionConfigOptionResponse>
  cancel(): void
  close(): Promise<void>
}
```

### 4.4 PromptHandle：双通道抽象

```
prompt() 调用
    │
    ├──▶ updates: AsyncIterable<SessionUpdate>   ← 后端 onUpdate 推入队列
    │        （自然背压：迭代慢则队列上限 1024 后阻塞回调）
    │
    └──▶ result: Promise<PromptOutcome>          ← 后端 prompt 响应 / 取消 / 连接死亡
             │
             ▼
   PromptOutcome = { kind:'stop', response }      ← 正常停轮
                 | { kind:'cancelled' }            ← 本地取消胜出
                 | { kind:'error', error: AdapterError }
```

规则：`result` settle 后 `updates` 迭代器自然结束（先排空再关）；`cancel()` 触发后端取消但已承诺的更新仍会送达（ACP 语义：客户端应继续接收取消后的 tool_call 更新）。实现于 `core/src/prompt.ts`（单一文件，两个面共用）。

### 4.5 权限策略（内核唯一的主动决策点）

```ts
export type PermissionHandler = (
  request: RequestPermissionRequest,
  ctx: { backend: BackendId; sessionKey: HubSessionKey },
) => Promise<RequestPermissionResponse>

/** 内置策略工厂（permission.ts）。 */
export const permissionPolicies: {
  /** 全部拒绝（应答 cancelled）。自动化默认。 */
  reject(): PermissionHandler
  /** 选第一个 allow_once/allow_always 选项，无则 cancelled。 */
  allowFirst(): PermissionHandler
  /** ACP server 面专用：转发给前端客户端应答（超时默认 reject）。 */
  passThrough(timeoutMs?: number): PermissionHandler
}
```

要点：策略挂在 Hub 上（构造时注入），adapter 收到后端 `request_permission` 一律上调内核，不自决；`passThrough` 只在 server 面装配，SDK 面消费者传自定义函数即可接人类确认。

## 5. adapter-dsh 规格

| 项 | 规格 |
|---|---|
| spawn | `config: { command, args, cwd?, env?, disposeEofGraceMs?=6000, disposeGraceMs?=3000 }`，与 `subagent-acp` Config 同形；直接 `spawn(argv, { stdio:['pipe','pipe','inherit'] })` 不经 shell（Windows 由调用方给 `cmd /c` 或完整可执行路径） |
| 连接模型 | multiplexed：一条进程承载全部会话；连接关闭 = 后端进程退出 |
| 握手 | `initialize`（protocolVersion=SDK PROTOCOL_VERSION, clientCapabilities={} 不广告 fs/terminal）→ 能力探测 |
| 能力探测 | `sessions.list/resume/close` 与 `configOptions` 从 initialize 响应的 agentCapabilities 与实测 `session/new` 响应推导；`content.image` 第一版固定 false（dsh 图片需附件存储+路由支持，留待探测增强）；`permissionRequests` true |
| 会话 | 每个 `newSession` 在同一 ClientApp 连接上创建 BackendSession；update 路由按 sessionId 分发 |
| 取消 | `session/cancel` 通知 + 等待 prompt 响应（不杀进程） |
| 环境要求 | `DSH_HOME` 隔离目录由调用方配置传入（防 `~/.dsh` 旧缓存 schema 漂移，实验 005 教训）；`DEEPSEEK_API_KEY` 经 env 显式传 |

实现蓝本：[subagent-acp/src/run.ts](../../packages/subagent/subagent-acp/src/run.ts) 的 spawn/启动竞态/停稳退出三段直接平移，去掉 subagent seam 依赖（`SubprocessHandle` 换成自带的轻量 `ManagedProcess`，保留同一阶梯）。

## 6. adapter-mock 规格（测试与降级验证的对端）

### 6.1 两形态

| 形态 | 用途 | 实现 |
|---|---|---|
| in-process | 契约测试（快，无 spawn） | SDK `clientApp.connect(agentApp)` 直连 |
| spawn | per-session 连接模型 / 进程管理路径测试 | `bin.ts` 起 stdio AgentApp，场景由 argv 传 JSON 路径 |

### 6.2 声明式场景脚本（驱动假后端行为）

```jsonc
// scenarios/minimal.jsonc —— mock 收到 prompt 后按脚本回放
{
  "capabilities": { "listSessions": false, "resume": false, "permissionRequests": false },
  "turns": [
    {
      "updates": [
        { "agent_message_chunk": "回答第一段" },
        { "tool_call": { "title": "读文件", "kind": "read" } },
        { "tool_call_update": { "status": "completed" } }
      ],
      "requestPermission": { "options": ["allow_once", "reject_once"] },  // 可选
      "stopReason": "end_turn"
    }
  ]
}
```

### 6.3 预置场景（契约测试矩阵的另一半）

| 场景名 | 残缺点 | 验证目标 |
|---|---|---|
| `full` | 无（最大能力） | 透传路径全绿 |
| `minimal` | 无 list/resume、无权限请求 | 能力降级（C10） |
| `per-session` | 每会话要求新进程（spawn 形态） | 连接模型抹平 |
| `crashy` | 第 N 轮 prompt 时进程退出 | 崩溃传播与重连（C9） |
| `echo` | 第二轮回答复述第一轮内容 | 上下文保持（C4） |

### 6.4 取消语义映射表（adapter 实现对照）

| 后端模型 | BackendSession.cancel() 实现 | close() 实现 |
|---|---|---|
| multiplexed（dsh） | 发 `session/cancel` 通知，等 prompt 响应 settle | 后端 `session/close` 请求（不动连接） |
| per-session（mock） | 同上；若后端不响应 → 会话子进程按停稳阶梯回收 | 会话子进程整体停稳回收 |

## 7. 进程生命周期阶梯（ConnectionManager 内聚）

```
关闭请求
   │
   ▼
[1] 取消在途 prompt（协议层 cancel）
   │
   ▼
[2] 排空已承诺更新（等 outputTail / prompt settle）
   │
   ▼
[3] stdin.end()  ──── EOF 宽限 disposeEofGraceMs(默认6s) 内进程退出？
   │                        │ 是 → 完成
   │                        ▼ 否
   ▼                   [4] SIGTERM（Windows: terminate）
[5] disposeGraceMs(默认3s) 后仍活 → SIGKILL / 强杀
   │
   ▼
[6] 等整进程树退出证明（waitForExit）→ 完成
```

封装为 `packages/adapter-dsh/src/connection.ts` 导出的 `ManagedProcess`（spawn 形态 mock 复用同实现，放 core 的 `process/` 子模块亦可——第一版放 adapter-dsh，第二个需要它的 adapter 出现时上移，避免过早抽象）。

崩溃检测：进程 `exit` → `connection.closed` abort → 所有该连接上 BackendSession 的在途 `prompt()` reject（AdapterError, category='process-exit'）→ Hub 标记连接失效，下次 `backend()` 重建连接（会话不自动迁移，第一版明确不补齐）。

## 8. hub-cli 与配置

```jsonc
// acp-hub.config.json
{
  "backends": [
    {
      "id": "dsh",
      "type": "acp-stdio",
      "command": "pnpm",
      "args": ["dsh", "--profile", "acp"],
      "cwd": "D:/Tech/Github/deepseek/deepseek-harness/fork/deepseek-harness",
      "env": { "DSH_HOME": "D:/acp-hub-sandbox/dsh-home", "DEEPSEEK_API_KEY": "!!env" },
      "disposeEofGraceMs": 6000,
      "disposeGraceMs": 3000
    },
    { "id": "mock", "type": "acp-stdio", "command": "node", "args": [".../bin.js", "--scenario", "minimal"] }
  ],
  "permission": { "passThrough": { "timeoutMs": 60000 } }
}
```

命令面：

```
acp-hub serve --backend dsh [--config path]   # ACP server 面：stdio 起动，能力=所选后端投影
acp-hub doctor [--backend dsh]                 # 连接/握手/能力探测的自检报告（调试用）
```

ACP server 面多后端呈现（第一版定为）：**一进程一后端**（`--backend` 必选）。多后端动态选择需协议扩展点（`session/new` 的 `_meta.backend`），列为开放问题 O2，不在第一版。

## 9. server-acp：AgentApp 投影面

方法映射表（`app.ts` 实现的全部内容）：

| ACP 方法（前端→hub） | hub 动作 | 诚实能力广告规则 |
|---|---|---|
| `initialize` | 惰性连一次后端，取能力快照 | `agentCapabilities.listSessions` 等逐项 = 后端快照直译；后端连不上 → initialize 报错（不虚报） |
| `session/new` | `hub.newSession(backend, req)` 透传（含 mcpServers） | mcpServers 不支持的后端 → 显式错误 |
| `session/prompt` | `session.prompt()` → updates 泵到 `session/update` 通知；响应即 prompt result | 同序透传（PromptHandle 已保证顺序） |
| `session/cancel` | `session.cancel()` | — |
| `session/list` | `hub.listSessions()` | 后端无 → 不广告此方法 |
| `session/resume` / `session/close` | 透传 | 同上，按能力 |
| `session/set_config_option` | 透传 | 同上 |
| `session/request_permission`（hub→前端） | `permissionPolicies.passThrough` 转发 | 后端无权限请求则不会发生 |
| `authenticate` | 立即成功（dsh 同语义） | — |

实现基座：SDK `agent({ name: 'acp-hub' }).onRequest(...)` 链 + `ndJsonStream`；测试用 SDK `client()` 直连 AgentApp（in-process，无需 spawn hub 进程）。

## 10. 契约测试计划（tests/contract/，TDD 顺序即实现顺序）

所有用例对 `adapter-mock(full)` 必跑；标注 ◎ 的另跑 `adapter-dsh`（需 `DSH_REPO` + `DEEPSEEK_API_KEY` 环境变量，CI 无环境时 skip，本地 keyless 用 dsh 仓库 cli-mock patch 方案时同样可跑）；标注 ◇ 的另跑 mock(minimal) / mock(per-session)。

| # | 用例 | 断言要点 | 后端矩阵 |
|---|---|---|---|
| C1 | 握手与能力快照 | capabilities 各字段正确 | full ◎ ◇ |
| C2 | newSession | 返回会话、key 组装正确 | full ◎ |
| C3 | 单轮 prompt（文本） | updates 顺序、stopReason、result.kind='stop' | full ◎ |
| C4 | 同会话多轮（echo 场景） | 第二轮内容依赖第一轮（上下文真实保留） | echo ◎ |
| C5 | prompt 期间 cancel | result.kind='cancelled'、updates 先排空再关闭 | full ◎ |
| C6 | 权限策略 reject | 后端收到 cancelled 应答、后续更新继续 | full |
| C7 | 权限策略 allowFirst | 选第一个 allow 选项 | full |
| C8 | 权限 passThrough | server 面：前端应答回传后端；超时默认 reject | full |
| C9 | 后端进程崩溃（crashy） | 在途 prompt → AdapterError(process-exit)；`backend()` 重建可用 | crashy |
| C10 | 能力残缺降级 | list/resume 调用 → 显式 unsupported 错误；server 面不广告 | minimal ◇ |
| C11 | per-session 连接模型 | 两个会话两个进程、互不影响；close 一个另一个活着 | per-session |
| C12 | 会话 close | multiplexed：close 后连接仍可 newSession | full ◎ |
| C13 | Hub dispose | 全后端停稳退出（exitCode 0、无孤儿进程） | full ◎ ◇ |
| C14 | ACP server 面端到端 | SDK client → AgentApp → mock/dsh：完整 prompt 轮 | full ◎ |

## 11. 里程碑（每步有可运行验收物）

| 里程碑 | 交付 | 验收标准 |
|---|---|---|
| M0 骨架 | workspace + tsconfig + vitest + 空包 + `pnpm typecheck` / `pnpm test` 绿 | 全部命令绿；目录与 §3 一致 |
| M1 内核+mock | core 全部类型 + Hub + PromptHandle + 权限策略 + adapter-mock(in-process, full/echo) + 契约 C1–C8 | `examples/quick-start.ts`（SDK 面驱动 mock）可运行；C1–C8 绿 |
| M2 dsh adapter | adapter-dsh + ManagedProcess 阶梯 + 能力探测 + C1–C5/C12/C13 的 ◎ 变体 | `examples/quick-start.ts --backend dsh` 真实回答（需 key）；无 key 时 ◎ 用例 skip |
| M3 server 面 | server-acp + hub-cli serve/doctor + C8/C14 | 用 learning/scripts 的最小客户端连 `acp-hub serve --backend mock` 完成 prompt 轮；Zed 可配置连 dsh 后端 |
| M4 残缺与收尾 | minimal/per-session/crashy 场景 + C9–C11 + README（增值点清单第一段：多后端路由选择/统一权限策略/能力协商降级/统一遥测钩子） | §10 矩阵全绿；doctor 可诊断 dsh 连接 |

## 12. 风险与开放问题

| # | 问题 | 第一版处置 |
|---|---|---|
| O1 | dsh 图片 prompt 能力探测（需附件存储+路由） | `content.image` 固定 false，留 TODO |
| O2 | ACP server 面多后端动态选择（`session/new` `_meta` 扩展） | 一进程一后端；SDK 面已支持显式 backendId |
| O3 | SDK `ActiveSession` 拉模式 → hub 推模式的泵实现细节（背压上限、取消后 flush） | 在 M1 以 C5 锁定行为，实现于 prompt.ts 单文件 |
| O4 | dsh adapter 测试的 keyless 方案（cli-mock patch 挂载较繁琐） | ◎ 用例默认真实 key + skip；keyless patch 方案在 M2 评估 |
| O5 | 未来非 ACP 后端触发内核自有词表重构 | 已在 §1 记录触发条件，不动第一版 |

## 13. 参考实现对照表（编码时直接对照 dsh 仓库）

| acp-hub 模块 | 蓝本（dsh 仓库） | 取什么 |
|---|---|---|
| adapter-dsh/connection.ts | [subagent-acp/src/run.ts](../../packages/subagent/subagent-acp/src/run.ts) | spawn 竞态、启动失败分类、停稳退出阶梯、ManagedProcess 形状 |
| adapter-dsh/session.ts | run.ts `startAcpRun` 中段 | ClientApp 组装、update 路由、权限应答回调、cancel 双路径 |
| server-acp/app.ts | [packages/acp/acp/src/index.ts](../../packages/acp/acp/src/index.ts) | AgentApp 方法注册结构、诚实能力广告、会话记录 Map |
| server-acp/capabilities.ts | [packages/acp/acp/src/index.ts](../../packages/acp/acp/src/index.ts) initialize 实现 | agentCapabilities 的逐字段构造 |
| core/prompt.ts | SDK `ActiveSession`（dist/acp.d.ts） | 消息形状（session_update / stop 双 kind）|
| core/errors.ts | run.ts `AcpFailureFacts` | stage/category 有界词表 + 固定诊断行 |
