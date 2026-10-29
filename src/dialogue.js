// src/dialogue.js
// 主人与数字分身之间的聊天文案（微信风格呈现），全部由程序生成，不调用大模型。
// 汇报内容根据评分/授权结果动态拼接，不会写死为某个固定商品或订单。

import { SCENARIO, INTEREST_LABELS } from '../data/scenarios.js';
import { TASK_TYPES, TASK_TYPE_LABELS } from '../data/tasks.js';
import { getStoreById } from '../data/stores.js';
import { getProductById } from '../data/products.js';

// 任务开始前的播报（显示在聊天窗口）
export function buildTaskAnnounce(task, index, total) {
  return `【任务 ${index}/${total}】${TASK_TYPE_LABELS[task.type]}：${task.goal}`;
}

// 接受任务后的回应（按任务类型不同）
export function buildAcceptReply(task) {
  if (task.type === TASK_TYPES.COMPARE) {
    return '收到。我会去三家商店调查，按你的预算和条件比较商品，再回来推荐。';
  }
  if (task.type === TASK_TYPES.DISCOVER) {
    return '收到。我去看看各店最近上架的新品，把清单和价格整理给你，先不买。';
  }
  if (task.type === TASK_TYPES.PURCHASE) {
    return '收到。我会先核对你的授权额度和授权清单，确认无误后再下单。';
  }
  return '收到，我这就出发。';
}

// 比价任务的汇报
function buildCompareReport(agent) {
  const owner = SCENARIO.master.name;
  const ranking = agent.ranking || [];
  const rec = agent.recommendation;
  const msgs = [];

  msgs.push({
    role: 'star',
    type: 'text',
    text: `${owner}，我访问了 ${agent.visitedStores.length} 家商店，查看了 ${agent.discovered.length} 件模拟商品，其中 ${agent.candidates.length} 件进入候选。`,
  });

  if (rec) {
    const p = rec.product;
    const store = getStoreById(p.storeId);
    msgs.push({
      role: 'star',
      type: 'text',
      text: `我最推荐【${p.name}】（￥${p.price}，${store.short}）。`,
    });
    msgs.push({
      role: 'star',
      type: 'text',
      text: '推荐理由：' + rec.matched.join('；') + '。',
    });
  }

  const others = ranking
    .filter((r) => r.product.id !== (rec && rec.product.id))
    .slice(0, 3);
  if (others.length) {
    const summary = others.map((r) => {
      const gap = r.unmatched.length ? '，但' + r.unmatched[0] : '';
      return `${r.product.name}（￥${r.product.price}）${gap}`;
    });
    msgs.push({
      role: 'star',
      type: 'text',
      text: '其他候选对比：' + summary.join('；') + '。',
    });
  }

  const gaps = new Set();
  ranking
    .filter((r) => r.product.id !== (rec && rec.product.id))
    .forEach((r) => r.unmatched.forEach((u) => gaps.add(u)));
  msgs.push({
    role: 'star',
    type: 'text',
    text:
      gaps.size > 0
        ? '哪些条件没有完全满足：' + Array.from(gaps).join('；') + '。'
        : '推荐商品已满足你提出的全部主要条件（预算内、可编程、适合初学者、可重复使用、机器人创作方向）。',
  });

  const done = !!rec && rec.unmatched.length === 0;
  msgs.push({
    role: 'star',
    type: 'text',
    text: done
      ? '本次任务：已完成 ✅（已找到完全符合要求的商品并给出推荐，未下单）。'
      : '本次任务：已完成调查，部分候选存在条件缺口，已按匹配度排序推荐。',
  });
  return msgs;
}

// 新品侦察任务的汇报
function buildDiscoverReport(agent) {
  const owner = SCENARIO.master.name;
  const msgs = [];
  msgs.push({
    role: 'star',
    type: 'text',
    text: `${owner}，我逛了 ${agent.visitedStores.length} 家商店，找到 ${agent.newArrivals.length} 件新上架的商品。`,
  });
  for (const id of agent.newArrivals) {
    const p = getProductById(id);
    if (!p) continue;
    const store = getStoreById(p.storeId);
    msgs.push({
      role: 'star',
      type: 'text',
      text: `🆕 ${p.name}（￥${p.price}，${store.short}，${p.releaseDate} 上架）\n${p.features}；库存 ${p.stock} 件。`,
    });
  }
  msgs.push({
    role: 'star',
    type: 'text',
    text: '这些新品只做了记录，没有下单。需要我进一步比较或购买，请再给我一个任务。',
  });
  return msgs;
}

