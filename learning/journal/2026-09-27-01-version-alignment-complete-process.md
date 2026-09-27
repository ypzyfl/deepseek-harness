# 版本对齐 0.1.2-alpha.4 → 0.1.7-rc.1：从 diff 分析到分块学习的完整轨迹

日期：2026-09-27（回顾性记录；实际学习从 09-24 起）

## 起因

学习区文档上次对齐到 `4e84901e`（0.1.2-alpha.4），要更新到 `46a7f68b`（0.1.7-rc.1）。一跑 `git diff --stat` 发现规模远超预期：5132 个文件、约 38 万行新增，主线 523 个提交——这不是「打几个补丁」能搞定的版本对齐。

## 分析：先分清「推翻」还是「增量」

method.zh.md 的「版本对齐三问」第一次真正派上用场：**改了哪些核心面 → 有没有动摇已学结论 → 增量落去哪**。

我用了三步缩小范围：
1. `git diff --name-status` 看包级增删——立即暴露了关键信号：`session-format-v0-to-v1` 到 `-v3-to-v4` 四个迁移包（说明 `SESSION_FORMAT_VERSION` 从 0 升到 4）、`agent-presets` 复数删除、`e2b` 整组删除。
2. 派两个 code-explorer 子代理并行核查：一个查「学习文档引用的路径是否失效」，一个查「session format 演进 + 核心包变化」。
3. 自己读关键决策笔记 + 源码验证子代理结论。

结果识别出**三块「推翻」 + 一块「清理」**：
- 推翻 1：session format v0→v4（surface 三类→五类、系统提示词 header→surface）
- 推翻 2：agent-loop durable inbox（内存队列→事件溯源投影）
- 推翻 3：agent-presets 目录→声明式插件行
- 清理：e2b 删除 + examples/ 路径失效 + llm-inspector 删除

**关键认知**：版本对齐的第一要务不是「逐文件改」，而是**分清哪些是「推翻已学结论」、哪些是「能力面增量」**——推翻的要重新学、改笔记；增量的只需登记。我一度被 38 万行的 diff 吓到，但拆成「三块推翻 + 一块清理」后，每块都是可独立推进的小课题。

## 分块学习：先学「推翻」、再清「增量」

顺序是刻意的：**先学会动摇心智模型的结构级变化，再做机械清理**。

1. **session format**（journal 2026-09-24-01）：最重，因为推翻的是「日志三层模型」这个阶段 3 的核心结论。学习过程中产生四个认知翻转——最关键的是「系统提示词为什么在 step/start 之后而不是 session 最前」，它逼我厘清了「渲染（本地计算）/ 投影（决定落盘）/ 发送（wire）」三个动作的区别，纠正了我自己「渲染≠发送」的用词失误。
2. **durable inbox**：把 session format 学的「事件溯源 + 投影」立刻用上了——inbox 就是「`agent/inbox/spliced` 增量事件 + 投影重放」，和 session format 的「存增量、重放算状态」同源。学到「崩溃恢复靠重放，不靠读快照」时，恰好把 session format 的「resume 读文件走迁移链」串成闭环。
3. **agent-presets**：核心是「代际 + 引用计数」解决配置热更新（跑着的保留旧定义、新建的用新定义），这跟 session format 的「旧世代永不回退」是同一个哲学的不同投影。
4. **清理**：纯机械修正，10 个文件的路径/包名替换。

**收获**：三个「推翻」主题之间反复出现同一组设计哲学——「不可变 + 拒绝优于回退 + 状态靠重放重建」。这比单独学每个主题更深的价值在于，它们互相印证，让「事件溯源」「不可变世代」「引用计数释放」这些词从「名词」变成了「我看到它在三个地方反复出现的模式」。

## 落盘：严格按 method 分工

每块学完立刻落盘，分工是：
- **认知翻转** → journal（只有 session format 有一篇，因为它是唯一产生「原以为 X 实际 Y」的主题）
- **机制理解** → notes（新建 3 篇：`session-format`、`durable-inbox`、`declarative-agent-presets`）
- **事实增量** → map.zh.md（「0.1.7-rc.1 增量」小节）+ index.zh.md（登记）

没有把「事实增量」塞进 journal，也没有把「认知翻转」写进 notes——这次对齐里最自觉的一次纪律执行。

## 收尾检查：分析清单和执行之间要有对照

四块学完、落盘完，我做了最后一次系统检查，对照第一轮分析清单，**发现了三处遗漏**：
- `core-spine.zh.md` 的 `agent-tool-presentation` 结论过时（README 已升列为 8 包）
- `guide/custom-plugin.zh.md` 的 peer 兼容性（第一轮明确列的 P1，但「聚焦核心机制」时被搁置了）
- `capability-seam-catalog.zh.md` 只删了 e2b，没做完整重核（code-runtime→ptc-runtime、workflow→ptc、SSH 系列等 10 处 provider 重组）

**教训**：第一轮分析列的优先级清单（P0/P1/P2/P3），在执行「聚焦学核心机制」时，P1 的「操作手册更新」和「seam 目录重核」被自然搁置——因为它们的性质是「增量修正」而非「推翻学习」。这不是大错，但说明**分析清单不能只是「识别」，还要在收尾时逐项销账**，否则「识别了但没做」会漏。

## 元认知沉淀

1. **版本对齐 = 分块 + 分性质**：把「38 万行 diff」拆成「三块推翻 + 一块清理」，每块独立推进；先学推翻、后清增量。
2. **「推翻」比「增量」值得花时间**：能力面扩展（browser-use/computer-use/voice-input 等新包）对已有心智模型冲击小，可以一句带过；结构级变化（session format、inbox、preset）才是学习重点。
3. **三个主题互相印证 > 三个主题单独学**：反复出现的「不可变 + 重放」哲学，比任何单个机制都更值得记住。
4. **收尾要逐项销账**：分析清单和最终执行之间，需要一个「对照销账」的收尾步骤，否则 P1 项会漏。

## 事实源

- 版本区间：`4e84901e`（0.1.2-alpha.4）→ `46a7f68b`（0.1.7-rc.1）
- 产出笔记：`notes/mechanisms/session-format.zh.md`、`notes/mechanisms/durable-inbox.zh.md`、`notes/architecture/declarative-agent-presets.zh.md`
- 相关 journal：`2026-09-24-01-session-format-v0-to-v4.md`
- map.zh.md 的「0.1.7-rc.1 增量」小节
