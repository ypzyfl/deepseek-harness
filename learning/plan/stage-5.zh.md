# 阶段 5（扩展实践）执行路线与进度

本文是阶段 5 的**执行路线 + 逐步勾选进度**：把 [learning-path.zh.md](../learning-path.zh.md) 阶段 5 的「精读材料 + 动手任务 + 过关检验」拆成可逐步推进的小步骤，并标出每步的验证点与学习区落盘动作。事实源仍是 learning-path.zh.md，本文不重复其内容、只做执行拆解；冲突以 learning-path.zh.md 为准。

过关标准（来自 learning-path.zh.md 完成标志表阶段 5 行）：① 所选 cookbook 指南的全部 verify 步骤通过；② 改动遵守「挂在已文档化扩展点」而非改 loop；③ 若触及模型/用户可见行为，同 PR 的 keyless snapshot 已补。

## 路线总览（四步，由映射表定目标、选路径、落地一次端到端小改动）

```
第 1 步  读扩展映射总表 ── extension-cookbook.zh.md「功能→机制映射」，锁定「新增行为 = 挂已文档化扩展点」
第 2 步  二选一选定路径 ── 工具路径（adding-a-tool）或 包路径（adding-a-package），读对应指南
第 3 步  动手实现 ── 走完所选指南全部编号 verify 步骤，完成一次端到端小改动
第 4 步  合规自查 + 落盘 ── 对照过关标准②③（改 loop 红线 / keyless snapshot），并登记产出
```

> 前序铺垫提示：阶段 2/3/4 已建立「一切皆插件」「注册即效果」「能力缝三角色」的认知，本阶段是**把这些认知变成一次真实改动**的收官。不需要再补新的结构认知，重点是**把「读」落到「改」**，并第一次走完仓库的 verify/合规门禁。

## 关键决策点：第 2 步选哪条路径

learning-path 阶段 5 给出二选一：工具路径（`adding-a-tool`）或包路径（`adding-a-package`），做前端节点或模型适配器再回读另两篇。两条路径的取舍：

- **工具路径**：改动最小、闭环最快，只在一个现有插件里注册一个 `defineTool`；适合先跑通「新增行为挂在扩展点」的最小闭环。事实源：[adding-a-tool.zh.md](../../docs/cookbook/adding-a-tool.zh.md) + 第一个工具教程 [tool.zh.md](../../docs/user/develop/basic/tool.zh.md)。
- **包路径**：改动更大，从零新建一个 `@deepseek-ai/dsh-<name>` 包并走完 `doc-sync / constraints / typecheck / lint / build / hygiene` 全套门禁；适合验证「包级扩展点 + 全套 verify」的完整流程。事实源：[adding-a-package.zh.md](../../docs/cookbook/adding-a-package.zh.md)。

两条路径的**共同底线**（也是阶段 5 真正考核点）相同：改动必须挂在已文档化扩展点（`ctx.tools.register` / `ctx.effect` / `ctx.on`），不得改 `agent-loop`；触及模型可见行为时必须同 PR 补 keyless snapshot。建议：**默认选工具路径先跑通闭环**，若想一次覆盖包级门禁再叠加包路径；两条路径可先后做，不必二选一舍弃另一条。

## 第 1 步：读扩展映射总表（extension-cookbook.zh.md）

建立阶段 5 的入口锚点。事实源：[extension-cookbook.zh.md](../../docs/cookbook/extension-cookbook.zh.md)。

- [ ] [extension-cookbook.zh.md](../../docs/cookbook/extension-cookbook.zh.md) 精读，重点两节：「工具插件」（`ctx.tools.register` + `defineTool`）与「功能→机制映射」总表
- [ ] 能说出「功能→机制映射」总表的核心主张：每个产品功能都映射到一个文档化扩展点上的监听器，没有任何一行修改循环本身
- [ ] 从总表里定位「内置工具」这一行，确认它对应 `ctx.tools.register()`，schema 自动流入 `system-prompt` 装配（`dsh-tool-*` 是已交付示例）——这将是第 3 步改动落点的直接依据

## 第 2 步：选定路径并读对应指南

按上一节「关键决策点」选定路径（默认工具路径），精读对应指南。

### 2a. 工具路径（默认）

- [ ] [tool.zh.md](../../docs/user/develop/basic/tool.zh.md) 精读——第一个工具教程，`greet` 工具的最小闭环（`inject: ['tools']` + `defineTool` + `execute` 返回规范值 + `render` 转模型可见内容）
- [ ] [adding-a-tool.zh.md](../../docs/cookbook/adding-a-tool.zh.md) 精读——工具约定真源：`execute()` 约定规则（参数已校验 / 注册借用只读定义 / 执行身份受保护 / 声明规范 JSON 值 / 异常即 isError / 遵守 `exec.signal`）、执行策略与观测、UI 渲染方式、验证一节
- [ ] 确认「最小形态」代码里每一行对应哪个已文档化扩展点或约定（`inject` 等注册表就绪 / `ctx.tools.register` 挂扩展点 / `defineTool` 类型化辅助）

### 2b. 包路径（可选叠加）

- [ ] [adding-a-package.zh.md](../../docs/cookbook/adding-a-package.zh.md) 精读——五个编号步骤：创建包 / 根配置注册 / 确定包拓扑 / 编写包 README / 验证
- [ ] 读懂「角色命名表」（Controller / Store / Registry / Provider / Backend…）与「三角色独立演化才拆包」的判据，与阶段 4 已建立的 seam 认知对照
- [ ] 看懂第 5 步验证命令串：`pnpm install` → `doc-sync` → `constraints && typecheck && lint` → `build && hygiene`

