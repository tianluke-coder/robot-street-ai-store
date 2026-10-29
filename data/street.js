// data/street.js
// 坂田机器人街区（线下实体世界）的布局与体验点位。
// 说明：街区真实场所名称（A—G 盒子建筑、各门店）取自公开资料，仅作场景还原；
// 门店提供的「面向人」的体验项目与「面向 AI」的商品信息均为演示数据，不声称来自商家。
// 坐标基于 viewBox 0 0 900 560，不随意修改已校准的相对位置。

// 入口（人类顾客与 AI 世界之外的真实街区入口）
export const STREET_ENTRANCE = { x: 450, y: 530 };

// 机器人大街主干道（人类顾客沿此行走）
export const STREET_ROAD = { x1: 450, y1: 520, x2: 450, y2: 90 };

// 实体点位。onlineStoreId 为 null 表示该点位没有对应的线上商品商店。
// humanServices：面向人类顾客的线下体验项目（实体展示 / 亲身体验 / 人工咨询 / 培训 / 演出 / 售后）。
// aiInfo：同一商户可供 AI 数字分身读取的结构化信息（机器可读目录 / 规格 / 价格 / 服务规则 / 预约）。
export const STREET_PLACES = [
  {
    id: 'p-robot6s',
    name: '机器人6S店',
    kind: 'store',
    onlineStoreId: 'store-robot',
    x: 200, y: 120, w: 170, h: 110,
    accent: '#38e1ff',
    humanServices: [
      '实体机器人展示与试操作',
      '现场拼装演示（创客工坊）',
      '店员讲解选购与售后',
      '亲子拼装体验课',
    ],
    aiInfo: {
      summary: '机器可读商品目录：创客套件 / 成品 / 视觉模块',
      fields: ['型号', '价格', '可编程', '库存', '租赁条件'],
      endpoint: 'robot-maker.agent',
    },
  },
  {
    id: 'p-ai6s',
    name: '人工智能6S店',
    kind: 'store',
    onlineStoreId: 'store-digital',
    x: 700, y: 120, w: 170, h: 110,
    accent: '#b98bff',
    humanServices: [
      'AI 创作套件现场试玩',
      '图形化编程拖拽体验',
      '学员作品展示墙',
      '免费入门讲座',
    ],
    aiInfo: {
      summary: '机器可读商品目录：电子套件 / 数字教程 / 编程主板',
      fields: ['型号', '价格', '可编程', '库存', '课程预约'],
      endpoint: 'digital-lab.agent',
    },
  },
  {
    id: 'p-theater',
    name: '机器人剧场',
    kind: 'amenity',
    onlineStoreId: '__theater__',
    x: 450, y: 250, w: 180, h: 110,
    accent: '#ffcf5c',
    humanServices: [
      '机器人剧目现场演出',
      '人机互动体验区',
      '亲子科技活动',
      '月度新节目首演',
    ],
    aiInfo: {
      summary: '机器可读演出与预约信息（模拟）',
      fields: ['节目名', '场次', '票价', '预约位', '适龄'],
      endpoint: 'theater.agent',
      programs: [
        { name: '小星历险记', date: '2026-11-02', seats: 40, age: '6+' },
        { name: '机器人与朋友', date: '2026-11-09', seats: 40, age: '4+' },
      ],
    },
  },
  {
    id: 'p-care',
    name: '智慧康养Hub',
    kind: 'store',
    onlineStoreId: 'store-life',
    x: 200, y: 330, w: 170, h: 110,
    accent: '#4dffa6',
    humanServices: [
      '康养设备现场体验',
      '健康数据检测咨询',
      '适老化智能方案讲解',
    ],
    aiInfo: {
      summary: '机器可读商品目录：传感套件 / 环境夜灯',
      fields: ['型号', '价格', '传感能力', '库存'],
      endpoint: 'smart-life.agent',
    },
  },
  {
    id: 'p-meidi',
    name: '美的全屋智能',
    kind: 'store',
    onlineStoreId: 'store-life',
    x: 450, y: 400, w: 170, h: 110,
    accent: '#4dffa6',
    humanServices: [
      '全屋智能样板间参观',
      '场景联动现场演示',
      '免费上门方案设计咨询',
    ],
    aiInfo: {
      summary: '机器可读商品目录：智能家居设备',
      fields: ['型号', '价格', '联动能力', '库存'],
      endpoint: 'smart-life.agent',
    },
  },
  {
    id: 'p-harmony',
    name: '鸿蒙未来之家',
    kind: 'store',
    onlineStoreId: 'store-life',
    x: 700, y: 330, w: 170, h: 110,
    accent: '#4dffa6',
    humanServices: [
      '鸿蒙生态设备体验',
      '跨设备联动演示',
      '开发者沙龙',
    ],
    aiInfo: {
      summary: '机器可读商品目录：鸿蒙智能设备',
      fields: ['型号', '价格', '生态能力', '库存'],
      endpoint: 'smart-life.agent',
    },
  },
  {
    id: 'p-fada',
    name: '法大夫',
    kind: 'amenity',
    onlineStoreId: null,
    x: 700, y: 470, w: 150, h: 90,
    accent: '#9fb0d4',
    humanServices: [
      '健康检测体验',
      '在线问诊演示',
      '科普讲座',
    ],
    aiInfo: null,
  },
];

// A—G 盒子建筑（街区风景，无线上映射）
export const STREET_BOXES = [
  { id: 'A', name: 'A 盒子', x: 60, y: 90, w: 90, h: 70 },
  { id: 'B', name: 'B 盒子', x: 60, y: 200, w: 90, h: 70 },
  { id: 'C', name: 'C 盒子', x: 60, y: 310, w: 90, h: 70 },
  { id: 'D', name: 'D 盒子', x: 60, y: 420, w: 90, h: 70 },
  { id: 'E', name: 'E 盒子', x: 820, y: 90, w: 90, h: 70 },
  { id: 'F', name: 'F 盒子', x: 820, y: 200, w: 90, h: 70 },
  { id: 'G', name: 'G 盒子', x: 820, y: 310, w: 90, h: 70 },
];

export function getPlaceById(id) {
  return STREET_PLACES.find((p) => p.id === id) || null;
}

// 返回某实体点位对应的线上商店（用于「未来商店观察」与双世界关联）
export function getOnlineStoreForPlace(place) {
  if (!place || !place.onlineStoreId || place.onlineStoreId === '__theater__') return null;
  return place.onlineStoreId;
}
