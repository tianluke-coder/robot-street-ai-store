# HANDOFF · 开发交接文档

> 面向接手继续开发的团队成员。读完应能：跑起来、看懂编排、安全地加功能、避开已知坑。
> 配套阅读：[README.md](./README.md)（项目简介与运行）、[v0.3-升级说明与测试结果.md](./v0.3-升级说明与测试结果.md)（本版验收与测试明细）。

---

## 0. 一句话现状

已完成到 **v0.3**：双世界（线下人类 / 线上小星）并行 + 三实验 + 汇合反馈 + 双架构模式。`npm test` 38 项全绿，`npm run build` 通过，已上线并推送到 GitHub 私有库。**没有未完成的断点**，可以在此基础上继续加功能。

---

## 1. 数据流总览

```
index.html  (双栏 DOM：#street / #world / #human-* / #star-* / #future-store / #decision)
      │
      ▼
src/main.js  ── 编排器（唯一入口，负责实例化与流程控制）
   ├─ new StreetWorld(#street)   → 线下街区 SVG + 人类顾客移动
   ├─ new World(#world)          → 线上世界 SVG + 小星移动
   ├─ new HumanCustomer()        → 线下状态机（分钟）
   ├─ new Agent()                → 线上状态机（秒）+ 采购四阶段
   └─ new UI({...})              → 所有 DOM 渲染
      │
      ├─ runHumanSide(exp)  ─┐
      ├─ runStarSide(exp)    ├─ Promise.all 并行
      │                     ─┘
      ▼
   showConvergence(exp)  → #decision 汇合区（主人反馈 + 最终决策）
```

一次 `startExperiment(exp)` 就是 `Promise.all([runHumanSide, runStarSide])`，两边都跑完后进入 `showConvergence`。

---

## 2. 模块地图

| 文件 | 职责 | 关键导出 / 方法 | 备注 |
|---|---|---|---|
| `src/main.js` (719 行) | 编排器 | `runHumanSide`(≈177) `runStarSide`(≈251) `buildStarReportHtml`(≈531) `showConvergence`(≈574) `startExperiment`(≈617) `switchArch`(≈673) `init`(≈708) | 行号会随改动漂移，以函数名为准 |
| `src/agent.js` | 线上小星状态机 | `STATES` `STATE_LABELS` `PURCHASE_STAGES` `PURCHASE_STAGE_LABELS`；`finalizeComparison` / `finalizeNewArrivals` / `evaluatePurchase` / `submitForApproval` / `decideApproval` / `completePurchase` / `recomputeAfterFeedback` / `reset` | 采购授权校验也在这里 |
| `src/human.js` | 线下人类顾客状态机 | `HUMAN_STATES` `HUMAN_STATE_LABELS`；`addMinutes` / `observePlace` / `buildReport` / `setExperiment` / `reset` | 用「分钟」，绝不展示 JSON |
| `src/world-street.js` | 线下街区渲染 | `StreetWorld`：`render` / `moveHumanTo` / `highlightPlace` / `resetPlaces` / `resetHuman` | 人类顾客是黄衣 2D 小人 |
| `src/world.js` | 线上世界渲染 | `World`：`render(mode)` / `moveAvatarTo` / `activateStore` / `resetStores` / `revealProduct` / `hideAgent`；`waypoints`(home/gateway/channel/doors) | 坐标 viewBox 0 0 900 560 |
| `src/ui.js` (385 行) | 全部 DOM 渲染 | 见下方 UI API | 新增 UI 能力改这里 |
| `src/scoring.js` | 可解释评分 | `SCORING_CONFIG`（权重集中处）/ `setExperienceAdjust` / `getExperienceAdjust` / `resetExperienceAdjust` | 体验调整是**运行时状态**，不改商品数据 |
| `src/clock.js` | 可暂停时钟 | `wait(ms)` / `clock.paused` | 动画与等待共用「未暂停时间」累积 |
| `src/dialogue.js` | 微信风对话文案 | 按场景返回文案 | 仅线上展示 |
| `src/protocol.js` | A2A/1.0 JSON 报文 | 构造 request/response | 仅线上展示，模拟机器通信 |
| `src/history.js` | 上次访问记录 | 读写 localStorage | 支撑「自上次访问后新增」语义 |
| `data/experiments.js` | 三实验定义 | `EXPERIMENTS` `getExperimentById` | `TASK_TYPES` 来自 tasks.js |
| `data/street.js` | 街区点位 + 映射 | `STREET_PLACES` `STREET_ENTRANCE` `getPlaceById` `getOnlineStoreForPlace` | 每点位含 `humanServices`（面向人）与 `aiInfo`（面向 AI） |
| `data/stores.js` | 三家线上商店 | `STORES` `getStoreById` | 店铺智能体话术（预设，无大模型） |
| `data/products.js` | 9 件商品 | `PRODUCTS` `getProductById` `getProductsByStore` | 每件含 `physical` 实物体验字段 |
| `data/tasks.js` | 任务类型 | `TASK_TYPES` `TASK_TYPE_LABELS` `TASKS` | compare / discover / purchase |
| `data/scenarios.js` | 场景与偏好 | `SCENARIO` `INTEREST_LABELS` | 评分读取偏好 |
| `data/architecture.js` | 架构模式 | `ARCH_MODES`(platform/p2p) `ARCH_CONFIG` `MODE_COMPARISON` `REALITY_SPLIT` `DISCLAIMER` `getArch` | 免责声明唯一来源 |