> 若只走工具路径，2b 可跳过；本阶段过关标准①只要求「所选指南」的 verify 步骤通过，选哪条就做哪条。前端节点（`adding-a-conversation-node`）与模型适配器（`adding-an-llm-adapter`）仅在目标是对应方向时才回读，本计划默认不覆盖。

## 第 3 步：动手实现（走完所选指南全部编号 verify 步骤）

把第 2 步的读变成一次真实改动。verify 步骤以所选指南原文为准，此处只列执行动作与验证点。

- [ ] **实现改动**：按所选路径落代码——工具路径 = 在 `scratch-plugin` 里注册一个工具（可先复现 `greet` 最小闭环，再替换为自己的小工具）；包路径 = 新建 `packages/<group>/<pkg>/` 并补齐 package.json / tsconfig / src / README
- [ ] **跑 verify 步骤（工具路径）**：`pnpm dsh web --patch ./scratch-plugin/cordis.yml` 启动，在 Web UI 输入一句能触发该工具的提示，确认工具被调用并收到正确结果
- [ ] **跑 verify 步骤（包路径）**：`pnpm install` → `pnpm run doc-sync` → `pnpm run constraints && pnpm run typecheck && pnpm run lint` → `pnpm run build && pnpm run hygiene` 全部通过
- [ ] **明确改动的扩展点归属**：能指认自己的改动挂在哪个已文档化扩展点（`ctx.tools.register` / `ctx.effect` / `ctx.on`），并确认没有触碰 `agent-loop`（过关标准②）

## 第 4 步：合规自查 + 落盘

对照过关标准逐条自查，并登记产出。

- [ ] **过关标准①自查**：所选指南的全部编号 verify 步骤确已通过（对照指南原文逐条核对）
- [ ] **过关标准②自查**：改动挂在已文档化扩展点，未改 `agent-loop`；若涉及 `agent-loop` 需同步更新 [architecture.zh.md](../../docs/architecture.zh.md)（learning-path「风险提示」loop 红线）
- [ ] **过关标准③自查**：判断改动是否触及模型/产品用户可见行为——若触及，同 PR 通过真实可运行示例补一条 keyless snapshot（事实源在 [testing.zh.md](../../docs/testing.zh.md)「When a snapshot test is required」一节；本阶段只照做，为什么由阶段 6 讲）
- [ ] 更新 [index.zh.md](../index.zh.md) 进度看板阶段 5 行：状态改「完成」，登记本阶段产出链接

## 已完成的落盘产出

（每轮学习结束后，按 [method.zh.md](../method.zh.md)「落盘约定」由读者裁决是否记录；记录后在此登记链接）

journal：

- [2026-08-26-01-out-of-tree-plugin-frontend-injection.md](../journal/2026-08-26-01-out-of-tree-plugin-frontend-injection.md) — 仓外插件前端注入的源码裁决（Critic「必须 fork」→ Builder「可运行时挂载」）
- [2026-08-26-02-poc-build-tsdown-version-drift.md](../journal/2026-08-26-02-poc-build-tsdown-version-drift.md) — PoC 构建打通：`^` 版本号制造「上游漂移」+ 手写路线 A 契约实测
- [2026-08-26-03-install-target-and-profile-isolation.md](../journal/2026-08-26-03-install-target-and-profile-isolation.md) — install 落点裁决与 profile 隔离方案（fork `web-poc` / DSH_HOME 沙箱）
- [2026-08-26-04-dsh-home-sandbox-three-questions-switch.md](../journal/2026-08-26-04-dsh-home-sandbox-three-questions-switch.md) — DSH_HOME 沙箱三问（持久性 / debug / 热更新）与落点切换到沙箱（已实测搭建）
- [2026-08-26-05-browser-debug-and-ide-tooling.md](../journal/2026-08-26-05-browser-debug-and-ide-tooling.md) — 浏览器半断点收尾：Node 断点错位 + `.tsx` 导入报错（NodeNext）+ tasks.json cwd 三连坑

notes：

- [out-of-tree-plugin.zh.md](../notes/architecture/out-of-tree-plugin.zh.md) — 仓外插件开发机制（零污染 / 前端运行时注入 / 构建契约 / debug / 检查对齐）

guide：

- [custom-plugin.zh.md](../guide/custom-plugin.zh.md) — 仓外插件开发操作手册（可行性 + 整体方案 + 具体做法 + 踩坑清单）

experiments：

（待补；若动手实现是可复现的假设→操作→观察→结论，按 `NNN-slug.zh.md` 编号登记）

## 过关检验自测（完成时逐条打勾）

> 说明：阶段 5 按「仓外插件、零污染」目标视为完成（见 index.zh.md 进度看板）。② 已满足；①（cookbook verify，需进入 dsh 主仓）与 ③（keyless snapshot，属阶段 6 主题）因当前目标为「对 dsh 源码零污染、暂不进入主仓、暂不关注 keyless」，**有意延后到阶段 7 之后回填**。

- [ ] ① 所选 cookbook 指南的全部 verify 步骤通过（工具路径 = 工具被调用并返回正确结果；包路径 = 五条门禁命令全绿）——**暂缓**
- [x] ② 改动遵守「挂在已文档化扩展点」而非改 loop（能指认扩展点，未触碰 `agent-loop`）——tool-notes 经 `ctx.tools.register` + `defineTool` 挂扩展点，未改 loop
- [ ] ③ 若触及模型/用户可见行为，同 PR 的 keyless snapshot 已补（未触及则此项记 N/A 并说明依据）——**暂缓**（随阶段 6 回填）
