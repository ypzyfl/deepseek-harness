# CLI profile 别名与参数归属

日期：2026-08-16

## 起因

实验 001 第 2 步"组合层实物"要用 `pnpm dsh --profile headless --dump-config`。动手前冒出的第一个疑问：为什么 headless 用 `--profile headless`，而 web 版直接用 `web`、不带 `--profile`？

## 观察与结论

- **`web` 是 `--profile web` 的硬编码别名**，是 CLI 里唯一的子命令别名；`headless`、`tui` 等其他 profile 没有这个待遇，必须走通用 `--profile <name>` 参数。事实源：`apps/cli/src/args.ts` 第 13–15 行注释、第 156 行 `program.command('web')`（其 action 写死 `resolveBoot(web, 'web', ...)`）、第 66 行帮助文本 `dsh --profile web ... (same as: dsh web)`。
- **`dsh web` 与 `dsh --profile web` 完全等价**，都解析成 `{ mode: 'profile', profile: 'web' }`。

## 背后的参数归属模型（这次真正学到的东西）

launcher 只解析自己的旗标（`--profile`、`--patch`、`--dump-config`）；第一个它不认识的 token 之后的所有内容，原样交给被 boot 的 app 插件解析（`passThroughOptions` + `enablePositionalOptions`）。由此：

- `--dump-config` 是 launcher 旗标；
- `dsh --profile web --help` 打印的是 web app 自己的 help，不是 launcher 的。

`web` 这个别名只是这条规则上的一个高频便捷入口，不是另一套机制。

## 可复跑验证

`pnpm dsh --profile web --dump-config` 与 `pnpm dsh web --dump-config` 输出应一致。

## 待办

- 实验 001 第 2 步本身（跑 headless 的 `--dump-config`，观察"谁在场"）尚未执行，跑完后补观察。
