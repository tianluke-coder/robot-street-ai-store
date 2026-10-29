// src/scoring.js
// 商品匹配度计算（可解释、规则驱动，不使用随机或大模型）。
// 所有评分权重集中在 SCORING_CONFIG，便于未来调整或替换为真实智能体打分。

import { SCENARIO, INTEREST_LABELS } from '../data/scenarios.js';

// 线下实物体验反馈：主人把人类顾客在现场发现的问题反馈给小星后，
// 小星对这些商品的“实物体验分”做临时调整（运行时状态，可重置，不修改原始商品数据）。
const experienceAdjustments = {};

export function setExperienceAdjust(productId, delta) {
  experienceAdjustments[productId] = (experienceAdjustments[productId] || 0) + delta;
}
export function getExperienceAdjust(productId) {
  return experienceAdjustments[productId] || 0;
}
export function resetExperienceAdjust() {
  for (const k in experienceAdjustments) delete experienceAdjustments[k];
}

// 评分权重（集中配置）
export const SCORING_CONFIG = {
  weights: {
    withinBudget: 40, // 符合预算
    overBudgetPenalty: 50, // 超出预算（明显扣分）
    programmable: 30, // 支持编程
    beginner: 15, // 适合初学者
    reusable: 15, // 可重复使用
    assembly: 22, // 满足“动手组装”（主人反馈后新增的优先条件）
    interest: {
      robot: 25, // 命中“机器人”主要兴趣
      programming: 18, // 命中“编程”
      'hands-on': 18, // 命中“动手创造”
    },
    oneTimeToyPenalty: 1000, // 一次性玩具（排除项，直接判负）
  },
};

// 派生筛选偏好。
// 修复（第二轮）：必须接收“当前任务”与“主人当前偏好”，
// 否则无论任务是什么、主人把预算改成多少，评分都只会用写死的默认值。
//   task  —— 当前正在执行的任务（提供 interests 等目标条件）
//   prefs —— 主人当前偏好（提供 budget 等可调条件）
export function buildPreferences(task, prefs) {
  const t = task || SCENARIO.tasks.find((x) => x.type === 'compare') || SCENARIO.tasks[0];
  const c = (t && t.constraints) || {};
  const p = prefs || SCENARIO.preferences;

  // 预算：优先取主人当前偏好中的预算（可在界面调整），否则回落任务约束
  let budget = 100;
  if (p && p.budget != null) budget = p.budget;
  else if (c.budget != null) budget = c.budget;

  const extra = (p && p.extraPriority) || [];
  const priority = (c.beginner ? ['beginner'] : []).concat(c.reusable ? ['reusable'] : []);
  if (extra.includes('动手组装')) priority.push('hands-on-assembly');

  return {
    budget,
    interests: (c.interests || ['robot', 'programming', 'hands-on']).slice(),
    priority,
    exclude: c.excludeOneTime ? ['one-time'] : [],
    // 主人反馈追加的优先条件会真正参与计算
    requireAssembly: extra.includes('动手组装'),
    requireProgrammable: !!c.programmable,
  };
}

// 判断某商品是否应进入“候选清单”
export function isCandidate(product, prefs = buildPreferences()) {
  if (product.oneTimeToy) return false;
  if (!product.beginnerFriendly) return false;
  const inBudget = product.price <= prefs.budget;
  const programmable = product.programmable === true;
  const hitsInterest = (product.interests || []).some((t) => prefs.interests.includes(t));
  return inBudget || programmable || hitsInterest;
}

// 对单件商品打分，返回分数、是否排除、命中/未命中原因（可解释）
export function scoreProduct(product, prefs = buildPreferences()) {
  const w = SCORING_CONFIG.weights;
  let score = 0;
  const matched = [];
  const unmatched = [];

  if (product.oneTimeToy) {
    score -= w.oneTimeToyPenalty;
    unmatched.push('属于一次性玩具（排除项）');
    return { productId: product.id, score, excluded: true, matched, unmatched };
  }

  // 预算
  if (product.price <= prefs.budget) {
    score += w.withinBudget;
    matched.push(`预算内（${product.price}${product.currency} ≤ ${prefs.budget}${product.currency}）`);
  } else {
    score -= w.overBudgetPenalty;
    unmatched.push(`超出预算（${product.price}${product.currency} > ${prefs.budget}${product.currency}）`);
  }

  // 可编程
  if (product.programmable === true) {
    score += w.programmable;
    matched.push('支持编程');
  } else if (product.programmable === 'NA') {
    unmatched.push('可编程：不适用');
  } else {
    unmatched.push('不可编程');
  }

  // 适合初学者
  if (product.beginnerFriendly) {
    score += w.beginner;
    matched.push('适合初学者');
  } else {
    unmatched.push('不适合初学者');
  }

  // 可重复使用
  if (product.reusable) {
    score += w.reusable;
    matched.push('可重复使用');
  } else {
    unmatched.push('不可重复使用');
  }

  // 主要兴趣命中
  let hitCount = 0;
  for (const tag of prefs.interests) {
    if ((product.interests || []).includes(tag)) {
      score += w.interest[tag] || 0;
      matched.push(`命中兴趣：${INTEREST_LABELS[tag] || tag}`);
      hitCount++;
    }
  }
  if (hitCount === 0) {
    unmatched.push('未命中主要兴趣（机器人 / 编程 / 动手创造）');
  }

  // 主人反馈新增的优先条件：动手组装（真实参与计算）
  if (prefs.requireAssembly) {
    if (product.assembly === true) {
      score += w.assembly;
      matched.push('满足你新增的优先条件：动手组装');
    } else {
      unmatched.push('不满足你新增的优先条件：动手组装');
    }
  }

  // 线下实物体验反馈：人类顾客现场发现的操作问题会折算成体验分，参与排序
  const adj = getExperienceAdjust(product.id);
  if (adj !== 0) {
    score += adj;
    if (adj < 0) unmatched.push(`线下体验反馈：实物操作困难（体验分 ${adj}）`);
    else matched.push(`线下体验反馈：实物体验佳（体验分 +${adj}）`);
  }

  return { productId: product.id, score, excluded: false, matched, unmatched };
}

// 对所有商品打分并排序（降序）
export function rankProducts(products, prefs = buildPreferences()) {
  return products
    .map((p) => ({ product: p, ...scoreProduct(p, prefs) }))
    .sort((a, b) => b.score - a.score);
}
