# ACP 最小客户端操作手册

状态：草稿 v1（2026-09-03 基于仓库源码核对：`dsh-subagent-acp/src/run.ts`、`apps/cli/tests/built-bin.e2e.ts`、`test-support/session-snapshot/src/launcher.ts` 的客户端写法）｜脚本已实测跑通（2026-09-03：spawn + 握手 + 建会话 + prompt 返回 `end_turn` + 收到 `agent_message_chunk` 回答；DSH_HOME 沙箱绕过 `~/.dsh` 旧缓存；多轮 REPL 也已实测——同一 session 连续两问各得独立回答）

本文是长期使用的操作手册：回答「如何用 ACP 起一个 dsh agent、发一个问题、收到回答」。与 [notes/modules/acp.zh.md](../notes/modules/acp.zh.md)（认知单元）的分工：那份笔记记录「ACP 准入/结算/取消怎么运作」，本文记录「我以后照着怎么跑一个最小客户端」。

## 1. 核心认知

`pnpm dsh --profile acp` 起的是 stdio 双向 JSON-RPC 服务器：它不「跑完就打印回答」，而是等客户端在 stdin 发 `initialize → session/new → session/prompt`，回答经 stdout 的 `session/update` 通知流回来。所以「用 ACP 回答一个问题」一定是「spawn server + 客户端驱动」两步。

## 2. 最快验证（无 key，先看一次完整流程）

仓库已写好真实进程演示：spawn 真实 `dsh --profile acp` + mock LLM server，发 prompt，断言收到 `agent_message_chunk` 和 `stopReason: 'end_turn'`。

```sh
pnpm vitest run apps/cli/tests/built-bin.e2e.ts -t "mock-backed ACP"
```

无 key（用 `@deepseek-ai/dsh-llm-mock-server` 假 LLM）。先跑通它，再自己写客户端。

## 3. 最小客户端脚本（dsh 仓库内可移植版）

脚本现位于 [scripts/try-acp.mjs](../scripts/try-acp.mjs)，放 `learning/` 下任意子目录都能跑，因为它不写死任何绝对路径，运行时从自身位置推导仓库根。

```js
// try-acp.mjs —— 可移植最小 ACP 客户端
import { spawn } from 'node:child_process'
import { Readable, Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'

// 1) 从脚本位置向上找含 pnpm-workspace.yaml 的目录 = dsh 仓库根
let dir = dirname(fileURLToPath(import.meta.url))
while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
  const parent = dirname(dir)
  if (parent === dir) throw new Error('找不到 dsh 仓库根（pnpm-workspace.yaml）')
  dir = parent
}
const REPO = dir

// 2) 绝对路径 import ACP SDK（它不在根 node_modules）
const sdkPath = `file:///${REPO.replace(/\\/g, '/')}/packages/acp/acp/node_modules/@agentclientprotocol/sdk/dist/acp.js`
const { client, methods, ndJsonStream, PROTOCOL_VERSION } = await import(sdkPath)

// 3) spawn ACP server（cwd 必须是仓库根；shell:true 解决 Windows pnpm.cmd）
const child = spawn('pnpm dsh --profile acp', {
  shell: true,
  cwd: REPO,
  stdio: ['pipe', 'pipe', 'inherit'],
  env: {
    ...process.env,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,  // 真实回答必需
    DSH_PERMISSION_MODE: 'danger-full-access',       // 允许 agent 调工具
  },
})

const stream = ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout))

// 4) 客户端：收集更新 + 自动拒绝权限请求
const updates = []
const app = client({ name: 'try-acp' })
  .onNotification(methods.client.session.update, ({ params }) => { updates.push(params.update) })
  .onRequest(methods.client.session.requestPermission, () => ({ outcome: { outcome: 'cancelled' } }))
const agent = app.connect(stream).agent

// 5) 握手 → 建会话 → 发 prompt
await agent.request(methods.agent.initialize, { protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} })
const { sessionId } = await agent.request(methods.agent.session.new, { cwd: process.cwd(), mcpServers: [] })
const result = await agent.request(methods.agent.session.prompt, {
  sessionId,
  prompt: [{ type: 'text', text: '用一句话介绍你自己' }],
})

// 6) 打印 stopReason 和流式回答
console.log('stopReason:', result.stopReason)
for (const u of updates) {
  if (u.sessionUpdate === 'agent_message_chunk' && u.content.type === 'text') {
    console.log('回答:', u.content.text)
  }
}