// 授权购买任务的汇报
function buildPurchaseReport(agent) {
  const owner = SCENARIO.master.name;
  const msgs = [];
  const check = agent.purchaseCheck;
  const order = agent.order;

  msgs.push({
    role: 'star',
    type: 'text',
    text: `${owner}，我在【${getStoreById((check && check.item.storeId) || 'store-robot').name}】找到了目标商品，并做了下单前的授权校验。`,
  });

  if (check) {
    const lines = check.checks
      .map((c) => `${c.ok ? '✔' : '✘'} ${c.label}（${c.detail}）`)
      .join('\n');
    msgs.push({
      role: 'star',
      type: 'text',
      text: check.ok
        ? '授权校验全部通过：\n' + lines
        : '授权校验未通过，已停止下单：\n' + lines,
    });
  }

  if (order) {
    // 微信风格的订单卡片
    msgs.push({
      role: 'star',
      type: 'order',
      order,
    });
    msgs.push({
      role: 'star',
      type: 'text',
      text: '已使用你的授权额度完成下单（模拟交易，不涉及真实支付）。',
    });
  } else {
    msgs.push({
      role: 'star',
      type: 'text',
      text: '本次任务：未完成 ❌（授权或库存条件不满足，未下单）。',
    });
  }
  return msgs;
}

// 按任务类型生成汇报消息
export function buildReport(agent, task) {
  if (task.type === TASK_TYPES.COMPARE) return buildCompareReport(agent);
  if (task.type === TASK_TYPES.DISCOVER) return buildDiscoverReport(agent);
  if (task.type === TASK_TYPES.PURCHASE) return buildPurchaseReport(agent);
  return [];
}

// 任务完成后主人的简短回应（预设，展示主人的反馈如何驱动下一个任务）
export function ownerTaskResponse(task) {
  if (task.type === TASK_TYPES.COMPARE) {
    return '不错，先记住这个推荐。';
  }
  if (task.type === TASK_TYPES.DISCOVER) {
    return '新品我看到了，先不买。';
  }
  if (task.type === TASK_TYPES.PURCHASE) {
    return '很好，订单我收到了。';
  }
  return '好的。';
}

// 演示末尾主人的预设反馈（更新偏好）
export function ownerFeedbackMessage() {
  return SCENARIO.ownerFeedback.message;
}

// 数字分身对反馈的回应
export function buildFeedbackAck(agent) {
  const extra = agent.preferences.extraPriority;
  if (extra.length) {
    return `明白。我会把“${extra.join('、')}”作为下一次探索的优先条件，并记住这次的偏好调整。`;
  }
  return '明白，我会把你的偏好纳入下一次探索。';
}

// 主人反馈后重新计算的结论文案（证明反馈真的进入了计算）
export function buildRecomputeMessage(res) {
  if (!res || !res.before) return '已记录你的偏好，下一次探索会优先考虑。';
  const b = res.before;
  const a = res.after;
  let msg;
  if (res.changed) {
    msg = `我按更新后的偏好重新算了，推荐从【${b.recName}】变为【${a.recName}】（${a.score} 分）。`;
  } else {
    msg = `我按更新后的偏好重新算了，推荐仍是【${a.recName}】，匹配分从 ${b.score} 提升到 ${a.score}（你新增的优先条件已计入计算）。`;
  }
  if (res.movements && res.movements.length) {
    msg +=
      '名次变化：' +
      res.movements.map((m) => `${m.name} 第 ${m.from} 名 → 第 ${m.to} 名`).join('；') +
      '。';
  }
  return msg;
}

// 全部任务完成后的总结
export function buildFinalSummary(agent) {
  const names = agent.completedTasks.map((t) => t.name).join('、');
  return `三个任务都跑完了：${names}。\n比价和看新品只做调查，只有第 3 个任务在你的授权下完成了模拟下单。`;
}
