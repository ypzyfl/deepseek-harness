# 阶段 4 第 3b 步：shell.zh.md 读不下去 → 抓住「Def 契约」这条主线

日期：2026-08-23

## 起因

第 3 步 3b 要读 [subsystems/shell.zh.md](../../docs/subsystems/shell.zh.md)（约 16.7 KB），并落实过关标准 ①（三角色 → 具体包名）。但第一遍读不下去，卡住了。

## 卡点与转折

- **卡点**：试图在「Def 的契约文档」里找「三角色全景」，自然对不上。文档默认读者已懂三角色，把 Def/Provider/Consumer 的内容打散了。
- **转折**：重新抓主线——整篇文档其实只讲「Def 角色（`ctx.shell` / `ShellExecutor`）的契约」，Provider 和 Consumer 只在零星处点一下各自拥有什么。抓住这条主线后，骨架立刻清晰：4 个 `type-equiv` 代码块 = 4 个数据契约，串成「request → resolve() → spec → run()/start() → result/process」一条数据流。

## 两次认知收获

1. **request/spec 拆分是「包边界显式优于隐式」的落地**：`ShellExecRequest` 字段可选、`ShellExecSpec` 字段全必填，中间靠 `ctx.shell.resolve(request)` 把可选补成必填。默认值不是藏在 `run()` 里的 `?? default`，而是显式的 `resolve()` 步骤——这是仓库该规则的模板实例。

2. **「换 Provider 整个产品跟着变」的准确含义**：换 Provider（bash-local → bash-sandbox）时，Def 契约不变、Consumer 脸不变，模型调用 bash 的方式完全一样，只是结果里「多了一类 sandbox facts 字段」。三角色绑定的价值就在这——Provider 可换，但通告面与可执行面由 Def 契约锁定，不会手脸不匹配。

## 关键认知

三角色对照表、数据流、替换体现、职责分工、易混点全部沉淀在 [notes/architecture/seam-structure.zh.md](../notes/architecture/seam-structure.zh.md)（通用 seam 结构，shell 为贯穿例子）。

## 事实源

- [docs/subsystems/shell.zh.md](../../docs/subsystems/shell.zh.md) — shell 家族样板缝（本次精读对象）
- [learning/notes/architecture/seam-structure.zh.md](../notes/architecture/seam-structure.zh.md) — 认知落点

## 遗留 / 待验证

- 沙箱 seam（`sandbox.zh.md`）与子进程 seam（`subprocess.zh.md`）尚未精读，`ShellSandboxInfo` 的 `mode`/`enforcement` 词汇、spill 文件机制的具体实现待后续读这两个 seam 时补。
