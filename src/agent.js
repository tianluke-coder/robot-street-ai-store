// src/agent.js
// 数字分身「小星」的状态、多任务轮换执行、候选管理与采购审批。
// 这里只保存“状态与数据”，不直接操作画面（画面由 world.js / ui.js 负责）。

import { SCENARIO } from '../data/scenarios.js';
import { TASK_TYPES } from '../data/tasks.js';
import { rankProducts, isCandidate, buildPreferences } from './scoring.js';
import { loadHistory, saveVisit } from './history.js';

// 状态机定义（必须满足验收：可暂停/继续/重置）
export const STATES = {
  IDLE: 'IDLE',
  ACCEPTING_TASK: 'ACCEPTING_TASK',
  LEAVING_HOME: 'LEAVING_HOME',
  VISITING_STORE: 'VISITING_STORE',
  COMPARING_PRODUCTS: 'COMPARING_PRODUCTS',
  RETURNING_HOME: 'RETURNING_HOME',
  REPORTING: 'REPORTING',
  COMPLETED: 'COMPLETED',
};

// 状态中文标签（用于观察面板）
export const STATE_LABELS = {
  IDLE: '待机',
  ACCEPTING_TASK: '接受任务',
  LEAVING_HOME: '离开主人电脑',
  VISITING_STORE: '访问商店',
  COMPARING_PRODUCTS: '比较商品',
  RETURNING_HOME: '返回主人电脑',
  REPORTING: '向主人汇报',
  COMPLETED: '任务完成',
};

// 状态机推进顺序（用于进度条）
export const STATE_ORDER = [
  STATES.ACCEPTING_TASK,
  STATES.LEAVING_HOME,
  STATES.VISITING_STORE,
  STATES.COMPARING_PRODUCTS,
  STATES.RETURNING_HOME,
  STATES.REPORTING,
  STATES.COMPLETED,
];

// 采购流程的四个阶段（明确区分，不接入真实支付）
export const PURCHASE_STAGES = {
  OVER_BUDGET: 'over_budget', // 超出硬性预算：不作推荐
  RECOMMENDED: 'recommended', // 已推荐（符合硬性预算）
  PENDING: 'pending', // 待审批
  APPROVED: 'approved', // 已批准
  REJECTED: 'rejected', // 未批准：不进入下单
  COMPLETED: 'completed', // 模拟完成
};

export const PURCHASE_STAGE_LABELS = {
  over_budget: '超出硬性预算 · 不作推荐',
  recommended: '已推荐',
  pending: '待审批',
  approved: '已批准',
  rejected: '未批准 · 不进入下单',
  completed: '模拟完成',
};

let orderCounter = 0;

export class Agent {
  constructor() {
    this.identity = SCENARIO.avatar;
    this.home = SCENARIO.avatar.home;
    this.tasks = SCENARIO.tasks;
    this.userAdjusted = false; // 主人是否在界面上改过条件
    this.preferences = null;
    this.reset();
  }

  // 全局重置：清空所有任务结果、候选
  // 注意：主人在界面上调整过的条件（预算 / 授权 / 优先条件）在重置与重播时保留，
  // 否则主人一按重播条件就被悄悄还原，改预算看结果这件事会失效。
  reset() {
    this.state = STATES.IDLE;
    this.taskIndex = 0;
    this.currentTask = null;
    this.completedTasks = [];
    this.compareSnapshot = null; // 比价任务的结果快照（供反馈后对比）
    const keep =
      this.userAdjusted && this.preferences
        ? JSON.parse(JSON.stringify(this.preferences))
        : null;
    this.preferences = keep || JSON.parse(JSON.stringify(SCENARIO.preferences));
    this.feedbackApplied = false;
    orderCounter = 0;
    this.resetTaskState();
  }

  // 单个任务的重置（轮换到下一个任务时调用）
  resetTaskState() {
    this.candidates = [];
    this.discovered = [];
    this.visitedStores = [];
    this.newArrivals = []; // 当前上架新品
    this.newlyAdded = []; // 自上次访问后新增
    this.lastVisitAt = null;
    this.hasHistory = false;
    this.ranking = null;
    this.recommendation = null;
    this.order = null;
    this.purchase = null; // 采购流程状态
    this.comparisonDone = false;
  }

  setState(s) {
    this.state = s;
  }

  beginTask(index) {
    this.taskIndex = index;
    this.currentTask = this.tasks[index] || null;
    this.resetTaskState();
    return this.currentTask;
  }

  visitStore(storeId) {
    if (!this.visitedStores.includes(storeId)) {
      this.visitedStores.push(storeId);
    }
  }

  // 修复（第二轮）：偏好必须由“当前任务 + 主人当前偏好”共同决定，
  // 这样才能保证在界面上改预算或优先条件后，评分结果真的会变。
  _prefs(task) {
    return buildPreferences(task || this.currentTask, this.preferences);
  }

