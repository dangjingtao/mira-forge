# Mira Forge 使用说明

> 当前说明基于 `dev` 分支截至 T018 的已实现能力。T015、T016、T017 已 PASS；T018 当前仍为 REVIEW，等待最后一次真实 Builder 产品链路人工烟测。

## 1. Forge 到底是什么

Mira Forge 是一个**本地 AI 工程调度台**。

它自己不是 Coding Agent，也不替代 Codex、OpenCode 或 PiAgent。它站在这些 Agent 之上，负责把一个真实软件项目里的任务讨论、任务来源、施工派发、运行状态和结果交接连接起来。

最短的理解方式是：

```text
项目
  ↓
Main Thread（讨论 / 看项目 / 看任务 / 做决定）
  ↓
Repository Task Card（项目自己的任务真相）
  ↓
Dispatch（明确派发）
  ↓
Builder（OpenCode / PiAgent / Codex 真正施工）
  ↓
Runtime（Forge 记录谁在做什么、做到哪、发生了什么）
  ↓
reviewing
  ↓
Builder 结果回到相关 Main Thread
```

Forge 的核心价值不是“再提供一个 AI 聊天框”，而是让多个本地 AI 工程执行入口共享一套可持久化、可追踪、不会偷偷越权的工程控制流程。

---

## 2. 一次真实工作应该怎么发生

### 第一步：选择一个项目

Forge 中的 Project 指向一个真实本地仓库，包括：

- 本地根目录；
- 仓库地址；
- 集成分支；
- 项目自己的 Task Ledger / Task Card 位置。

Forge 不复制项目需求到另一套任务系统里。

**项目自己的 Task Card 永远是任务真相。**

Forge 只保存执行相关事实，例如 Batch、Task runtime、Session、Dispatch、Review handoff 和 Runtime Event。

### 第二步：在 Main Thread 里讨论

Main Thread 是项目的“总控对话”。

当前可以使用：

- OpenCode；
- Codex Desktop；
- Codex CLI。

Main Thread 可以：

- 理解当前选中的项目；
- 查看项目 Task Ledger；
- 查看 / 解析 Task Card；
- 和用户讨论方案；
- 明确创建或更新 Repository Task Card；
- 生成一个指向具体 Task Card 的 dispatch handoff。

Main Thread **不是 Builder**。

它的职责是讨论、检查、规划和决定是否派发，而不是直接进入写代码施工状态。

### 第三步：选择一个真实 Task Card

一个待施工任务必须来自项目仓库自己的 Task Source。

Forge 会解析到明确的：

```text
project + taskId + taskRef
```

如果 Task Card 缺失、歧义或项目根目录错误，Forge 应明确失败，而不是猜一个任务出来。

### 第四步：明确 Dispatch

Forge 不会因为创建了 Task Card 就自动开工。

Dispatch 是一次明确操作。

当前 Builder 可以选择：

- OpenCode；
- PiAgent；
- Codex。

Forge 会把同一个 Builder 合约映射到不同 provider adapter，同时保留 provider 自己的进程 / session / thread 特征。

### 第五步：Builder 真正施工

Builder 才是实际执行代码任务的一层。

Forge 负责：

- 启动 Builder；
- 绑定 project / batch / task；
- 保存 dispatch attempt；
- 保存 session；
- 记录 provider/runtime evidence；
- 显示当前运行状态；
- 支持显式取消；
- 处理进程退出、异常、Forge 重启后的中断状态。

当前第一阶段仍然坚持**全局单 Builder 活跃施工通道**。

虽然已经支持多个 Builder provider，但这不代表它们可以同时向同一个未经 worktree 管理的工作树写入。

并行 Builder 仍属于后续能力。

### 第六步：Builder 结束后进入 reviewing

这是 Forge 最重要的边界之一：

**Builder 成功退出，不等于任务 PASS。**

一个成功 Builder dispatch 只能证明“施工进程完成”。Forge 会把 runtime Task 推进到：

```text
reviewing
```

它不能因此制造：

```text
review_passed
```

也不会自动：

- push；
- merge；
- deploy；
- 修改生产环境。

Review PASS 必须来自真正的 Reviewer / review contract，并绑定到具体 SHA。

