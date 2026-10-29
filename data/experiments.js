// data/experiments.js
// 三个双世界实验任务（实验A 比价 / 实验B 发现新品 / 实验C 采购与体验决策）。
// 每个实验都围绕“同一项主人任务”展开：左侧人类顾客去线下实体店，
// 右侧 AI 数字分身小星去线上智能体商店，最后在主人决策界面汇合。

import { TASK_TYPES } from './tasks.js';

export const EXPERIMENTS = [
  {
    id: 'exp-compare',
    code: 'A',
    type: TASK_TYPES.COMPARE,
    title: '实验A · 商品比较',
    masterGoal: '购买适合儿童使用的智能玩具，预算 200 元。',
    detail:
      '线下顾客到实体店看实物、体验操作、咨询店员；线上小星查询各店目录、筛选预算内、比较功能/年龄/价格/服务，生成推荐清单。',
    budget: 200,
    humanPlaces: ['p-ai6s', 'p-robot6s'],
    starStores: ['store-robot', 'store-digital', 'store-life'],
    // 该实验不强制以购买收尾，仅做比较
    forcePurchase: false,
  },
  {
    id: 'exp-discover',
    code: 'B',
    type: TASK_TYPES.DISCOVER,
    title: '实验B · 发现新品',
    masterGoal: '了解坂田机器人街区最近有什么新产品或新活动。',
    detail:
      '线下顾客逛实体门店与机器人剧场，记录现场展示与活动；线上小星查各店新品与剧场预约信息，区分“目录已有新品”与“线下现场新发现”。',
    budget: 200,
    humanPlaces: ['p-theater', 'p-ai6s', 'p-robot6s'],
    starStores: ['store-robot', 'store-digital', 'store-life'],
    forcePurchase: false,
  },
  {
    id: 'exp-purchase',
    code: 'C',
    type: TASK_TYPES.PURCHASE,
    title: '实验C · 采购与体验决策',
    masterGoal: '购买一台适合家庭的桌面制造设备，或预约一次机器人体验服务。',
    detail:
      '线下顾客到实体场所观察设备、询问演示/培训/售后；线上小星比对规格价格服务、检查预算与授权，提交购买/预约建议。最后由主人审批。',
    budget: 200,
    humanPlaces: ['p-robot6s'],
    starStores: ['store-robot'],
    forcePurchase: true,
    // 采购目标（与现有商品一致）
    targetItemId: 's1p1',
    qty: 1,
    // 关键情节：小星推荐的商品，线下顾客现场发现“实物操作困难”，
    // 主人把反馈给小星后，小星重新计算，最终由主人决定购买/预约/继续调查/放弃。
    feedbackLoop: {
      // 被线下反馈打分的商品（小星首选）
      targetId: 's1p1',
      // 线下体验问题（人类顾客现场发现，非线上可获知）
      humanNote: '入门套件零件偏多，低龄儿童独立拼装较吃力，建议家长陪同。',
      // 折算成体验分（参与排序，负分降低排名）
      adjust: -28,
      // 反馈后小星可能改变推荐；主人最终决策不强制成功
      masterDecision: '继续调查',
    },
  },
];

export function getExperimentById(id) {
  return EXPERIMENTS.find((e) => e.id === id) || null;
}
