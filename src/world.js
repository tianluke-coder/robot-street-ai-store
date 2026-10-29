// src/world.js
// 商业世界布局与数字分身移动（SVG 绘制，无外部图片）。
// 只负责“画面”，不负责业务规则（规则在 scoring/agent，对话在 dialogue，面板在 ui）。

import { STORES } from '../data/stores.js';
import { getProductsByStore } from '../data/products.js';
import { TASKS } from '../data/tasks.js';
import { getArch } from '../data/architecture.js';
import { storeEndpoint } from './protocol.js';
import { clock } from './clock.js';

const SVGNS = 'http://www.w3.org/2000/svg';

function s(tag, attrs = {}, children = []) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) {
    if (k === 'text') e.textContent = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  for (const c of [].concat(children)) {
    if (c) e.appendChild(c);
  }
  return e;
}

// 世界坐标布局（viewBox 1300 x 620）
const LAYOUT = {
  master: {
    monitor: { x: 70, y: 184, w: 220, h: 176 },
    screen: { x: 82, y: 196, w: 196, h: 152 },
    figure: { x: 96, y: 392 },
  },
  channel: { x1: 290, y: 352, x2: 432, y2: 352 },
  portal: { x: 432, y: 352 },
  stores: {
    'store-robot': { x: 452, y: 62, w: 250, h: 258 },
    'store-digital': { x: 740, y: 62, w: 250, h: 258 },
    'store-life': { x: 1028, y: 62, w: 222, h: 258 },
  },
  avatar: {
    home: { x: 180, y: 272 },
    channel: { x: 360, y: 352 },
    doors: {
      'store-robot': { x: 577, y: 332 },
      'store-digital': { x: 865, y: 332 },
      'store-life': { x: 1139, y: 332 },
    },
  },
};

export class World {
  constructor(svgEl) {
    this.svg = svgEl;
    this.avatarPos = { ...LAYOUT.avatar.home };
    this.avatarEl = null;
    this.storeGroups = {};
    this.productCardEls = {};
    this.agentBubbles = {};
  }

  // ---------- 渲染全部静态世界 ----------
  // mode: 'platform'（统一平台入口） | 'p2p'（独立智能体商店）
  render(mode = 'platform') {
    this.mode = mode;
    this.arch = getArch(mode);
    this.svg.innerHTML = '';
    this.storeGroups = {};
    this.productCardEls = {};
    this.agentBubbles = {};

    this._renderDefs();
    this._renderMasterZone();
    this._renderChannel();
    if (this.arch.hasGateway) {
      this._renderMarketZone();
      this._renderGateway();
    }
    for (const store of STORES) {
      this._renderStore(store);
    }
    this._renderAvatar();
  }

  // 平台模式的“市场商户区”容器
  _renderMarketZone() {
    const g = s('g', { class: 'market-zone' });
    g.appendChild(
      s('rect', {
        x: 438,
        y: 30,
        width: 826,
        height: 310,
        rx: 22,
        fill: 'rgba(255,207,92,0.05)',
        stroke: '#ffcf5c',
        'stroke-width': 1.5,
        'stroke-dasharray': '7 5',
      })
    );
    g.appendChild(
      s('text', {
        x: 452,
        y: 50,
        fill: '#ffcf5c',
        'font-size': 11,
        'font-weight': '700',
        text: '▣ ' + (this.arch.gateway.zoneName || '智能体市场 · 商户区'),
      })
    );
    this.svg.appendChild(g);
  }

