// try-acp.mjs —— 可移植最小 ACP 客户端（临时尝试脚本）
import { spawn } from 'node:child_process'
import { Readable, Writable } from 'node:stream'
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

// 3) spawn ACP server（cwd 必须是仓库根；shell:true 解决 Windows pnpm.cmd）
// DSH_HOME 沙箱：不碰 ~/.dsh 的旧缓存数据
const SANDBOX = join(tmpdir(), 'dsh-acp-sandbox')
mkdirSync(SANDBOX, { recursive: true })

const child = spawn('pnpm dsh --profile acp', {
  shell: true,
  cwd: REPO,
  stdio: ['pipe', 'pipe', 'inherit'],
  env: {
    ...process.env,
    DSH_HOME: SANDBOX,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DSH_PERMISSION_MODE: 'danger-full-access',
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
