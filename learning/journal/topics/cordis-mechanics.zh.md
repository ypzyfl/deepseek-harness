# 主题：Cordis 核心机制

一句话定位：精读 cordis-primer 与教程 01–04 过程中，对 Cordis 框架「核心机制」的历次澄清与理解——分发模式、`!!js` 配置、实践规则、运行时/类型解析两条路径。

按时间：

- [2026-08-18-01-cordis-dispatch-modes.md](../2026-08-18-01-cordis-dispatch-modes.md) — 分发模式两个误解的修正（「是否 await」列实际是「分发器是否 async」，与监听器串行正交；补充 emit 的「同步 vs 监听器返回 Promise」主语辨析）
- [2026-08-18-02-cordis-loader-js-tag.md](../2026-08-18-02-cordis-loader-js-tag.md) — `!!js` 的澄清（静态结构 + 动态参数分界；`!!js` 是 loader 自定义标签、`!js` 未注册会静默失效）
- [2026-08-18-03-cordis-practice-rules.md](../2026-08-18-03-cordis-practice-rules.md) — 实践规则两条纪律（装在哪 / 怎么卸；每个注册配 disposer）
- [2026-08-18-04-runtime-vs-type-resolution.md](../2026-08-18-04-runtime-vs-type-resolution.md) — 运行时解析 vs 类型解析（hello.ts 报错但能跑；两套模块解析路径）

相关笔记（认知增量沉淀处）：

- [notes/mechanisms/cordis-plugin-service-mechanics.zh.md](../../notes/mechanisms/cordis-plugin-service-mechanics.zh.md) — 插件/服务机制细节（含插件入口与命名、教程 loader = dsh loader）
- [notes/architecture/plugin-service-seam.zh.md](../../notes/architecture/plugin-service-seam.zh.md) — 插件/Service/seam 层级关系
