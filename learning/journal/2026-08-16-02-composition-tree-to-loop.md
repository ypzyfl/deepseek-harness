# 从组合树到 loop 引擎

日期：2026-08-16

## 起因

实验 001 第 2 步跑 `pnpm dsh --profile headless --dump-config`，得到完整组合树后，连续追问五个问题：web 别名由来 → 组合树怎么读 → one-shot runner 与 agent-loop 的关系 → loop 能否替换 → loop 是否完备。

## 认知主线

一条从"入口"钻到"引擎"的线索，最终清晰成形：

```
dsh CLI（web 是硬编码别名）
  └─ 组合层（--dump-config 回答"谁在场"）
       ├─ headless-runner（one-shot 外壳：创建 agent、塞任务、退出）
       └─ agent-loop（回合引擎：turn/step 驱动 + 从日志推导请求）
            └─ 具体能力由 tools/sandbox/approval/... 外挂提供
```

## 关键分辨（这轮最重要的收获）

**"组合层静态配置" vs "运行时动态状态"是两个东西。** 五个问题里三个都源自把前者误当后者：

1. `agent-default-model` 的 `deepseek-v4-flash` 是 headless bundle 写死的**兜底默认值**，不是 web 界面选择导致的（后者经 settings 层运行时覆盖，恰巧同名是巧合）。证据：`packages/core/agent-default-model/src/index.ts` 第 72–74 行。
2. `agent-loop` 的 `agents: []` 是"装配时一个 agent 都不预置"，不是"没有循环"；loop 在，agent 由 runner 运行时 `agents.create()` 动态 new 出。
3. `--dump-config` 只回答"谁在场 + 什么默认配置"，不回答"运行时发生了什么"。

## 组合树的读法

- 每行前的 `# == ...` 注释标来源层：`@deepseek-ai/dsh-base`（多数行）、`patched by @deepseek-ai/dsh-headless`（改写的行）、`@deepseek-ai/dsh-headless`（新插入的行）。
- patch 层能力完整：按 id 覆盖（改）、新 id 插入（增）、`disabled: true`（删）。
- 平台条件分支写在配置里：`bash-*` 在 win32 禁用、`pwsh-*` 在非 win32 禁用（`!!js process.platform === 'win32'`）。

## runner 与 loop 的关系

- `headless-runner`（`@deepseek-ai/dsh-headless`）是**外壳**：创建 agent → `followup` 塞任务 → `whenIdle` 等 idle → 打印结果 → 退出。它不直接驱动回合。
- `agent-loop`（`@deepseek-ai/dsh-agent-loop`）是**引擎**：通过 `setFactory` 注册 `AgentFactory`，`agents.create()` 内部调用的就是它。
- runner 通过 `agents.create()` 间接使用 loop。

## loop 可替换性

- loop 本身可替换：`setFactory` 是开放注册点，任何实现 `AgentFactory` 接口的插件都能替换默认 `dsh-agent-loop`。证据：`packages/core/agent/src/index.ts` 第 217 行报错文案 "load an agent-loop plugin"（an，不是 the）。
- 对应根 AGENTS.md "Plugins, not loop changes"：扩展插件依赖 `agent` 接口而非具体驱动。

## loop 的完备性

默认 `dsh-agent-loop` 是一个**功能完备的基础 loop**，完备边界是"回合驱动骨架"：

- 完整实现：turn/step 状态机、每次请求从会话日志推导（`deriveMessages()`）、提示词装配 → 调模型 → 执行工具 → 判断继续的闭环、多个 waterfall 扩展点（`agent/pre-step`、`agent/request`、`agent/request-error`）。
- 不拥有任何具体能力：工具是什么、沙箱怎么隔离、权限怎么审批，全由组合树里的 tools/sandbox/approval 等**外挂缝**提供。
- 一句话：loop 是"完备的骨架"，能力是"外挂的缝"。

## 两个 agents 的辨析（本轮追加，2026-08-17）

`agent-loop/src/index.ts` 的 `static inject = ['agents', 'sessions', 'llm', 'tools', 'systemPrompt']` 里，`'agents'` 和 `config.agents: []` 里的 `agents` **同名不同物**：

1. **`inject` 里的 `'agents'` 是一个「服务」**：类型是 `AgentRegistry`（`ctx.agents`），由 `@deepseek-ai/dsh-agent` 插件（组合树 `id: agent`）提供，职责是**登记活体 agent**（跟踪当前有哪些 agent 在跑，提供 `create`/`resume`/`get`）。证据：`packages/core/agent/src/index.ts` 的 `class AgentRegistry extends Service { super(ctx, 'agents') }`。
2. **`config.agents: []` 是一个「配置数组」**：`agent-loop` 插件自己的字段，表示「启动时预置几个声明式 agent」，默认空 = 全按需。

## AgentFactory 接口 / 实现分离（本轮追加，2026-08-17）

「登记」和「创建」是两个包的两种职责，靠接口分离：

- `dsh-agent` 定义抽象接口 `AgentFactory`（`create` / `resume`）+ `AgentRegistry`（登记仓库）。
- `dsh-agent-loop` 是接口的**默认实现**（`class AgentLoop extends Service implements AgentFactory`），通过 `setFactory` 把自己注册进 `AgentRegistry`，负责真正造 agent、驱动 turn/step。

所以「默认的 agent-loop」的精确含义：**不是代码里写死唯一，而是预设组合树里选用了 `dsh-agent-loop` 作为 `AgentFactory` 的实现**。理论上任何实现 `AgentFactory` 的插件都能在组合树里替换它——这正是「loop 可替换」的根源（接口与实现分离）。

三者合一才是完整的 agent-loop 系统：

```
AgentRegistry（ctx.agents 服务） = 仓库（登记活体 agent）
agent-loop（实现 AgentFactory）  = 工厂 + 引擎（创建 + 驱动）
config.agents: []               = 配置（开工时预置几个 agent，默认 0）
```

## loop 的启动与收敛（turn 是怎么开、怎么结束的）

追问"turn 何时被谁建立、空 turn 会不会挂死"，落到 `agent.ts` 的真实时序：

**真实时序**（输入 → turn，一条链）：

```
用户输入 → followup 塞进 inbox（seq 3）
        → wakeDriver 唤醒 loop（idle → running）
        → turn() 开 turn（seq 4）
        → preStep 认领 inbox 消息（seq 5）
```

**两个关键结论**：

1. **输入是诱因，loop 是执行者（拉模型）**：开 turn 的动作由 loop 自己的 `wakeDriver`/`turn` 执行，输入只"敲门"（唤醒），不能直接命令 loop 开 turn。纠正了之前"turn 先开再等输入"的误导。
2. **空 turn 不会挂死也不会浪费**：`turn()` 第 271–277 行显式处理——第 0 个 step 认领后若无可处理消息，不调模型、直接以 `completed` 结束。且"有输入才开 turn"本身是前提。

证据：`packages/core/agent-loop/src/agent.ts` 第 113–124 行（send/wakeup）、172–193 行（wakeDriver）、271–277 行（空 turn 防御）。

## 待办

- agent-loop / headless-runner 已标记为重点学习对象（见重点清单）。
