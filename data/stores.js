// data/stores.js
// 三个商店及其店铺智能体（演示用模拟智能体）。
// 店铺智能体使用“预设话术”与数字分身交互，不调用任何大模型。
// 此文件只保存“内容数据”，世界布局（坐标）在 src/world.js。

export const STORES = [
  {
    id: 'store-robot',
    name: '机器人创客工坊',
    short: '创客工坊',
    accent: '#38e1ff', // 青色
    glyph: '🤖', // 仅作为内部标识，画面中由 SVG 绘制图标
    iconType: 'robot',
    tagline: '组装 · 编程 · 创造',
    agent: {
      name: '工坊向导 R1',
      greeting: '欢迎来到机器人创客工坊！我是这里的向导 R1。',
      question: '你在寻找什么类型的创作工具？',
      // 小星对店铺智能体的标准回答（由程序注入主人任务条件）
      introLead: '我为你调取了本店在售商品，下面是它们的关键信息：',
      farewell: '祝你创作顺利！有需要随时回来。',
    },
  },
  {
    id: 'store-digital',
    name: '数字创作工坊',
    short: '数字工坊',
    accent: '#b98bff', // 紫色
    glyph: '🎨',
    iconType: 'digital',
    tagline: '电子 · 设计 · 教程',
    agent: {
      name: '数字助手 D2',
      greeting: '你好，这里是数字创作工坊，我是数字助手 D2。',
      question: '今天想创作点什么？',
      introLead: '我把本店商品整理好了，你可以逐项查看：',
      farewell: '期待看到你的作品！',
    },
  },
  {
    id: 'store-life',
    name: '智能生活商店',
    short: '生活商店',
    accent: '#4dffa6', // 绿色
    glyph: '💡',
    iconType: 'life',
    tagline: '智能 · 传感 · 生活',
    agent: {
      name: '生活管家 L3',
      greeting: '欢迎光临智能生活商店，我是生活管家 L3。',
      question: '想为生活添点什么智能小物？',
      introLead: '这是本店与“动手创造”相关的几件商品：',
      farewell: '有需要再来逛逛～',
    },
  },
];

export function getStoreById(id) {
  return STORES.find((s) => s.id === id) || null;
}

// 数字分身对店铺智能体“提问”的标准应答模板。
// {} 占位符由程序运行时按主人任务条件填充。
export const AGENT_REPLY_TEMPLATE =
  '我在寻找预算 {budget} 元以内、适合初学者、并且可以编程的创作工具，最好能动手组装。';