  // 平台网关节点（服务发现 / 路由 / 授权 / 结算）
  _renderGateway() {
    const g = s('g', { class: 'gateway-node' });
    const x = 336;
    const y = 140;
    const w = 100;
    const h = 100;
    g.appendChild(
      s('rect', {
        x,
        y,
        width: w,
        height: h,
        rx: 14,
        fill: 'rgba(255,207,92,0.12)',
        stroke: '#ffcf5c',
        'stroke-width': 2,
      })
    );
    g.appendChild(
      s('text', { x: x + w / 2, y: y + 22, 'text-anchor': 'middle', fill: '#ffcf5c', 'font-size': 10.5, 'font-weight': '700', text: '平台网关' })
    );
    // 网关图标：中心节点 + 三条连线
    g.appendChild(s('circle', { cx: x + w / 2, cy: y + 46, r: 9, fill: '#ffcf5c' }));
    g.appendChild(s('line', { x1: x + w / 2 - 22, y1: y + 40, x2: x + w / 2 - 10, y2: y + 45, stroke: '#ffcf5c', 'stroke-width': 1.5 }));
    g.appendChild(s('line', { x1: x + w / 2 + 22, y1: y + 40, x2: x + w / 2 + 10, y2: y + 45, stroke: '#ffcf5c', 'stroke-width': 1.5 }));
    g.appendChild(s('line', { x1: x + w / 2, y1: y + 55, x2: x + w / 2, y2: y + 64, stroke: '#ffcf5c', 'stroke-width': 1.5 }));
    g.appendChild(
      s('text', { x: x + w / 2, y: y + 78, 'text-anchor': 'middle', fill: '#c9b184', 'font-size': 8.5, text: '发现 · 路由' })
    );
    g.appendChild(
      s('text', { x: x + w / 2, y: y + 90, 'text-anchor': 'middle', fill: '#c9b184', 'font-size': 8.5, text: '授权 · 结算' })
    );
    this.svg.appendChild(g);
  }

  _renderDefs() {
    const defs = s('defs');
    // 屏幕渐变
    const g1 = s('linearGradient', { id: 'screenGrad', x1: '0', y1: '0', x2: '0', y2: '1' });
    g1.appendChild(s('stop', { offset: '0', 'stop-color': '#0a1733' }));
    g1.appendChild(s('stop', { offset: '1', 'stop-color': '#06101f' }));
    defs.appendChild(g1);
    // 商店面板渐变（模板，按颜色在 store 内联）
    this.svg.appendChild(defs);
  }

  _renderMasterZone() {
    const g = s('g', { class: 'master-zone' });
    const m = LAYOUT.master;

    // 桌面
    g.appendChild(
      s('rect', { x: 30, y: 430, width: 290, height: 14, rx: 6, fill: '#16203f', stroke: '#2a3a66' })
    );
    // 显示器外框
    g.appendChild(
      s('rect', {
        x: m.monitor.x,
        y: m.monitor.y,
        width: m.monitor.w,
        height: m.monitor.h,
        rx: 12,
        fill: '#0c1530',
        stroke: '#3a4f86',
        'stroke-width': 2,
      })
    );
    // 屏幕
    g.appendChild(
      s('rect', {
        x: m.screen.x,
        y: m.screen.y,
        width: m.screen.w,
        height: m.screen.h,
        rx: 8,
        fill: 'url(#screenGrad)',
        stroke: '#28406f',
      })
    );
    // 屏幕标题栏
    g.appendChild(
      s('rect', { x: m.screen.x, y: m.screen.y, width: m.screen.w, height: 18, rx: 8, fill: '#10204a' })
    );
    g.appendChild(s('circle', { cx: m.screen.x + 12, cy: m.screen.y + 9, r: 3, fill: '#ff7a7a' }));
    g.appendChild(s('circle', { cx: m.screen.x + 24, cy: m.screen.y + 9, r: 3, fill: '#ffcf5c' }));
    g.appendChild(s('circle', { cx: m.screen.x + 36, cy: m.screen.y + 9, r: 3, fill: '#4dffa6' }));
    g.appendChild(
      s('text', {
        x: m.screen.x + m.screen.w / 2,
        y: m.screen.y + 13,
        'text-anchor': 'middle',
        fill: '#7da0d8',
        'font-size': 9,
        text: '小星的栖息地',
      })
    );
    // 屏幕内的“家”标识
    g.appendChild(
      s('text', {
        x: m.screen.x + m.screen.w / 2,
        y: m.screen.y + m.screen.h - 16,
        'text-anchor': 'middle',
        fill: '#33507f',
        'font-size': 9,
        text: 'HOME',
      })
    );

    // 显示器支架
    g.appendChild(
      s('rect', { x: m.monitor.x + m.monitor.w / 2 - 8, y: m.monitor.y + m.monitor.h, width: 16, height: 16, fill: '#16203f' })
    );
    g.appendChild(
      s('rect', { x: m.monitor.x + 20, y: m.monitor.y + m.monitor.h + 30, width: m.monitor.w - 40, height: 8, rx: 4, fill: '#16203f' })
    );

    // 主人形象
    const fx = m.figure.x;
    const fy = m.figure.y;
    g.appendChild(s('circle', { cx: fx, cy: fy - 36, r: 17, fill: '#f2c9a0', stroke: '#caa07a', 'stroke-width': 1.5 })); // 头
    g.appendChild(s('path', { d: `M${fx - 17} ${fy - 30} q17 -16 34 0`, fill: 'none', stroke: '#5b3b22', 'stroke-width': 3 })); // 头发
    g.appendChild(s('rect', { x: fx - 22, y: fy - 22, width: 44, height: 46, rx: 14, fill: '#3a5bd0', stroke: '#27409c' })); // 身体
    g.appendChild(s('text', { x: fx, y: fy + 42, 'text-anchor': 'middle', fill: '#cdd9f5', 'font-size': 11, text: '大卫老师' }));

    // 任务板（主人电脑区显示任务与偏好）
    this._renderTaskBoard(g);

    this.svg.appendChild(g);
  }

