# 阶段 4（能力缝与 scope）执行路线与进度

本文是阶段 4 的**执行路线 + 逐步勾选进度**：把 [learning-path.zh.md](../learning-path.zh.md) 阶段 4 的「精读材料 + 动手任务 + 过关检验」拆成可逐步推进的小步骤，并标出每步的验证点与学习区落盘动作。事实源仍是 learning-path.zh.md，本文不重复其内容、只做执行拆解；冲突以 learning-path.zh.md 为准。

过关标准（来自 learning-path.zh.md 完成标志表阶段 4 行）：① 能以 shell 家族为例说出完整 seam 的三个角色及各自包名；② 能复述 scope 的两级扁平模型，并解释 shadowing 与 restriction 的作用方向（scoped 注册在全局过滤之后合并）；③ 能举出一个包兼任多角色的合法案例。

## 路线总览（四步，由全景到原语再到样板最后落盘对照）

```
第 1 步  读缝全景 ── capability-seams.zh.md 建立「三角色 = 一个完整能力」的全景心智模型
第 2 步  二读 glossary 缝与 scope ── 从「记术语」升级到「记结构」：seam 完整性与 scope 两级扁平
第 3 步  读 scope 原语 + shell 样板缝 ── 落地「两级扁平」「shadowing/restriction」「三角色包名」
第 4 步  动手任务 ── 在 --dump-config 组合树里拆一个 seam 的三角色 + 找一个包兼任多角色反例
```

> 前序铺垫提示：阶段 2/3 已产出 [notes/architecture/seam-and-replaceability.zh.md](../notes/architecture/seam-and-replaceability.zh.md)（seam 三角色、可替换四机制、行为不匹配的两种安全哲学）。本阶段不重复已建立的结构认知，重点补齐两块此前未深挖的增量：**scope 两级扁平模型**（第 3 步）与**「一个包兼任多角色」何时合法**（第 4 步），并用 shell 家族落实「三角色 → 具体包名」。

## 第 1 步：读缝全景（capability-seams.zh.md）

建立阶段 4 的入口锚点。事实源：[capability-seams.zh.md](../../docs/capability-seams.zh.md)（能力缝全景图，约 39 KB）。

- [x] [capability-seams.zh.md](../../docs/capability-seams.zh.md) 精读（按「先看形状、再按角色分类清点」的读法）
- [x] 按「角色」列把 60 个 `ctx.*` 键分 seam / core / bundle 三堆（产出见 [notes/architecture/capability-seam-catalog.zh.md](../notes/architecture/capability-seam-catalog.zh.md)）
- [x] 对每个 seam，说出「Def / Provider / Consumer」三角色由哪些包承担（28 个 seam 的三角色表已建，见上）

## 第 2 步：二读 glossary 的 capability-seam 与 agent-scope

阶段 1 第一遍「记术语」，本遍「记结构」。事实源：[glossary.zh.md](../../docs/glossary.zh.md) 的 capability-seam 与 agent-scope 两节。

- [x] capability-seam 词条二读——记结构：**seam 是完整能力，不是任一角色**；拆分 seam 只在三角色独立演化时进行（根 AGENTS.md「A capability seam comprises…」）
- [x] agent-scope 词条二读——记结构：**scope 两级扁平、不向下继承**；子树行为用 lineage 数据表达（而非嵌套继承）
- [x] 能用自己的话说出「为什么 seam 必须三角色齐全才叫完整」（与 [seam-and-replaceability.zh.md](../notes/architecture/seam-and-replaceability.zh.md) 的「Consumer = 面向模型的脸」结论对齐）

## 第 3 步：读 scope 原语 + shell 样板缝

这是本阶段的核心两步，分别落地过关标准 ② 与 ①。

### 3a. scope 原语（过关标准 ②）

事实源：[subsystems/scope.zh.md](../../docs/subsystems/scope.zh.md)（scope 原语参考页，约 3.9 KB）。

- [x] [subsystems/scope.zh.md](../../docs/subsystems/scope.zh.md) 精读
- [x] 能复述**两级扁平模型**：两级（全局 + scoped）、扁平（不向下继承、无嵌套作用域链）
- [x] 能解释 **shadowing 与 restriction 的作用方向**：scoped 注册在全局过滤之后合并（shadowing = 同 key 覆盖 / restriction = 域内收紧，方向均为「scoped 覆盖/收窄全局」而非反向）
- [x] 与阶段 3 已读的 [notes/modules/scope.zh.md](../notes/modules/scope.zh.md) 对照，补上「两级扁平 + shadowing/restriction」这块此前未深挖的结构面

> 需要留意：阶段 3 的 scope 包笔记（`notes/modules/scope.zh.md`）主要落在「带作用域的注册原语」这一包职责上，本步的增量是「两级扁平 + shadowing/restriction 作用方向」这一 scope **模型语义**，两者是「实现 vs 模型」的关系，不重复。

### 3b. shell 样板缝（过关标准 ①）

事实源：[subsystems/shell.zh.md](../../docs/subsystems/shell.zh.md)（shell 家族样板缝，约 16.7 KB）。

