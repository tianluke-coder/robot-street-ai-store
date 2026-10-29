// src/protocol.js
// 机器之间的通信协议（A2A：Agent-to-Agent）。
// 数字分身「小星」与店铺智能体之间不使用自然语言，而是交换 JSON 报文。
// 面板上展示的是原始报文（给观众看“机器在说什么”），
// 同时世界里的商品卡片是把同一份数据渲染成人类可读的可视化（给主人看）。

import { SCENARIO } from '../data/scenarios.js';
import { getArch, STORE_ENDPOINTS } from '../data/architecture.js';

export const PROTOCOL_NAME = 'A2A/1.0';

let seq = 0;
function nextSeq() {
  seq += 1;
  return seq;
}

// 店铺智能体的地址
export function storeAgentAddress(store) {
  return `agent://${store.id}/${store.agent.name.replace(/\s/g, '')}`;
}

export function selfAddress() {
  return SCENARIO.avatar.agentId;
}

// ---------- 请求报文 ----------

// 服务发现（仅平台模式）：向平台网关询问有哪些商店
export function buildDiscoverStoresQuery(gateway, task) {
  return {
    protocol: PROTOCOL_NAME,
    seq: nextSeq(),
    from: selfAddress(),
    to: gateway.id,
    intent: 'DISCOVER_STORES',
    task: { id: task.id, type: task.type },
    query: { category: 'creation-tools', limit: 10 },
    want: ['id', 'name', 'agentId', 'caps'],
  };
}

// 平台网关返回商店目录（仅平台模式）
export function buildStoreDirectoryResult(gateway, stores) {
  return {
    protocol: PROTOCOL_NAME,
    seq: nextSeq(),
    from: gateway.id,
    to: selfAddress(),
    intent: 'STORE_DIRECTORY',
    count: stores.length,
    platform: {
      name: gateway.name,
      protocolVersion: PROTOCOL_NAME,
      settlement: 'platform',
    },
    stores: stores.map((s) => ({
      id: s.id,
      name: s.name,
      agent: storeAgentAddress(s),
      caps: ['catalog', 'new-arrivals', 'order'],
    })),
  };
}

// 查询商品目录（比价任务）
export function buildCatalogQuery(store, task, mode = 'platform') {
  const arch = getArch(mode);
  const base = {
    protocol: PROTOCOL_NAME,
    seq: nextSeq(),
    from: selfAddress(),
    to: storeAgentAddress(store),
    intent: 'QUERY_CATALOG',
    task: { id: task.id, type: task.type },
  };
  if (arch.hasGateway) base.via = arch.gateway.id;
  base.constraints = {
    budget: task.constraints.budget,
    programmable: task.constraints.programmable,
    beginner: task.constraints.beginner,
    reusable: task.constraints.reusable,
    interests: task.constraints.interests,
  };
  base.fields = ['id', 'name', 'price', 'programmable', 'beginnerFriendly', 'reusable', 'stock'];
  return base;
}

// 查询新品（新品侦察任务）
export function buildNewArrivalsQuery(store, task, mode = 'platform') {
  const arch = getArch(mode);
  const base = {
    protocol: PROTOCOL_NAME,
    seq: nextSeq(),
    from: selfAddress(),
    to: storeAgentAddress(store),
    intent: 'QUERY_NEW_ARRIVALS',
    task: { id: task.id, type: task.type },
  };
  if (arch.hasGateway) base.via = arch.gateway.id;
  base.constraints = { isNew: true, minStock: task.constraints.minStock || 1 };
  base.fields = ['id', 'name', 'price', 'releaseDate', 'stock'];
  return base;
}