  _renderTaskBoard(g) {
    const x = 18;
    const y = 470;
    const w = 300;
    const h = 130;
    g.appendChild(s('rect', { x, y, width: w, height: h, rx: 10, fill: 'rgba(16,26,54,0.85)', stroke: '#2a3a66' }));
    g.appendChild(
      s('text', { x: x + 12, y: y + 20, fill: '#7cf6ff', 'font-size': 11, 'font-weight': '700', text: '📋 主人任务板（轮换执行）' })
    );
    this.taskRows = [];
    TASKS.forEach((t, i) => {
      const cy = y + 44 + i * 26;
      const dot = s('circle', { cx: x + 16, cy: cy - 4, r: 4, fill: '#33507f' });
      const label = s('text', {
        x: x + 28,
        y: cy,
        fill: '#6d7fa8',
        'font-size': 10.5,
        text: `${i + 1}. ${t.name}`,
      });
      const perm = s('text', {
        x: x + w - 12,
        y: cy,
        'text-anchor': 'end',
        fill: '#33507f',
        'font-size': 9,
        text: t.type === 'purchase' ? '授权下单' : '仅调查',
      });
      g.appendChild(dot);
      g.appendChild(label);
      g.appendChild(perm);
      this.taskRows.push({ dot, label });
    });
  }

  // 高亮当前正在执行的任务
  setActiveTask(index) {
    if (!this.taskRows) return;
    this.taskRows.forEach((r, i) => {
      const on = i === index;
      r.dot.setAttribute('fill', on ? '#7cf6ff' : '#33507f');
      r.label.setAttribute('fill', on ? '#eaf2ff' : '#6d7fa8');
    });
  }

  _renderChannel() {
    const g = s('g', { class: 'channel' });
    const c = LAYOUT.channel;
    // 通道光晕底
    g.appendChild(
      s('path', {
        d: `M${c.x1} ${c.y} L${c.x2} ${c.y2}`,
        stroke: 'rgba(56,225,255,0.18)',
        'stroke-width': 16,
        fill: 'none',
        'stroke-linecap': 'round',
      })
    );
    // 流动虚线
    g.appendChild(
      s('path', {
        d: `M${c.x1} ${c.y} L${c.x2} ${c.y2}`,
        class: 'channel-line',
        stroke: '#38e1ff',
        'stroke-width': 3,
        fill: 'none',
      })
    );
    // 入口传送门
    const p = LAYOUT.portal;
    g.appendChild(s('circle', { cx: p.x, cy: p.y, r: 14, fill: 'none', stroke: '#38e1ff', 'stroke-width': 2 }));
    g.appendChild(s('circle', { cx: p.x, cy: p.y, r: 6, fill: '#38e1ff', opacity: 0.6 }));
    g.appendChild(
      s('text', { x: p.x, y: p.y + 32, 'text-anchor': 'middle', fill: '#7da0d8', 'font-size': 9, text: '数字通道' })
    );
    this.svg.appendChild(g);
  }

