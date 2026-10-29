// data/scenarios.js
// 主人（大卫老师）的身份、偏好与授权。结构化保存，可在本文件直接修改。
// 数字分身在运行中会读取这里的条件进行筛选、评分与下单校验；
// 主人在汇报后的“反馈”也会回写到 preferences（见 src/agent.js）。

import { TASKS } from './tasks.js';

// 默认授权：只有满足这些条件，数字分身才会执行「下单」动作（模拟交易，非真实支付）
const DEFAULT_AUTHORIZATION = {
  allowPurchase: true, // 主人是否授予下单权限
  budgetLimit: 150, // 单次授权额度（元）
  allowedItems: ['s1p1'], // 授权清单：只允许买这些商品
  token: 'AUTH-7F3A2C', // 授权令牌（演示用）
  note: '仅限模拟交易，不涉及真实支付',
};

export const SCENARIO = {
  // 主人身份
  master: {
    name: '大卫老师',
    role: '数字分身的主人',
    // 微信风格对话里显示的头像文字
    avatarText: '大',
    avatarColor: '#5b8def',
  },

  // 数字分身身份
  avatar: {
    name: '小星',
    color: '#7cf6ff',
    avatarText: '星',
    identity: '大卫老师的个人AI数字分身',
    home: '主人电脑',
    // 机器间通信使用的智能体地址
    agentId: 'agent://xiaoxing',
  },

  // 主人下达的多类任务（按顺序轮换执行）
  tasks: TASKS,

  // 主人偏好（可被数字分身在汇报后根据反馈更新，也可在界面上直接调整）
  preferences: {
    budget: 100, // 硬性预算上限（参与评分与推荐，可在界面调整）
    requireProgrammable: true, // 优先条件：需要可编程
    requireReusable: true, // 优先条件：需要可重复使用
    interestsText: '机器人、编程、动手创造',
    priorityText: '适合初学者、可重复使用',
    excludeText: '一次性玩具',
    permissionText: '仅调查与推荐',
    // 主人反馈追加的“下一次优先条件”（初始为空，演示末尾由反馈填入）
    extraPriority: [],
    // 运行时授权（可在界面调整；初始值复制自 DEFAULT_AUTHORIZATION）
    authorization: JSON.parse(JSON.stringify(DEFAULT_AUTHORIZATION)),
  },

  // 购买授权默认值：只有满足这些条件，数字分身才会执行「下单」动作（模拟交易）
  authorization: JSON.parse(JSON.stringify(DEFAULT_AUTHORIZATION)),

  // 演示末尾主人给出的“预设反馈”（用于展示主人如何影响数字分身后续行为）
  ownerFeedback: {
    message: '很好，这次我更看重能够自己动手组装。',
    applyToPreferences: {
      extraPriority: ['动手组装'],
      note: '把“动手组装”作为下一次探索的优先条件',
    },
  },
};

// 人类可读的兴趣标签（用于界面展示与报告生成）
export const INTEREST_LABELS = {
  robot: '机器人',
  programming: '编程',
  'hands-on': '动手创造',
};

// 人类可读的优先条件标签
export const PRIORITY_LABELS = {
  beginner: '适合初学者',
  reusable: '可重复使用',
  'hands-on-assembly': '动手组装',
};
