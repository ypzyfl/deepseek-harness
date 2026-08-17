# 从 core 整体认知到 seam 深度追问

日期：2026-08-17

## 起因

实验 001 完成后，想深入 `agent-loop`，但发现自己缺「core 整体认知」和「Cordis 地基」，于是先停下来建立 core 的整体框架，再被几个关于 seam 的问题一路追问到「可替换性」的本质。

## 认知主线

一天走完两条线：

```
线一：core 整体认知
  packages/core 是什么 → 与 Cordis 的关系 → 七包三层架构
    → spine（agent/agent-loop）接口/实现分离
    → 落盘 notes/core-spine.zh.md

线二：seam 深度追问（被"core 是不是 seam"触发）
  seam 三角色 → 为什么含 Consumer → spine vs seam
    → 可替换的四种机制 → 行为不匹配的两种安全哲学
    → 落盘 notes/seam-and-replaceability.zh.md
```

## 关键突破（这轮最重要的收获）

1. **core 七包不是 seam，是 spine**：spine 定义协议与主干行为，seam 是可替换能力，两者是五层架构的 L1/L2 两层。
2. **seam 必须含 Consumer**：Consumer 是「面向模型的脸」，Provider 是「干活的手」，只换手不换脸会导致「通告面」与「可执行面」脱节。
3. **「接口匹配」≠「行为匹配」**：这是被追问逼出来的最锋利结论。接口只保证「签名匹配」，行为匹配靠「事件词汇 + 不变量断言」。
4. **两种安全哲学**：seam 靠「三位一体」结构保险（绑定三角色），spine 靠「观测保险」（把行为暴露成可断言的事件流）。
5. **先 Cordis 后 core**：认识到深入 core 逐包（阶段 3）之前，应过阶段 2（Cordis）；learning-path 本就如此，是自己之前想跳步。

## 落盘产出

- [notes/architecture/core-spine.zh.md](../notes/architecture/core-spine.zh.md) — core 主干 + spine 分工
- [notes/architecture/seam-and-replaceability.zh.md](../notes/architecture/seam-and-replaceability.zh.md) — seam + 可替换 + 安全哲学
- map.zh.md 更新：新增 core 三层、能力缝条目，清理过时的「未知」与断层
- index.zh.md：阶段 1 标「进行中」，重点清单新增 agent 分工条目

## 线三：组合层（architecture「组合层」小节 + profile/bundle/patch 源码查证）

读 architecture.zh.md「Profile 与组合包」小节，并查证 profile.ts / app-boot README，补全组合层认知：

1. **profile = 具名组装**（`$DSH_HOME/profiles/<name>`），**bundle = 可安装插件包**；profile 由若干 bundle 按序叠加。
2. **四层层序**：空列表 → bundle（按 `dsh.profile.bundles` 顺序）→ profile 级 patch → home 级 patch → `--patch` overlay。
3. **bundles 定义在 profile 的 package.json**（`dsh.profile.bundles` 字段），`PROFILE_TEMPLATES` 硬编码了 web/headless 的默认 bundle 列表。
4. **home 级 patch = `~/.dsh/cordis.patch.yml`，可选、不自动创建**（`loadOptionalPatches` 对缺失文件返回「无此层」）；profile 级 patch 才自动创建空 `[]`。这是我一开始「在 ~/.dsh 下没看到 cordis.patch.yml」的答案。

落盘：新建 [notes/architecture/composition-layer.zh.md](../notes/architecture/composition-layer.zh.md)。

## 待办

- 进入阶段 2（Cordis 精读）：cordis-primer.zh.md + cordis-tutorial 01–07。
- 阶段 1 剩余：仓库地图（README/AGENTS 三节/CLI README/development）、`web --dump-config`。