### 第七步：Builder 结果回到 Main Thread

T018 开始闭合这条人类工作链。

当一个 Builder dispatch 与某个同项目 Main Thread 有明确 `sourceThreadId` 关联时，Builder 的终态会形成一个持久化的 `builder_result` handoff。

这个 handoff 会把这些信息带回 Main Thread：

- child task identity；
- provider；
- dispatch / session identity；
- terminal dispatch state；
- terminal task state；
- Builder 的 bounded `resultText`；
- error evidence（如果存在）。

它不会把整个 Builder 对话历史偷偷塞进 Main Thread。

Main Thread 下一次收到用户消息时，可以把自上一次用户消息以后新到达的 Builder result 作为 Forge context 使用一次，从而继续讨论：

> Builder 做完了什么？
> 当前 authoritative state 是什么？
> 下一步应该 review、修复还是继续拆任务？

同一个 dispatch result 不会因为刷新、轮询或重启而不断重复追加。

---

## 3. 你在界面里看到的几个东西分别是什么

### Workspace / Project

你当前管理的真实本地工程。

它决定 Task Source 和所有执行上下文的根目录。

### Main Thread

项目总控对话。

适合：

- 讨论；
- 分析；
- 看项目；
- 看 Task Card；
- 制定任务；
- 决定是否派 Builder；
- 接收 Builder 最终结果并继续判断。

### Batch / Task

Forge 的 runtime execution binding。

它不是新的需求系统。

Task Card 的正文和产品状态仍属于项目仓库；Batch / Task 负责描述“这个仓库任务现在在 Forge 执行链里处于什么位置”。

### Builder

真正执行施工任务的 AI Agent。

当前产品级选择：

- OpenCode；
- PiAgent；
- Codex。

### Runtime

Forge 的执行事实层。

它回答的是：

- 现在有没有 Agent 在工作；
- 谁在工作；
- 对哪个项目 / Batch / Task；
- 什么 provider；
- session 是否真的开始；
- 运行多久；
- 是否 blocked / failed / reviewing；
- 最终 result / error evidence 是什么。

Runtime 不是聊天记录，也不是任务需求。

### Runtime Inspector

T018 后，默认工作台不再同时摊开所有底层 runtime 数据。

主界面只保留紧凑的 runtime summary，包括 active / attention 等当前需要知道的信息。

需要细看时再打开 Runtime Inspector，其中会区分：

- Builder / Reviewer task runtime；
- Main Thread runtime。

并显示对应的 Batch / Task 关系，避免同一个执行对象看起来像几套不相关的数据。

### Event Log

底层 runtime / provider 事件的审计入口。

它主要用于排错、检查发生过什么。

**Event Log 不是 Main Thread，也不应该要求用户通过翻原始事件来理解 Builder 最后的结论。**

---

## 4. Forge 同时维护两种“真相”

这是理解 Forge 最容易混淆、也最重要的一点。

### Project Truth

由项目仓库自己的 Task Ledger / Task Card 持有，例如：

```text
TODO
DOING
REVIEW
PASS
```

### Runtime Truth

由 Forge 持有，例如：

```text
waiting
building
reviewing
fixing
waiting_integration
interrupted
stale
review_passed
integrated
```

它们故意不是同一个状态机。

例如：

```text
Codex Builder process exit = 0
```

只能推出：

```text
施工执行完成 → runtime task reviewing
```

不能推出：

```text
Task Card PASS
Review PASS
可以 merge
可以 deploy
```

Forge 的作用之一，就是防止这些概念被 Agent 的自然语言结果偷偷混在一起。

---

## 5. 到 T018 为止已经具备什么

### 已经具备

- 全局本地 control plane；
- 持久化 runtime state；
- 多项目注册；
- Repository-native Task Source；
- Main Thread；
- OpenCode / Codex Desktop / Codex CLI Main Thread；
- OpenCode / PiAgent / Codex Builder；
- durable session；
- durable dispatch；
- runtime events；
- process supervision；
- explicit cancel；
- dispatch readiness；
- SHA-bound review handoff contract；
- Builder success → `reviewing` 边界；
- 紧凑 Web/TUI 工作台；
- Main Thread 可调整宽度；
- compact runtime summary；
- Runtime Inspector；
- Event Log modal；
- Builder terminal result → related Main Thread handoff；
- Builder result 在下一次 Main Thread turn 中作为 bounded Forge context 使用一次；
- 刷新 / control-plane restart 后从 durable state 重建界面和结果关系。

