# 运行时解析 vs 类型解析：`hello.ts` 报错但能跑

日期：2026-08-18

## 起因

教程 01 在 `tmp/cordis-tutorial/hello.ts` 里写 `import type { Context } from '@deepseek-ai/cordis'`，编辑器第一行报「找不到模块 @deepseek-ai/cordis」，但用 `node --import tsx ../../vendor/cordis/bin.js` 运行却正常。困惑：为什么「能跑」却「类型报错」？

## 澄清结论

**类型检查（编译器/IDE）和运行时（bin.js + tsx）走两套完全不同的模块解析路径。**

| | 运行时（bin.js + tsx） | 类型检查（TS 语言服务） |
|---|---|---|
| 谁解析 | Node 模块解析 + tsx 转译 | TS 语言服务（读 tsconfig） |
| 依据 | `node_modules` 物理位置（沿父目录向上找） | tsconfig 的 include 范围 / paths / moduleResolution |
| 结果 | 仓库根有真实 `node_modules/@deepseek-ai/cordis`（vendor 链接），向上能找到 → 能跑 | `tmp/` 不在仓库 tsconfig include 内，TS 没把它当工程内文件 → 找不到类型 |

## 关键认知

1. **「能运行」和「能通过类型检查」是两件事**。运行时靠 Node 物理解析 `node_modules`；类型检查靠 tsconfig 声明的工程范围。`tmp/cordis-tutorial/` 没有自己的 tsconfig，也不在仓库 tsconfig include 内，所以它「能跑」但「类型不绿」。

2. **这是教程刻意设计，不是错误**。教程用 `tmp/`（gitignore、临时）+ `tsx`（运行时转译、无需 tsconfig）刻意绕开仓库严管的 TypeScript 工程布局，让你轻装学 Cordis。红波浪线不影响运行，可忽略，或把 `tmp/` 标记为 IDE excluded。

3. **伏笔**：这是根 AGENTS.md「source plane vs artifact plane」「TypeScript 工程布局」的一个侧面——dsh 对类型工程管得很严（每包一个 aggregate、tmp 排除在外），阶段 3 深入 core 时会正式接触。

## 事实源

- [docs/development.zh.md](../../docs/development.zh.md)「TypeScript 工程布局」节（阶段 3 精读）
- [docs/cordis-tutorial/index.zh.md](../../docs/cordis-tutorial/index.zh.md)「准备工作」节（`tmp/` 被 gitignore、用 `tsx` 跑）

## 遗留 / 待验证

- 阶段 3 读 development.zh.md 时，回头对照本条的「类型工程布局」伏笔。