  _renderStore(store) {
    const L = LAYOUT.stores[store.id];
    const accent = store.accent;
    const g = s('g', { class: 'store-group dim', 'data-store': store.id });
    g.style.color = accent; // currentColor 用于 drop-shadow

    // 点对点模式：每家店是彼此独立的智能体端点（自治域虚线外框 + 端点地址）
    if (!this.arch.hasGateway) {
      g.appendChild(
        s('rect', {
          x: L.x - 10,
          y: L.y - 10,
          width: L.w + 20,
          height: L.h + 20,
          rx: 16,
          fill: 'none',
          stroke: accent,
          'stroke-width': 1.2,
          'stroke-dasharray': '5 4',
          opacity: 0.75,
        })
      );
      g.appendChild(
        s('text', {
          x: L.x,
          y: L.y - 16,
          fill: accent,
          'font-size': 9.5,
          text: '◆ ' + storeEndpoint(store) + ' · 独立端点',
        })
      );
    }

    // 店铺底板
    g.appendChild(
      s('rect', {
        class: 'store-body',
        x: L.x,
        y: L.y,
        width: L.w,
        height: L.h,
        rx: 14,
        fill: 'rgba(12,20,44,0.9)',
        stroke: accent,
        'stroke-width': 2,
      })
    );
    // 顶部招牌条
    g.appendChild(
      s('rect', { x: L.x, y: L.y, width: L.w, height: 34, rx: 14, fill: accent, opacity: 0.16 })
    );
    g.appendChild(s('rect', { x: L.x, y: L.y + 20, width: L.w, height: 14, fill: accent, opacity: 0.16 }));
    // 招牌图标
    this._renderStoreIcon(g, store.iconType, L.x + 22, L.y + 17, accent);
    // 店名
    g.appendChild(
      s('text', { x: L.x + 44, y: L.y + 22, fill: '#eaf2ff', 'font-size': 13, 'font-weight': '700', text: store.name })
    );
    // 标语
    g.appendChild(
      s('text', { x: L.x + 12, y: L.y + 50, fill: accent, 'font-size': 10, text: store.tagline })
    );

    // 店铺智能体气泡（默认隐藏）
    const bubble = this._renderAgentBubble(store, L);
    this.agentBubbles[store.id] = bubble;
    g.appendChild(bubble);

    // 商品卡片
    const products = getProductsByStore(store.id);
    const cardW = L.w - 28;
    const cardX = L.x + 14;
    const cardH = 58;
    const gap = 8;
    const startY = L.y + 60;
    products.forEach((p, i) => {
      const cy = startY + i * (cardH + gap);
      const card = this._renderProductCard(p, cardX, cy, cardW, cardH, accent);
      this.productCardEls[p.id] = card;
      g.appendChild(card);
    });

    this.storeGroups[store.id] = g;
    this.svg.appendChild(g);
  }

  _renderStoreIcon(g, type, cx, cy, accent) {
    if (type === 'robot') {
      g.appendChild(s('rect', { x: cx - 9, y: cy - 7, width: 18, height: 14, rx: 3, fill: accent }));
      g.appendChild(s('circle', { cx: cx - 4, cy: cy, r: 2, fill: '#04111f' }));
      g.appendChild(s('circle', { cx: cx + 4, cy: cy, r: 2, fill: '#04111f' }));
      g.appendChild(s('line', { x1: cx, y1: cy - 7, x2: cx, y2: cy - 13, stroke: accent, 'stroke-width': 1.5 }));
      g.appendChild(s('circle', { cx: cx, cy: cy - 14, r: 2, fill: accent }));
    } else if (type === 'digital') {
      g.appendChild(s('circle', { cx, cy, r: 9, fill: 'none', stroke: accent, 'stroke-width': 2 }));
      g.appendChild(s('path', { d: `M${cx - 4} ${cy + 1} l3 3 l5 -6`, fill: 'none', stroke: accent, 'stroke-width': 2 }));
    } else {
      // life: 灯泡
      g.appendChild(s('circle', { cx, cy: cy - 2, r: 8, fill: 'none', stroke: accent, 'stroke-width': 2 }));
      g.appendChild(s('rect', { x: cx - 3, y: cy + 5, width: 6, height: 5, rx: 1, fill: accent }));
    }
  }

