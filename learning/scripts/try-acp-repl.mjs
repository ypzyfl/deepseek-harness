// try-acp-repl.mjs —— 交互式 ACP 客户端：多轮对话
import { spawn } from 'node:child_process'
import { Readable, Writable } from 'node:stream'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'

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

// 3) spawn ACP server（不 end stdin，让它常驻）
const SANDBOX = join(tmpdir(), 'dsh-acp-sandbox')
mkdirSync(SANDBOX, { recursive: true })
const child = spawn('pnpm dsh --profile acp', {
  shell: true,
  cwd: REPO,
  stdio: ['pipe', 'pipe', 'inherit'],
  env: {
    ...process.env,
    DSH_HOME: SANDBOX,
    DSH_PERMISSION_MODE: 'danger-full-access',
  },
})

const stream = ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout))

// 4) 客户端：收集更新 + 自动拒绝权限请求
const updates = []
const app = client({ name: 'try-acp-repl' })
  .onNotification(methods.client.session.update, ({ params }) => { updates.push(params.update) })
  .onRequest(methods.client.session.requestPermission, () => ({ outcome: { outcome: 'cancelled' } }))
const agent = app.connect(stream).agent

// 5) 一次握手 + 建会话（会话复用，跨多轮）
await agent.request(methods.agent.initialize, { protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} })
const { sessionId } = await agent.request(methods.agent.session.new, { cwd: process.cwd(), mcpServers: [] })
console.log(`会话已建立（${sessionId}），开始对话。输入 exit/quit 退出。`)

// 6) 发一轮 prompt 并打印回答
async function askOne(line) {
  updates.length = 0 // 清空上一轮，避免重复打印历史回答
  await agent.request(methods.agent.session.prompt, {
    sessionId,
    prompt: [{ type: 'text', text: line }],
  })
  for (const u of updates) {
    if (u.sessionUpdate === 'agent_message_chunk' && u.content.type === 'text') {
      console.log('助手:', u.content.text)
    }
  }
}

// 7) 多轮循环：TTY 走 readline 交互；非 TTY（管道）先读完所有行再逐个处理
if (process.stdin.isTTY) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  while (true) {
    const line = (await rl.question('你> ')).trim()
    if (line === '') continue
    if (line === 'exit' || line === 'quit') break
    await askOne(line)
  }
  rl.close()
} else {
  const lines = []
  for await (const chunk of process.stdin) {
    lines.push(...chunk.toString('utf8').split(/\r?\n/))
  }
  for (const raw of lines) {
    const line = raw.trim()
    if (line === '') continue
    if (line === 'exit' || line === 'quit') break
    await askOne(line)
  }
}

// 8) 退出：断连接 → server 停稳退出
child.stdin.end()
