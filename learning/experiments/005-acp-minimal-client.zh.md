# 实验 005：跑通 ACP 最小客户端 + 旧缓存 schema 漂移与沙箱绕过

日期：2026-09-03

## 假设

1. 用 `@agentclientprotocol/sdk` 写的最小客户端能 spawn `dsh --profile acp`、握手、建会话、发 prompt、收回答（对应 [guide/acp-minimal-client.zh.md](../guide/acp-minimal-client.zh.md) 的脚本）。
2. 脚本放 `learning/` 下任意子目录都能跑——用 `import.meta.url` 向上找 `pnpm-workspace.yaml` 推导仓库根，不写死绝对路径。

## 操作

1. 写 `try-acp.mjs`（可移植版：`import.meta.url` 推导 `REPO` + 绝对路径 import SDK + `cwd: REPO` spawn）。
2. `node learning/try-acp.mjs` 第一次跑。
3. 崩溃后诊断：列 `~/.dsh`、`~/.dsh/storages` 结构定位旧数据。
4. 改脚本加 `DSH_HOME` 沙箱（`%TEMP%\dsh-acp-sandbox`），重跑。

## 观察

### 第一次跑：spawn/握手成功，dsh 内部崩溃

客户端已发出 `initialize`→`session.new`（协议握手开始），但 dsh 插件树加载失败：

```text
dsh: plugin tree failed to load: failed to apply loader entry session-projection-cache
domain 'session_projcache': stored record 'session-05f35a31-...' does not match its schema
ZodError: identity.isSeeded expected boolean, received undefined
          identity.inheritedEventCount expected number, received undefined
```

根因定位：`~/.dsh/storages/session_projcache/` 里的旧缓存记录缺 `isSeeded`/`inheritedEventCount` 两个字段——这是 0.1.2-alpha.4 版本对齐新增的（取代旧 `seedLength`，见 [map.zh.md](../map.zh.md) alpha.4 记录）。旧缓存是 alpha.4 之前写的，schema 对不上。

### 第二次跑：DSH_HOME 沙箱跑通

```text
stopReason: end_turn
回答: 我是 DeepSeek Harness 的 AI 编码助手，专注于在 deepseek-harness 代码仓库中帮助你完成编码、测试、文档与代码审查等开发任务。
```

完整链路：spawn → initialize → session/new → prompt → agent_message_chunk → end_turn → stdin EOF 停稳退出（exitCode 0）。

### 意外观察：shell 无 key 却成功

shell 里 `DEEPSEEK_API_KEY` 是 `unset`（`node -e "console.log(process.env.DEEPSEEK_API_KEY)"` 确认），但模型调用成功了——因为 dsh 启动时读仓库根 `.env` 文件（根 AGENTS.md：「read DEEPSEEK_API_KEY ... and root .env」）。

## 结论

1. **ACP 最小客户端端到端跑通**：SDK 绝对路径 import + `import.meta.url` 推导仓库根 + `cwd: REPO` spawn 的组合可行，脚本放 `learning/` 下任意子目录都能跑。
2. **旧派生缓存与新版 schema 不匹配的通用教训**：session-projection-cache 是「可丢弃派生索引」（map.zh.md 明确），它的旧记录会卡死 dsh 启动。绕过方式是用 `DSH_HOME` 指向空目录让缓存重建；直接跑（读 `~/.dsh`）会持续崩，除非清掉旧缓存。
3. **dsh 的 key 来源不只 shell 环境变量**：还有根 `.env` 文件。判断「有没有 key」不能只看 `process.env`。

## 事实源

- [learning/scripts/try-acp.mjs](../scripts/try-acp.mjs) — 本次跑通的脚本（已从 learning/ 根移到 scripts/）
- [learning/guide/acp-minimal-client.zh.md](../guide/acp-minimal-client.zh.md) — 脚本对应的操作手册
- [learning/map.zh.md](../map.zh.md) — alpha.4 版本对齐记录（`isSeeded`/`inheritedEventCount` 取代 `seedLength`）
- 现场观察：`~/.dsh/storages/`（session_projcache）、dsh 启动崩溃栈

## 遗留

- `~/.dsh/storages/session_projcache` 的旧缓存**没有清理**（本次选方案 B「不碰 ~/.dsh」）。将来若直接跑 `pnpm dsh --profile <name>`（不带 DSH_HOME 沙箱），仍会撞上同样的 schema 崩溃，届时需清掉旧缓存（`rmdir /s /q "%USERPROFILE%\.dsh\storages\session_projcache"` + 删 `session_projcache.json`）。