// 7) 断开 stdin → server 停稳退出
child.stdin.end()
```

跑法：`node try-acp.mjs`（脚本在仓库内，无需额外 install）。

### 多轮对话（复用 sessionId）

ACP server 是常驻 stdio 进程，不会「回答完就退出」——`try-acp.mjs` 会退是因为末尾 `child.stdin.end()` 主动断开。要多轮对话只需两个改变：不 `end` stdin、复用同一个 `sessionId` 循环发 `session/prompt`。同一个 session 的每次 prompt 是一个 turn，历史经 `deriveMessages` 自动进模型上下文。

见 [scripts/try-acp-repl.mjs](../scripts/try-acp-repl.mjs)——交互式 REPL：读一行 → prompt → 打印回答 → 再读一行，`exit`/`quit` 退出。跑法：`node learning/scripts/try-acp-repl.mjs`（终端交互）；管道喂输入可非交互验证：`node -e "console.log('hello'); console.log('exit')" | node learning/scripts/try-acp-repl.mjs`。

## 4. 依赖边界（三个关键点）

| 点 | 事实 | 后果 |
|---|---|---|
| SDK 位置 | `@agentclientprotocol/sdk` 不在根 `node_modules`，是 `dsh-acp` 的私有依赖，在 `packages/acp/acp/node_modules/` | 普通 `import '@agentclientprotocol/sdk'` 从 learning/ 或仓外解析不到，必须用绝对路径 import |
| REPO 推导 | `import.meta.url` 给脚本自身绝对 file:// URL，不受 cwd 影响 | 向上找 `pnpm-workspace.yaml` 定位仓库根，脚本放 learning/ 下任意深度都能跑 |
| 两个 cwd | spawn 的 cwd 是「`pnpm dsh` 在哪执行」，必须仓库根；`session.new` 的 cwd 是「agent 的 workspace」，任意 | 两者不能混：spawn 用 `cwd: REPO`，session 用 `process.cwd()` |

## 5. 有 key / 无 key

- **有 key（真实回答）**：设 `DEEPSEEK_API_KEY`，直接跑脚本。
- **无 key（想跑真实进程 + mock 回答）**：仓库的 keyless 方案是 `cli-mock` adapter（`packages/test-support/loader-smoke/tests/fixtures/cli-mock-llm.ts`，会先调一次 shell 再回答），但它不在 base bundle，要 `--patch` 挂载 + 改 `provider: cli-mock`。不想折腾就用第 2 节的现成测试。

## 6. 注意点

1. **回答在 `updates` 流里，不在 prompt 返回值里**：`session/prompt` 响应只有 `{ stopReason }`，正文是 `agent_message_chunk` 更新（`update.content.text`）。
2. **结束靠 `child.stdin.end()`**：server 收到 stdin EOF 后走停稳清理再退出。
3. **脚本在仓外时**：`import.meta.url` 向上找不到 dsh 的 `pnpm-workspace.yaml`，第 1 步的推导会失败——仓外脚本需写死 `const REPO = '<dsh 仓库绝对路径>'` 或读环境变量。本脚本的「零写死路径」只对「脚本在 dsh 仓库内」成立。
4. **若绝对路径 import 报找不到 `zod`**（SDK 的 peer 依赖）：改用仓外独立项目兜底——`mkdir try-acp && npm init -y && npm install @agentclientprotocol/sdk`，脚本换回普通 `import`。
5. **shell 无 `DEEPSEEK_API_KEY` 也能跑**：dsh 启动时读仓库根 `.env` 文件（根 `AGENTS.md` 明确），所以只要根 `.env` 有 key，脚本无需显式传 shell 环境变量。实测：shell 变量 `unset` 时脚本仍返回真实回答。

## 事实源（链接）

- [packages/subagent/subagent-acp/src/run.ts](../../packages/subagent/subagent-acp/src/run.ts) — ACP 客户端完整写法（initialize/new/prompt/cancel/权限应答）
- [apps/cli/tests/built-bin.e2e.ts](../../apps/cli/tests/built-bin.e2e.ts) — 真实进程 ACP e2e（spawn + mock LLM + 断言）
- [packages/test-support/session-snapshot/src/launcher.ts](../../packages/test-support/session-snapshot/src/launcher.ts) — 测试专用 ACP 启动器（spawn + ndJsonStream + client）
- [packages/acp/acp/README.zh.md](../../packages/acp/acp/README.zh.md) — ACP 协议约定与启动
- 认知单元：[notes/modules/acp.zh.md](../notes/modules/acp.zh.md)