// 下单请求（授权购买任务）。两种模式的授权归属不同：
//   平台模式 —— 平台授权中心签发（PLATFORM_ISSUED），结算走平台
//   点对点   —— 数字分身本地自行校验（SELF_VERIFIED），结算点对点
export function buildOrderRequest(store, task, item, mode = 'platform', authOverride) {
  const arch = getArch(mode);
  // 修复（第二轮）：优先使用主人当前的授权设置（可在界面调整），
  // 而不是读取写死的全局常量。
  const auth = authOverride || SCENARIO.authorization;
  const qty = task.constraints.qty || 1;

  const authBlock = arch.hasGateway
    ? {
        mode: 'PLATFORM_ISSUED',
        issuer: arch.gateway.name,
        authorizedBy: SCENARIO.master.name,
        token: auth.token,
        budgetLimit: auth.budgetLimit,
        allowedItems: auth.allowedItems,
        settlement: 'platform',
      }
    : {
        mode: 'SELF_VERIFIED',
        issuer: selfAddress(),
        authorizedBy: SCENARIO.master.name,
        budgetLimit: auth.budgetLimit,
        allowedItems: auth.allowedItems,
        settlement: 'peer-to-peer',
      };

  const base = {
    protocol: PROTOCOL_NAME,
    seq: nextSeq(),
    from: selfAddress(),
    to: storeAgentAddress(store),
    intent: 'PLACE_ORDER',
    task: { id: task.id, type: task.type },
  };
  if (arch.hasGateway) base.via = arch.gateway.id;
  base.payload = {
    itemId: item.id,
    name: item.name,
    qty,
    unitPrice: item.price,
    amount: item.price * qty,
  };
  base.auth = authBlock;
  return base;
}

// ---------- 响应报文 ----------

export function buildCatalogResult(store, items) {
  return {
    protocol: PROTOCOL_NAME,
    seq: nextSeq(),
    from: storeAgentAddress(store),
    to: selfAddress(),
    intent: 'CATALOG_RESULT',
    store: store.id,
    count: items.length,
    items: items.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      programmable: p.programmable === 'NA' ? 'NA' : p.programmable,
      beginner: p.beginnerFriendly,
      reusable: p.reusable,
      stock: p.stock,
    })),
  };
}

export function buildNewArrivalsResult(store, items) {
  return {
    protocol: PROTOCOL_NAME,
    seq: nextSeq(),
    from: storeAgentAddress(store),
    to: selfAddress(),
    intent: 'NEW_ARRIVALS_RESULT',
    store: store.id,
    count: items.length,
    items: items.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      releaseDate: p.releaseDate,
      stock: p.stock,
    })),
  };
}

// 下单结果：accepted 为 true 时带订单信息，否则带拒绝原因
export function buildOrderResult(store, order, accepted, reason, mode = 'platform') {
  const arch = getArch(mode);
  const base = {
    protocol: PROTOCOL_NAME,
    seq: nextSeq(),
    from: storeAgentAddress(store),
    to: selfAddress(),
    intent: accepted ? 'ORDER_ACCEPTED' : 'ORDER_REJECTED',
    store: store.id,
  };
  if (accepted) {
    return {
      ...base,
      order: {
        orderId: order.orderId,
        itemId: order.itemId,
        name: order.name,
        qty: order.qty,
        amount: order.amount,
        status: 'CONFIRMED',
        simulated: true,
      },
      settlementBy: arch.authOwner,
    };
  }
  return { ...base, reason, settlementBy: arch.authOwner };
}

// 商店在“点对点”模式下对外暴露的端点地址
export function storeEndpoint(store) {
  return STORE_ENDPOINTS[store.id] || `${store.id}.agent`;
}

// ---------- 展示用格式化 ----------

// 紧凑 JSON：数组元素保持单行，避免面板被撑得太长
export function formatJson(obj) {
  return compactStringify(obj, 2);
}

function compactStringify(value, indent) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((v) => pad + '  ' + inline(v));
    return '[\n' + items.join(',\n') + '\n' + pad + ']';
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const lines = keys.map((k) => {
      const v = value[k];
      const rendered =
        v && typeof v === 'object' && !Array.isArray(v)
          ? compactStringify(v, indent + 2)
          : Array.isArray(v)
          ? compactStringify(v, indent + 2)
          : inline(v);
      return pad + '  ' + '"' + k + '": ' + rendered;
    });
    return '{\n' + lines.join(',\n') + '\n' + pad + '}';
  }
  return inline(value);
}

function inline(v) {
  return JSON.stringify(v);
}

// 简单语法高亮（返回 HTML 字符串）
export function highlightJson(json) {
  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc(json)
    .replace(/&quot;([^&]*?)&quot;(\s*:)/g, '<span class="j-key">&quot;$1&quot;</span>$2')
    .replace(/:\s*&quot;([^&]*?)&quot;/g, ': <span class="j-str">&quot;$1&quot;</span>')
    .replace(/:\s*(-?\d+(?:\.\d+)?)/g, ': <span class="j-num">$1</span>')
    .replace(/:\s*(true|false|null)/g, ': <span class="j-bool">$1</span>');
}