### UI 类可用方法（src/ui.js）

`build` `setArch` `renderArchDiagram` `highlightArch` `renderModeComparison` `renderControls`
`updateHuman` `logHuman` `showHumanReport`
`updateStar` `logStar`
`showFutureStore` `openDialogue` `clearDialogue` `pushTime` `pushMessage`
`openPanel` `clearPanel` `pushProtocol` `showPurchaseStage` `showCompare` `showNewArrivals` `showRecompute`
`showDecision` `hideDecision`
`resetAll` `resetStar`

> ⚠️ 没有 `hidePanel` 这个方法，清空右侧面板用 `clearPanel()`。

---

## 3. 状态机

**线上小星**（`STATES`）：
`IDLE → ACCEPTING_TASK → LEAVING_HOME → VISITING_STORE → COMPARING_PRODUCTS → RETURNING_HOME → REPORTING → COMPLETED`

**采购四阶段/六态**（`PURCHASE_STAGES`）：
`over_budget`（超硬预算，不推荐）→ `recommended` → `pending`（待审批）→ `approved` → `completed`；异常分支 `rejected`（未批准不下单）。

**线下人类顾客**（`HUMAN_STATES`）：
`IDLE → WALKING → ENTERING → OBSERVING → CONSULTING → RECORDING → RETURNING → REPORTING`

两边各自独立推进，只用同一个中止令牌，不共享状态。

---

## 4. 扩展指南（照着改就行）

### 4.1 新增一个实验
1. 在 `data/experiments.js` 的 `EXPERIMENTS` 里加一项，字段照抄现有项：
   `id` / `code` / `type`（来自 `TASK_TYPES`）/ `title` / `masterGoal` / `detail` / `budget` /
   `humanPlaces`（线下点位 id 数组）/ `starStores`（线上商店 id 数组）/ `forcePurchase` /
   可选 `targetItemId` `qty` `feedbackLoop`。
2. 在 `index.html` 加一个实验按钮（参照 `#exp-a`），并在 `src/main.js` 的 `EXP_MAP`（≈128）里加一行 `['exp-x', '你的实验id']`，再抓取按钮、绑定点击 `selectExperiment(...)`。
3. 若新实验的线上汇报形态不同，扩展 `buildStarReportHtml(exp)`（≈531）里的分支。
4. 跑 `npm test`，在 `regression.test.mjs` 补一组断言。

### 4.2 新增商品
在 `data/products.js` 加一项，必须同时给规格字段（`price` / `programmable` 等）和 **`physical`**（`handsOn` / `demo` / `appeal` / `note`）。实物体验与规格是两套字段，别混。

### 4.3 新增街区点位
在 `data/street.js` 的 `STREET_PLACES` 加一项：`id` / `name` / `kind` / `onlineStoreId`（无映射填 `null`）/ 坐标 `x,y,w,h` / `accent` / `humanServices`（数组）/ `aiInfo`（对象或 `null`）。坐标基于 `viewBox 0 0 900 560`，**别随意改动已校准的相对位置**。

### 4.4 新增 / 调整架构模式
改 `data/architecture.js`：`ARCH_MODES`、`ARCH_CONFIG`、`MODE_COMPARISON`、`REALITY_SPLIT`。再在 `ui.renderArchDiagram` 里画对应路径、`main.switchArch` 里接上。注意模式切换只允许影响右侧。