- [x] [subsystems/shell.zh.md](../../docs/subsystems/shell.zh.md) 精读
- [x] 对照三角色，逐个落实包名：
  - Service Definition → `dsh-shell`
  - Service Provider → `dsh-bash-local` / `dsh-bash-sandbox`
  - Consumer → `dsh-tool-bash`
- [x] 能解释「换一个 Provider，整个产品跟着变」在 shell 家族里如何体现（bash-local 换 bash-sandbox，Consumer 通告面与可执行面同进退）

## 第 4 步：动手任务（过关标准 ①③）

在阶段 1 打印的 `--dump-config` 组合树里做两件事。事实源：`pnpm dsh --profile <name> --dump-config` 现场输出 + glossary seam 词条 + [packages/README.zh.md](../../packages/README.zh.md) Dependencies 一节。

- [x] **任选一条能力行，拆三角色**：指出它背后的 Def / Provider / Consumer 各由哪个包承担（以 shell 家族为样板，至少拆一条；可再挑 fs / web 等一条交叉验证）
- [x] **找一个「一个包兼任多角色」的反例**，并解释何时允许——线索在 glossary seam 词条与 packages/README.zh.md Dependencies 一节（预期结论：seam 三角色是「角色的常规分工」，但同一包在特定 seam 里可同时承担 Def + Provider 或 Def + Consumer，合法前提是这些角色未独立演化、换替换粒度一致）
- [x] 可选对照：LLM 缝新增的「文本之外的第二输入模态」（图片）作为 Provider 可替换性的对照素材（见 learning-path 阶段 4 提示块：`inputModalities: [text, image]` 声明、Files API 优先、`RequestImageOffloadPolicy` 上限策略），观察「Provider 能力面扩展」如何不改 Def 结构

## 已完成的落盘产出

（每轮学习结束后，按 [method.zh.md](../method.zh.md)「落盘约定」由读者裁决是否记录；记录后在此登记链接）

journal：

- [2026-08-22-02-stage4-seam-catalog-reading.md](../journal/2026-08-22-02-stage4-seam-catalog-reading.md)：阶段 4 开头——缝全景图读法 + 「mode 三列」的两次认知翻转
- [2026-08-23-01-stage4-seam-scope-structure.md](../journal/2026-08-23-01-stage4-seam-scope-structure.md)：第 2 步——从「记术语」升级到「记结构」：seam 完整性与「lineage 是数据字段不是结构」（认知已并入下方两篇 notes）
- [2026-08-23-02-stage4-shell-seam-reading.md](../journal/2026-08-23-02-stage4-shell-seam-reading.md)：第 3b 步——shell.zh.md 读不下去 → 抓住「Def 契约」主线（认知已并入 [notes/architecture/seam-structure.zh.md](../notes/architecture/seam-structure.zh.md)）

notes：

- [notes/architecture/capability-seam-catalog.zh.md](../notes/architecture/capability-seam-catalog.zh.md)：缝全景目录（按角色分三堆 + 28 个 seam 三角色表 + mode 三值判据「替换发生在哪一层」）
- [notes/architecture/seam-and-replaceability.zh.md](../notes/architecture/seam-and-replaceability.zh.md)：扩充「可替换四机制」（机制 3 操作路径 / 「改代码=写插件」视角 / 替换两个维度 / 总览表加「替换手段」列）；2026-08-23 补「完整与拆分是同一判据的两面」
- [notes/mechanisms/lineage-data-not-structure.zh.md](../notes/mechanisms/lineage-data-not-structure.zh.md)：lineage 是数据不是结构（`SessionHeader` 字段落点 + 与 scope 的同一设计哲学）
- [notes/modules/scope.zh.md](../notes/modules/scope.zh.md)：2026-08-23 补「键级父链 vs agent 平铺」「shadowing/restriction 作用方向」「条目 = 具名工具」，并回答遗留问题（键级父链与 agent 平铺是两回事）
- [notes/architecture/seam-structure.zh.md](../notes/architecture/seam-structure.zh.md)：seam 通用结构（三角色构成 + `inject`/`super(ctx,key)` 对齐机制 + request/spec 拆分 + 数据流 + 「换 Provider」体现 + 「Provider 能力面扩展不改 Def 结构」LLM 图片模态对照，shell 为贯穿例子）

experiments：

- [004-dump-config-seam-roles.zh.md](../experiments/004-dump-config-seam-roles.zh.md)：在 `--dump-config` 组合树里拆 shell 缝三角色 + 找 `dsh-llm`/`compaction-basic` 包兼多角色反例

## 过关检验自测（完成时逐条打勾）

- [ ] ① 能以 shell 家族为例说出完整 seam 的三个角色及各自包名（`dsh-shell` / `dsh-bash-local`+`dsh-bash-sandbox` / `dsh-tool-bash`）
- [ ] ② 能复述 scope 的两级扁平模型，并解释 shadowing 与 restriction 的作用方向（scoped 注册在全局过滤之后合并）
- [ ] ③ 能举出一个包兼任多角色的合法案例