  // 查看一件商品：按当前任务类型决定它归属哪类清单
  discover(product) {
    if (!this.discovered.includes(product.id)) {
      this.discovered.push(product.id);
    }
    if (!this.currentTask) return;

    const type = this.currentTask.type;

    if (type === TASK_TYPES.COMPARE) {
      if (isCandidate(product, this._prefs()) && !this.candidates.includes(product.id)) {
        this.candidates.push(product.id);
      }
    } else if (type === TASK_TYPES.DISCOVER) {
      if (product.isNew && !this.newArrivals.includes(product.id)) {
        this.newArrivals.push(product.id);
      }
    } else if (type === TASK_TYPES.PURCHASE) {
      const target = this.currentTask.constraints.targetItemId;
      if (product.id === target && !this.candidates.includes(product.id)) {
        this.candidates.push(product.id); // 购买任务里 candidates 表示“锁定目标”
      }
    }
  }

  isHit(product) {
    if (!this.currentTask) return false;
    const type = this.currentTask.type;
    if (type === TASK_TYPES.COMPARE) return this.candidates.includes(product.id);
    if (type === TASK_TYPES.DISCOVER) return product.isNew === true;
    if (type === TASK_TYPES.PURCHASE) {
      return product.id === this.currentTask.constraints.targetItemId;
    }
    return false;
  }

  // 比价任务：用当前偏好评分排序，并保存快照（供主人反馈后对比）
  finalizeComparison(products) {
    const prefs = this._prefs();
    const ranking = rankProducts(products, prefs);
    this.ranking = ranking;
    this.recommendation = ranking.find((r) => !r.excluded) || ranking[0] || null;
    this.comparisonDone = true;

    this.compareSnapshot = {
      recId: this.recommendation.product.id,
      recName: this.recommendation.product.name,
      score: this.recommendation.score,
      scores: ranking.map((r) => ({ id: r.product.id, name: r.product.name, score: r.score })),
    };
    return ranking;
  }

  // 新品任务：区分两种语义
  //   currentNew —— 当前上架新品（商品数据里标了 isNew 的全部）
  //   newlyAdded —— 自上次访问后新增（这次看到、上次还没出现过的）
  finalizeNewArrivals(products) {
    const hist = loadHistory();
    const currentNew = products
      .filter((p) => p.isNew)
      .sort((a, b) => (a.releaseDate < b.releaseDate ? 1 : -1))
      .map((p) => p.id);

    const seen = hist.seenProductIds || [];
    const newlyAdded = currentNew.filter((id) => !seen.includes(id));

    this.newArrivals = currentNew;
    this.newlyAdded = newlyAdded;
    this.lastVisitAt = hist.lastVisitAt;
    this.hasHistory = !!hist.lastVisitAt;
    this.comparisonDone = true;

    // 记录本次访问，供下一次运行比较“新增”
    saveVisit(currentNew, new Date().toISOString());

    return {
      currentNew,
      newlyAdded,
      lastVisitAt: hist.lastVisitAt,
      hasHistory: this.hasHistory,
    };
  }

  // ---------- 采购流程（推荐 → 待审批 → 已批准 → 模拟完成） ----------

  // 评估：硬性预算、授权清单、授权额度、授权开关、库存、任务范围
  // 修复（第二轮）：授权额度读取主人当前偏好中的可变值，而不是写死的全局常量。
  evaluatePurchase(item, qty = 1) {
    const prefs = this.preferences;
    const auth = prefs.authorization || {};
    const task = this.currentTask || {};
    const target = task.constraints ? task.constraints.targetItemId : null;
    const amount = item.price * qty;

    const hardOk = item.price <= prefs.budget;
    const inList = (auth.allowedItems || []).includes(item.id);
    const withinLimit = amount <= (auth.budgetLimit != null ? auth.budgetLimit : 0);
    const granted = auth.allowPurchase === true;
    const stockOk = (item.stock || 0) >= qty;
    const inScope = !target || target === item.id;

    const checks = [
      {
        label: `不超过硬性预算 ￥${prefs.budget}`,
        ok: hardOk,
        detail: `该商品 ￥${item.price}`,
      },
      {
        label: '在主人授权清单内',
        ok: inList,
        detail: `清单：[${(auth.allowedItems || []).join(', ')}]`,
      },
      {
        label: `不超过授权额度 ￥${auth.budgetLimit}`,
        ok: withinLimit,
        detail: `应付 ￥${amount}`,
      },
      {
        label: '主人已授予下单权限',
        ok: granted,
        detail: granted ? `令牌 ${auth.token}` : '未授予下单权限',
      },
      { label: '库存充足', ok: stockOk, detail: `库存 ${item.stock} 件` },
      { label: '未超出本次任务范围', ok: inScope, detail: `任务指定：${target || '—'}` },
    ];

    let stage;
    if (!hardOk) stage = PURCHASE_STAGES.OVER_BUDGET; // 硬性预算都不满足 → 不作推荐
    else if (!granted || !inList || !withinLimit || !stockOk) stage = PURCHASE_STAGES.REJECTED;
    else stage = PURCHASE_STAGES.APPROVED;

    this.purchase = { item, qty, amount, hardOk, stage, checks, order: null };
    return this.purchase;
  }

