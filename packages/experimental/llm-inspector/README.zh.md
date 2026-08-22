# dsh-experimental-llm-inspector

实时 LLM 请求/响应观察器。在 `llm/stream` waterfall 上安装一个监听器，把完整组装后的模型请求与流式响应摘要打印到日志，不改变流本身。

## 用途

阶段 3（核心 spine 与回合流）的配套诊断插件，用于观察「发给 LLM 的完整数据」。它回答的问题是：一次模型调用里，系统提示词、派生历史、工具 schema 和响应流到底长什么样。

它观察的是**运行时产物**，不是会话日志面：系统提示词（`options.system`）和派生历史（`options.messages`）是每个 step 临时组装、`llm/stream` 到达时已深度冻结的内容，会话日志从事实*重建*它们而非*存储*它们，所以只能在此处现场观察。

## 配置

```ts
interface Config {
  enabled?: boolean      // 默认 true
  verbose?: boolean      // 默认 false；true 时打印消息全文
  maxFieldLength?: number // 默认 400；超长字段截断长度
}
```

## 输出

每次模型调用向 **stderr** 写两条结构化 JSON 行（不依赖 Cordis logger 后端，因为 headless 这类一次性 profile 不挂载 console 后端）：

1. **request**：`provider`、`model`、`reasoningEffort`、`temperature`、`maxTokens`、`stop`、`purpose`、工具数量、消息数量、完整 `system` 提示词、以及每条消息的 role/length/预览（`verbose` 时全文）。
2. **response**：chunk 总数、`usage`（token 用量）、`finish` 结束原因。

## 已知限制

- 观察器是纯透传：`llm/stream` 是 waterfall，监听器总是先调用 `next()` 再逐 chunk 转发，绝不短路模型调用，也绝不改写（冻结的）请求。
- 只观察不落盘：刷新或事后无法回看，与会话日志不存系统提示词是同一原因。需要事后回放请另做持久化（涉及扩展 `SessionEventMap`）。
- 不观察最终 wire 字节：provider 适配器内部的请求序列化不在事件面，此处看到的是语义完整的请求/响应视图。
