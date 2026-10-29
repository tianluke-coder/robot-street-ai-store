// data/tasks.js
// 主人可以下达的多类任务。数字分身会按顺序轮换执行。
// 三类任务对应三种完全不同的可执行行为：
//   compare  —— 比价选型（只调查，评分推荐）
//   discover —— 新品侦察（只调查，列出新品清单）
//   purchase —— 授权购买（在主人授权额度内完成模拟下单）

export const TASK_TYPES = {
  COMPARE: 'compare',
  DISCOVER: 'discover',
  PURCHASE: 'purchase',
};

export const TASK_TYPE_LABELS = {
  compare: '比价选型',
  discover: '新品侦察',
  purchase: '授权购买',
};

export const TASKS = [
  {
    id: 'task-compare',
    type: TASK_TYPES.COMPARE,
    name: '比价选型',
    short: '比价',
    ownerRequest:
      '帮我寻找适合初学者的机器人创作工具。预算不超过100元。优先考虑可编程、能够重复使用、适合动手创造的产品。请比较不同商店的商品，最后向我推荐最合适的选择，并说明理由。',
    goal: '比较三家商店的商品，按匹配度选出最合适的一件并说明理由',
    constraints: {
      budget: 100,
      programmable: true,
      beginner: true,
      reusable: true,
      excludeOneTime: true,
      interests: ['robot', 'programming', 'hands-on'],
    },
    permission: '仅调查与推荐，不真实下单',
    stores: ['store-robot', 'store-digital', 'store-life'],
  },
  {
    id: 'task-discover',
    type: TASK_TYPES.DISCOVER,
    name: '新品侦察',
    short: '看新品',
    ownerRequest:
      '帮我看看这几家店最近有什么新品上架，列出新品清单、价格和主要特点，先不要买。',
    goal: '收集三家商店的新上架商品，整理成新品清单',
    constraints: {
      onlyNew: true,
      minStock: 1,
    },
    permission: '仅调查，不购买',
    stores: ['store-robot', 'store-digital', 'store-life'],
  },
  {
    id: 'task-purchase',
    type: TASK_TYPES.PURCHASE,
    name: '授权购买',
    short: '下单',
    ownerRequest:
      '如果「入门可编程机器人套件」确实符合要求，就帮我买下来。授权额度150元，只买这一件，不要买别的。',
    goal: '在主人硬性预算与授权范围内完成模拟下单',
    constraints: {
      targetItemId: 's1p1',
      qty: 1,
      requiresAuth: true,
      // 注意：硬性预算取自 preferences.budget，授权额度取自 preferences.authorization，
      // 不再写死在任务里 —— 这样在界面上改预算或授权会真实影响结果。
    },
    permission: '已授权下单（模拟交易，非真实支付）',
    stores: ['store-robot'], // 只需到目标商品所在商店
  },
];

export function getTaskById(id) {
  return TASKS.find((t) => t.id === id) || null;
}