  // 提交审批：只有硬性预算通过才进入待审批，否则停在超出预算
  submitForApproval() {
    if (!this.purchase) return null;
    if (this.purchase.stage === PURCHASE_STAGES.OVER_BUDGET) return this.purchase;
    this.purchase.stage = PURCHASE_STAGES.PENDING;
    return this.purchase;
  }

  // 审批结果：授权满足则已批准，否则未批准（不进入下单）
  decideApproval() {
    if (!this.purchase) return null;
    const p = this.purchase;
    if (p.hardOk) {
      const auth = this.preferences.authorization || {};
      const inList = (auth.allowedItems || []).includes(p.item.id);
      const withinLimit = p.amount <= (auth.budgetLimit != null ? auth.budgetLimit : 0);
      const stockOk = (p.item.stock || 0) >= p.qty;
      p.stage =
        auth.allowPurchase === true && inList && withinLimit && stockOk
          ? PURCHASE_STAGES.APPROVED
          : PURCHASE_STAGES.REJECTED;
    }
    return p;
  }

  // 执行下单：仅“已批准”才能进入模拟完成
  completePurchase() {
    if (!this.purchase) return null;
    if (this.purchase.stage !== PURCHASE_STAGES.APPROVED) return this.purchase;
    const order = this.placeOrder(this.purchase.item, this.purchase.qty);
    this.purchase.order = order;
    this.purchase.stage = PURCHASE_STAGES.COMPLETED;
    this.order = order;
    return this.purchase;
  }

  placeOrder(item, qty = 1) {
    orderCounter += 1;
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
      d.getDate()
    ).padStart(2, '0')}`;
    this.order = {
      orderId: `ORD-${stamp}-${String(orderCounter).padStart(3, '0')}`,
      itemId: item.id,
      name: item.name,
      storeId: item.storeId,
      qty,
      amount: item.price * qty,
      status: 'CONFIRMED',
      simulated: true,
    };
    this.comparisonDone = true;
    return this.order;
  }

  finishTask(summary) {
    if (this.currentTask) {
      this.completedTasks.push({
        taskId: this.currentTask.id,
        type: this.currentTask.type,
        name: this.currentTask.name,
        summary,
      });
    }
  }

  // 主人反馈：更新本地偏好（会真正参与下一次评分）
  applyOwnerFeedback() {
    const fb = SCENARIO.ownerFeedback;
    if (!fb || !fb.applyToPreferences) return;
    const { extraPriority, note } = fb.applyToPreferences;
    if (Array.isArray(extraPriority)) {
      for (const p of extraPriority) {
        if (!this.preferences.extraPriority.includes(p)) {
          this.preferences.extraPriority.push(p);
        }
      }
    }
    this.preferences.lastFeedbackNote = note;
    this.feedbackApplied = true;
  }

  // 主人在界面上调整预算/优先条件后，立即重新计算排名
  recomputeRanking(products) {
    const compareTask =
      SCENARIO.tasks.find((t) => t.type === TASK_TYPES.COMPARE) || SCENARIO.tasks[0];
    const prefs = buildPreferences(compareTask, this.preferences);
    const ranking = rankProducts(products, prefs);
    this.ranking = ranking;
    this.recommendation = ranking.find((r) => !r.excluded) || ranking[0] || null;
    return ranking;
  }

  // 反馈后重新计算比价结果，返回反馈前后的对比
  recomputeAfterFeedback(products) {
    const compareTask =
      SCENARIO.tasks.find((t) => t.type === TASK_TYPES.COMPARE) || SCENARIO.tasks[0];
    const prefs = buildPreferences(compareTask, this.preferences);
    const ranking = rankProducts(products, prefs);
    const top = ranking.find((r) => !r.excluded) || ranking[0];

    const after = {
      recId: top.product.id,
      recName: top.product.name,
      score: top.score,
      scores: ranking.map((r) => ({ id: r.product.id, name: r.product.name, score: r.score })),
    };

    const before = this.compareSnapshot;
    const changed = !!(before && before.recId !== after.recId);

    // 名次变化
    let movements = [];
    if (before) {
      const beforeRank = new Map(before.scores.map((s, i) => [s.id, i + 1]));
      movements = after.scores
        .map((s, i) => {
          const b = beforeRank.get(s.id);
          return { name: s.name, from: b || null, to: i + 1 };
        })
        .filter((m) => m.from !== null && m.from !== m.to)
        .slice(0, 3);
    }

    return { before, after, changed, movements };
  }
}
