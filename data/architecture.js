// data/architecture.js
// 商业世界的两种组织架构（第二轮迭代：正式命名）。可在界面上切换，用于对比演示。
//   platform —— 统一平台模式：所有商店通过一个共同的商业平台连接
//   p2p      —— 独立站点模式：每家商店拥有自己的目录、规则与独立入口
//
// 重要：这里描述的是“架构概念”，当前版本由本地程序与预设规则模拟，
// 不代表真实的网络通信、独立服务器或真实商店间交互。

export const ARCH_MODES = {
  PLATFORM: 'platform',
  P2P: 'p2p',
};

// 概念模拟的免责声明（界面必须展示）
export const DISCLAIMER =
  '架构概念模拟：当前使用本地程序和预设规则运行，图中路径不代表真实网络通信。';

// 两种模式的通俗对比（给普通观众看）
export const MODE_COMPARISON = [
  {
    question: '谁提供商店目录',
    platform: '平台统一提供一份商店目录',
    p2p: '每家商店各自提供自己的目录',
  },
  {
    question: '小星怎么拿到商品信息',
    platform: '先向平台要目录，再经平台访问各家商店',
    p2p: '一家一家直接访问，分别询问',
  },
  {
    question: '谁负责汇总商品数据',
    platform: '平台汇总后交给小星',
    p2p: '小星自己汇总、自己比较',
  },
  {
    question: '商店能自己维护商品和规则吗',
    platform: '通过平台维护，遵循统一规范',
    p2p: '完全独立维护，规则可以各不相同',
  },
];

// 哪些是真正跑的程序逻辑，哪些只是架构模拟
export const REALITY_SPLIT = {
  real: [
    '读取商品数据（本地数据文件中的真实字段）',
    '按评分规则计算匹配度（真实计算）',
    '预算与授权条件校验（真实判断）',
    '任务状态机推进与行动记录（真实运行）',
  ],
  simulated: [
    '商店与平台是本地数据，不是独立服务器',
    '图中的箭头与路径不代表真实网络通信',
    '没有真实下单、支付与结算',
    '商店智能体由预设话术模拟，不是真实智能体',
  ],
};

export const ARCH_CONFIG = {
  platform: {
    id: 'platform',
    // 正式名称
    name: '统一平台模式',
    short: '统一平台',
    displayName: '统一平台模式',
    description:
      '所有商店通过一个共同的商业平台连接。平台负责提供统一的商店目录和商品发现入口，并在演示中协调小星访问不同商店。',
    tagline: '商店是平台上的入驻商户',
    gateway: {
      id: 'agent://market-gateway',
      name: '未来商业平台',
      short: '平台',
      zoneName: '未来商业平台 · 商户区',
      caps: ['discovery', 'routing', 'auth', 'settlement'],
    },
    hasGateway: true,
    hasDiscovery: true,
    authOwner: '平台授权中心',
    routing: '经平台统一入口',
    merchantLabel: '入驻商户',
    summary: '平台统一提供目录与入口，小星经平台访问各家商店，由平台汇总数据。',
    // 路径描述（事件面板用）
    pathText: '小星 → 未来商业平台 → 机器人创客工坊 / 数字创作工坊 / 智能生活商店',
    diffs: [
      '进入世界先做服务发现（DISCOVER_STORES）',
      '业务请求经平台入口转发（via 字段）',
      '下单授权由平台授权中心校验',
      '商品数据由平台汇总后返回',
    ],
  },

  p2p: {
    id: 'p2p',
    // 正式名称
    name: '独立站点模式',
    short: '独立站点',
    displayName: '独立站点模式',
    description:
      '每家商店拥有自己的商品目录、服务规则和独立入口。小星分别访问不同商店，获取信息后自行汇总。',
    tagline: '每家店是彼此独立的站点',
    gateway: null,
    hasGateway: false,
    hasDiscovery: false,
    authOwner: '数字分身自行校验',
    routing: '分别直连每家商店',
    merchantLabel: '独立站点',
    summary: '每家商店各自维护目录与规则，小星分别访问后自己汇总比较。',
    pathText:
      '小星 → 机器人创客工坊；小星 → 数字创作工坊；小星 → 智能生活商店',
    diffs: [
      '没有统一目录，按主人给出的商店清单访问',
      '请求直接发往各家商店，不经平台',
      '下单授权由数字分身本地自行校验',
      '商品数据由小星自己汇总比较',
    ],
  },
};

export function getArch(mode) {
  return ARCH_CONFIG[mode] || ARCH_CONFIG.platform;
}

// 每家商店在“独立站点”模式下对外暴露的独立入口（演示用）
export const STORE_ENDPOINTS = {
  'store-robot': 'robot-maker.agent',
  'store-digital': 'digital-lab.agent',
  'store-life': 'smart-life.agent',
};