### T018 当前还差什么

T018 当前状态仍是 `REVIEW`。

代码、自动验证和 UI focus-layer 修正已经合并到 `dev`，但最终还需要一次真实 Builder 产品链人工烟测，确认完整链路：

```text
真实 Task Card
  ↓
真实 Builder Dispatch
  ↓
Runtime Summary / Inspector 正确显示
  ↓
真实 startedAt / elapsed time 正确
  ↓
Builder terminal
  ↓
Main Thread 收到 builder_result
  ↓
下一次 Main Thread turn 能使用这个结果继续判断
```

在这次观察被接受以前，不能把 T018 标成 PASS。

---

## 6. 现在还没有什么

截至 T018，Forge **还不是全自动软件工厂**。

当前明确没有完成：

- 自动 Reviewer 调度闭环；
- 自动“Builder → Reviewer → 修复 → Reviewer”循环；
- 并行 Builder 调度；
- worktree scheduler；
- 自动 Git integration / merge；
- 自动 deploy；
- 多 Agent 自主拆解并无限扩张权限；
- 把 Main Thread 整段聊天上下文默认灌给 Builder；
- 仅凭 Builder 文本宣称任务成功。

所以目前最准确的产品定位不是：

> 全自动软件工厂

而是：

> **本地 AI 工程任务的总控台。**

它已经开始形成“讨论 → Task Card → 派发 → 施工 → 运行监控 → 结果交回”的闭环，但 Review、并行施工、Git 集成和更高阶自动化仍属于后续阶段。

---

## 7. T001–T018 可以怎样理解

不需要逐张记任务卡，可以压成四段：

| 阶段 | 产品意义 |
| --- | --- |
| T001–T004 | Forge 能活下来：control plane、持久化、runtime API、最初 dashboard |
| T005–T013 | Forge 能调度：adapter、session、review handoff、dispatch、OpenCode、进程监管、TUI、First-run Check |
| T014–T016 | Forge 开始成为产品：认识项目自己的 Task Card，有 Main Thread，能派 OpenCode / PiAgent / Codex Builder |
| T017–T018 | Forge 开始像一个可用工作台：界面收敛、实时 runtime、Inspector、Builder 结果返回 Main Thread |

换句话说：

**T001–T014 大量是在造发动机、变速箱和仪表。T015 才第一次真正装上方向盘。**

---

## 8. 一句话判断 Forge 是否继续走在正确方向上

每增加一个能力，都可以问：

> 它是在帮助“总控 AI + 真实 Task Card + 独立 Builder + 可验证 Runtime”形成更可靠的工程闭环，还是在重新制造一套聊天、任务或 Agent 平台？

前者属于 Forge。

后者应该谨慎。

---

## 9. 相关工程文档

这份说明书负责解释“Forge 是什么、怎么用”。具体工程事实继续以仓库中的正式文档为准：

- `AGENTS.md` — 核心边界和工程约束；
- `docs/architecture.md` — runtime / adapter / task-source / review 架构；
- `docs/task-source-contract.md` — Repository Task Source 合约；
- `docs/tui-interaction.md` — Web/TUI 交互规则；
- `docs/frontend-style-contract.md` — 前端样式所有权；
- `docs/workbench/00-work-ledger.md` — 任务台账；
- `docs/workbench/tasks/T015-main-thread-runtime.md` — Main Thread；
- `docs/workbench/tasks/T016-builder-thread-adapters.md` — Builder adapters；
- `docs/workbench/tasks/T017-compact-mira-web-ui.md` — 当前 UI 基础；
- `docs/workbench/tasks/T018-live-runtime-surface.md` — Live Runtime / Builder result handoff。

当这份说明书和任务卡状态发生冲突时，以最新任务卡、工作台账和已验收代码事实为准，并同步更新本说明。