  _renderAgentBubble(store, L) {
    const w = Math.min(L.w - 20, 240);
    const x = L.x + (L.w - w) / 2;
    const y = L.y - 46;
    const g = s('g', { class: 'agent-bubble', 'data-agent': store.id });
    g.appendChild(s('rect', { x, y, width: w, height: 40, rx: 10, fill: 'rgba(8,14,32,0.95)', stroke: store.accent, 'stroke-width': 1.5 }));
    g.appendChild(s('path', { d: `M${x + w / 2 - 6} ${y + 40} l6 8 l6 -8 z`, fill: 'rgba(8,14,32,0.95)', stroke: store.accent, 'stroke-width': 1.5 }));
    const t1 = s('text', { x: x + 10, y: y + 15, fill: store.accent, 'font-size': 9.5, 'font-weight': '700', text: store.agent.name });
    const t2 = s('text', { x: x + 10, y: y + 31, fill: '#dbe6ff', 'font-size': 10, text: store.agent.greeting });
    g.appendChild(t1);
    g.appendChild(t2);
    return g;
  }

  _renderProductCard(p, x, y, w, h, accent) {
    const g = s('g', { class: 'product-card', 'data-product': p.id });
    g.appendChild(s('rect', { x, y, width: w, height: h, rx: 10, fill: 'rgba(10,16,36,0.92)', stroke: '#2a3a66', 'stroke-width': 1.2 }));
    // 店招色条
    g.appendChild(s('rect', { x, y, width: 4, height: h, rx: 2, fill: accent }));
    // 新品徽章
    if (p.isNew) {
      g.appendChild(s('rect', { x: x + w - 38, y: y + 4, width: 30, height: 11, rx: 5, fill: '#ffcf5c' }));
      g.appendChild(
        s('text', { x: x + w - 23, y: y + 12.5, 'text-anchor': 'middle', fill: '#3a2a00', 'font-size': 8, 'font-weight': '700', text: 'NEW' })
      );
    }
    // 名称
    g.appendChild(s('text', { x: x + 14, y: y + 17, fill: '#eaf2ff', 'font-size': 11, 'font-weight': '700', text: p.name }));
    // 属性小标
    const attrs = [];
    attrs.push(p.programmable === true ? '可编程' : p.programmable === 'NA' ? '编程:N/A' : '不可编程');
    attrs.push(p.beginnerFriendly ? '初学' : '非初学');
    attrs.push(p.reusable ? '可复用' : '一次性');
    g.appendChild(s('text', { x: x + 14, y: y + 34, fill: '#9fb0d4', 'font-size': 9, text: attrs.join(' · ') }));
    // 价格
    const priceColor = p.price <= 100 ? '#4dffa6' : '#ffcf5c';
    g.appendChild(
      s('text', { x: x + w - 10, y: y + 34, 'text-anchor': 'end', fill: priceColor, 'font-size': 11.5, 'font-weight': '700', text: `¥${p.price}` })
    );
    // 特点（截断，避免与右下角标记重叠）
    const feat = p.features.length > 12 ? p.features.slice(0, 12) + '…' : p.features;
    g.appendChild(s('text', { x: x + 14, y: y + 50, fill: '#7da0d8', 'font-size': 8.5, text: '· ' + feat }));
    // 命中标记（进入候选/新品/下单目标后显示）
    const chk = s('g', { class: 'pc-check' });
    chk.appendChild(s('circle', { cx: x + w - 16, cy: y + 47, r: 8, fill: '#0c2a1c', stroke: '#4dffa6', 'stroke-width': 1.5 }));
    chk.appendChild(s('path', { d: `M${x + w - 20} ${y + 47} l3 3 l6 -7`, fill: 'none', stroke: '#4dffa6', 'stroke-width': 2 }));
    g.appendChild(chk);
    return g;
  }