### 4.5 调整评分或反馈影响
- 权重：`src/scoring.js` 的 `SCORING_CONFIG.weights`。
- 线下反馈折算：实验里的 `feedbackLoop.adjust`（示例 -28），最终经 `setExperienceAdjust` 生效、`recomputeAfterFeedback` 重算。

---

## 5. 已踩过的坑（重要）

1. **`ui.hidePanel` 不存在** —— 清空右侧面板是 `ui.clearPanel()`。曾因误调导致 `runStarSide` 抛错、`Promise.all` 拒绝、小星卡在「返回主人电脑」，回归测试超时才暴露。**任何 `await` 链里的方法名写错都只会表现为"卡住"**，调不通先查控制台异常。
2. **暂停必须走 `clock.paused`** —— `wait()` 与 `moveAvatarTo`/`moveHumanTo` 共用未暂停时间累积；不要自己写 `setTimeout` 做动画等待，否则暂停不住。
3. **中止令牌要贯穿每个 `await` 之后** —— 每次 `await` 回来先 `if (!check()) return;`。切换实验/模式靠 `currentRunId++` 让旧的 `check()` 失效，漏检会残留旧协程污染新场景。
4. **`experienceAdjust` 是运行时状态** —— `resetScene()` 里会 `resetExperienceAdjust()`；它不修改 `PRODUCTS` 原始数据。想永久改体验分请改 `physical` 或商品数据，别指望 adjust 留存。
5. **双计时器不能混用** —— 线下 `human.addMinutes`（分钟），线上 `addStarSeconds`（秒）。界面文案也分别标注，别把两者相加或互换。
6. **模式切换只重置右侧** —— `switchArch` 里调 `world.render(mode)` + `ui.resetStar()`，不要 `human.reset()`/`street.render()`，否则左侧线下会被"顺手清掉"。
7. **若要直接发布源码（非 dist）** —— Vite 会被反代域名拦（"Blocked request. This host is not allowed."），需在 `vite.config.js` 加 `server.allowedHosts: true`。当前 `host: true` 只是绑定 0.0.0.0，不含放行。
8. **`timeout` 命令 macOS 没有** —— 别用 GNU `timeout`；跑 `npm test` 用后台任务再轮询输出。

---

## 6. 测试台（regression.test.mjs）

- 用 **jsdom** 加载 `index.html`，把 `window/document/performance/requestAnimationFrame` 注入 Node 全局，然后 `import('src/main.js')` 真实跑应用。
- **虚拟时钟**：`performance.now` 返回自增的 `vnow`，`requestAnimationFrame` 用 `setTimeout(...,0)` 每次推进 60ms —— 把几十秒的动画压成秒级。
- **采集快照**：`#world-panel` 等会被覆盖，所以每 2ms 调 `collect()` 采样，断言用 `hasText()` 查历史文本，而不是只看最终态。
- **加断言**：在对应 `group()` 里加 `ok(cond, label)` / `hasText(needle, label)`；跑完打印「通过 N 项，失败 M 项」，并检查 `errors` 数组（任何 jsdomError / unhandledRejection 都算失败）。
- 现有 7 组 38 项：架构与布局 / 实验A / 实验B / 实验C+反馈 / 模式切换 / 暂停继续重播 / 无运行时错误。

---

## 7. 部署

- **静态站（推荐）**：`npm run build` → 把 `dist/` 作为静态目录发布。已发布：https://human-ai-dual-world.app.workbuddy.host/?sharecode=YDGMZII4OL 。更新即覆盖同一链接。
- **GitHub**：私有库 `https://github.com/tianluke-coder/robot-street-ai-store`（main + tag v0.2/v0.3）。
- 注意：GitHub MCP 连接器的 App token **无建库权限**（`create_repository` 返回 403）；本机用 `gh` CLI（已登录 `tianluke-coder`，scopes 含 `repo`）建库与推送。加协作者：`gh api -X PUT repos/{owner}/{repo}/collaborators/{user} -f permission=push`。

---

## 8. 已知限制 / 后续可做

- 无真实大模型与真实交易（设计如此，别擅自接入）。
- 无后端、无持久化；仅 `history.js` 用 localStorage 记「上次访问」。
- 街景坐标手工校准，新增点位需手动对位。
- 可扩展方向：更多实验剧本、更多街区点位与门店、更丰富的可解释评分维度、把「未来商店观察」做成对比视图、导出实验报告。
- 若要多人实时协作观看，可考虑加只读分享链接（当前站点已可公开访问）。
