# 实验 004：在 --dump-config 组合树里拆 seam 三角色 + 找「包兼任多角色」反例

日期：2026-08-23

## 假设

1. `pnpm dsh --profile <name> --dump-config` 的组合树里，能对应地拆出一个 seam 的 Def / Provider / Consumer 三角色，且与 shell 样板缝一致。
2. 存在「一个包兼任多角色」的反例（glossary 提到的 `dsh-llm`、catalog 里的 `compaction`），且能在现场输出里定位到。

## 操作

```sh
pnpm dsh --profile headless --dump-config
```

（Windows cmd，无 `head`，用 `findstr` 过滤关键行）

## 观察

### shell 缝三角色的现场落点

| 角色 | 包（现场 id → name） | 在组合树里怎么出现 |
|---|---|---|
| Service Definition | `dsh-shell`（`ShellExecutor` 抽象类） | **不独立成行**——`super(ctx, 'shell')` 在基类构造器注册 `ctx.shell`，由 Provider 子类实例化时挂上 |
| Service Provider | `bash-sandbox` → `@deepseek-ai/dsh-bash-sandbox`；`pwsh-sandbox` → `@deepseek-ai/dsh-pwsh-sandbox` | 独立成行 |
| Consumer | `tool-bash` → `@deepseek-ai/dsh-tool-bash`；`tool-pwsh` → `@deepseek-ai/dsh-tool-pwsh` | 独立成行 |

关键观察：headless profile 用的是**沙箱版** Provider（`bash-sandbox`/`pwsh-sandbox`），不是 `bash-local`。对照 `examples/headless-agent/cordis.yml` 里用的是 `dsh-bash-local`——同一个 `ctx.shell` Def，Provider 从 `bash-local` 换成 `bash-sandbox`，而 Consumer（`tool-bash`）与 Def（`ctx.shell`）不变。这是「换 Provider」的现场实例。

`dsh-shell` 的源码证据（`packages/shell/shell/src/index.ts:65-68`）：

```ts
export abstract class ShellExecutor extends Service {
  constructor(ctx: Context) {
    super(ctx, 'shell')
  }
  ...
}
```

抽象类基类在构造器里 `super(ctx, 'shell')` 注册 `ctx.shell`，所以 Def 不作为一个组合树条目出现，而是活在 Provider 子类的继承链里。

### 「一包兼任多角色」反例的现场落点

| 包 | 现场 id → name | 兼任的角色 | 出处 |
|---|---|---|---|
| `dsh-llm` | `llm` → `@deepseek-ai/dsh-llm` | Def（`ctx.llm`）+ Consumer | glossary capability-seam 词条「`dsh-llm` 同时承担 Service Definition 和 Consumer」 |
| `dsh-compaction-basic` | `compaction-basic` → `@deepseek-ai/dsh-compaction-basic` | Def + Provider + Consumer（三角色同包） | capability-seam-catalog 表 `ctx.compaction` 行「同一包兼三角色」 |

## 结论

1. 拆三角色成立：shell 缝的 Def 是抽象类（`dsh-shell`），Provider 是 `dsh-bash-sandbox`/`dsh-pwsh-sandbox`，Consumer 是 `dsh-tool-bash`/`dsh-tool-pwsh`。Def 不独立成行是抽象类 Def 的结构特征，不是「缺失」。

2. 「一包兼多角色」合法前提：这些角色**未独立演化**、**替换粒度一致**，合并进一个包不牺牲可替换性。与「拆 seam 只在三角色独立演化时」互为反面——不拆（合并三角色）在三角色不独立演化时合法。

## 事实源

- `pnpm dsh --profile headless --dump-config` 现场输出（本次观察对象）
- [packages/shell/shell/src/index.ts](../../packages/shell/shell/src/index.ts) — `ShellExecutor` 抽象类 + `super(ctx, 'shell')`
- [docs/glossary.zh.md](../../docs/glossary.zh.md) — capability-seam 词条（`dsh-llm` 兼 Def + Consumer）
- [learning/notes/architecture/capability-seam-catalog.zh.md](../notes/architecture/capability-seam-catalog.zh.md) — 三角色目录表（`ctx.compaction` 行）

## 遗留

- `dsh-llm` 兼任 Def + Consumer 的「Consumer」具体指什么（它消费 `ctx.llm` 发请求？还是别的），尚未读 `packages/llm/llm` 源码确认，只依据 glossary 词条与 catalog 表。可留作后续。