  _renderAvatar() {
    const g = s('g', { class: 'avatar', id: 'avatar' });
    const inner = s('g', { class: 'avatar-bob' });
    // 光晕
    inner.appendChild(s('circle', { cx: 0, cy: 0, r: 22, fill: 'rgba(124,246,255,0.18)' }));
    // 身体
    inner.appendChild(s('circle', { cx: 0, cy: 0, r: 15, fill: '#7cf6ff', stroke: '#04111f', 'stroke-width': 2 }));
    // 天线 + 星
    inner.appendChild(s('line', { x1: 0, y1: -15, x2: 0, y2: -23, stroke: '#04111f', 'stroke-width': 1.5 }));
    inner.appendChild(s('path', { d: starPath(0, -26, 5, 2.3), fill: '#ffcf5c' }));
    // 眼睛
    inner.appendChild(s('circle', { cx: -5, cy: -2, r: 2.4, fill: '#04111f' }));
    inner.appendChild(s('circle', { cx: 5, cy: -2, r: 2.4, fill: '#04111f' }));
    // 微笑
    inner.appendChild(s('path', { d: 'M-5 4 q5 5 10 0', fill: 'none', stroke: '#04111f', 'stroke-width': 1.6 }));
    // 名牌
    inner.appendChild(s('text', { x: 0, y: 38, 'text-anchor': 'middle', fill: '#7cf6ff', 'font-size': 10, 'font-weight': '700', text: '小星' }));
    g.appendChild(inner);
    this.avatarEl = g;
    this.setAvatarPos(this.avatarPos.x, this.avatarPos.y);
    this.svg.appendChild(g);
  }

  setAvatarPos(x, y) {
    this.avatarPos = { x, y };
    if (this.avatarEl) this.avatarEl.setAttribute('transform', `translate(${x},${y})`);
  }

  // ---------- 动态操作 ----------

  // 高亮某商店（进入时）
  activateStore(storeId) {
    for (const id in this.storeGroups) {
      const g = this.storeGroups[id];
      if (id === storeId) {
        g.classList.remove('dim');
        g.classList.add('active');
      } else {
        g.classList.add('dim');
        g.classList.remove('active');
      }
    }
  }

  // 复位所有商店为高亮前的状态
  resetStores() {
    for (const id in this.storeGroups) {
      this.storeGroups[id].classList.add('dim');
      this.storeGroups[id].classList.remove('active');
    }
  }

  // 显示店铺智能体气泡
  showAgent(storeId, text) {
    const b = this.agentBubbles[storeId];
    if (!b) return;
    const t = b.querySelector('text:nth-child(3)');
    if (t) t.textContent = text || '';
    b.classList.add('show');
  }

  hideAgent(storeId) {
    const b = this.agentBubbles[storeId];
    if (b) b.classList.remove('show');
  }

  // 逐张显示商品卡片，并标记候选
  revealProduct(product, isMatch) {
    const card = this.productCardEls[product.id];
    if (!card) return;
    card.classList.add('show');
    if (isMatch) card.classList.add('matched');
  }

  hideAllProducts() {
    for (const id in this.productCardEls) {
      this.productCardEls[id].classList.remove('show', 'matched');
    }
  }

  resetAvatar() {
    this.setAvatarPos(LAYOUT.avatar.home.x, LAYOUT.avatar.home.y);
  }

  // 暂停感知的移动到指定坐标（duration 毫秒）
  moveAvatarTo(x, y, duration, isAborted) {
    return new Promise((resolve) => {
      const startX = this.avatarPos.x;
      const startY = this.avatarPos.y;
      let last = performance.now();
      let elapsed = 0;
      const tick = () => {
        if (isAborted && isAborted()) {
          resolve();
          return;
        }
        const now = performance.now();
        if (!clock.paused) elapsed += now - last;
        last = now;
        const t = Math.min(elapsed / duration, 1);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const cx = startX + (x - startX) * e;
        const cy = startY + (y - startY) * e;
        this.setAvatarPos(cx, cy);
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  // 暴露布局坐标给 main 使用
  get waypoints() {
    return {
      ...LAYOUT.avatar,
      portal: { ...LAYOUT.portal },
      gateway: { x: 386, y: 190 },
    };
  }
}

// 生成五角星路径
function starPath(cx, cy, outer, inner) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
  }
  return d + 'Z';
}
