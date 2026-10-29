// src/world-street.js
// 线下坂田机器人街区（SVG 绘制，无外部图片）。只负责“画面”。
// 移动的是人类顾客（示意 2D 人物图标），不是小星的机器人具身。

import { STREET_PLACES, STREET_BOXES, STREET_ENTRANCE, STREET_ROAD } from '../data/street.js';
import { clock } from './clock.js';

const SVGNS = 'http://www.w3.org/2000/svg';

function s(tag, attrs = {}, children = []) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) {
    if (k === 'text') e.textContent = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  for (const c of [].concat(children)) if (c) e.appendChild(c);
  return e;
}

const LAYOUT = {
  entrance: STREET_ENTRANCE,
  home: { x: STREET_ENTRANCE.x, y: STREET_ENTRANCE.y - 10 },
};

export class StreetWorld {
  constructor(svgEl) {
    this.svg = svgEl;
    this.humanPos = { ...LAYOUT.home };
    this.humanEl = null;
    this.placeGroups = {};
  }

  render() {
    this.svg.innerHTML = '';
    this.placeGroups = {};
    this._renderDefs();
    this._renderGround();
    this._renderBoxes();
    for (const place of STREET_PLACES) this._renderPlace(place);
    this._renderEntrance();
    this._renderHuman();
  }

  _renderDefs() {
    const defs = s('defs');
    const g = s('linearGradient', { id: 'streetGrad', x1: '0', y1: '0', x2: '0', y2: '1' });
    g.appendChild(s('stop', { offset: '0', 'stop-color': '#1b1530' }));
    g.appendChild(s('stop', { offset: '1', 'stop-color': '#120e22' }));
    defs.appendChild(g);
    this.svg.appendChild(defs);
  }

  _renderGround() {
    const g = s('g', { class: 'street-ground' });
    g.appendChild(s('rect', { x: 0, y: 0, width: 900, height: 560, fill: 'url(#streetGrad)' }));
    // 机器人大街主干道
    g.appendChild(
      s('line', {
        x1: STREET_ROAD.x1, y1: STREET_ROAD.y1,
        x2: STREET_ROAD.x2, y2: STREET_ROAD.y2,
        stroke: 'rgba(255,207,92,0.35)', 'stroke-width': 26, 'stroke-linecap': 'round',
      })
    );
    g.appendChild(
      s('line', {
        x1: STREET_ROAD.x1, y1: STREET_ROAD.y1,
        x2: STREET_ROAD.x2, y2: STREET_ROAD.y2,
        stroke: 'rgba(255,207,92,0.7)', 'stroke-width': 2, 'stroke-dasharray': '10 8',
      })
    );
    // 街区名称
    g.appendChild(s('text', { x: 450, y: 40, 'text-anchor': 'middle', fill: '#caa0ff', 'font-size': 16, 'font-weight': '700', text: '坂田机器人街区 · 线下实体世界' }));
    this.svg.appendChild(g);
  }

  _renderBoxes() {
    const g = s('g', { class: 'street-boxes' });
    for (const b of STREET_BOXES) {
      g.appendChild(s('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 8, fill: 'rgba(40,34,66,0.7)', stroke: '#3a2f5a', 'stroke-width': 1 }));
      g.appendChild(s('text', { x: b.x + b.w / 2, y: b.y + b.h / 2 + 5, 'text-anchor': 'middle', fill: '#7a6ea0', 'font-size': 13, 'font-weight': '700', text: b.name }));
    }
    this.svg.appendChild(g);
  }

  _renderPlace(place) {
    const accent = place.accent || '#9fb0d4';
    const g = s('g', { class: 'street-place dim', 'data-place': place.id });
    g.style.color = accent;
    // 建筑主体
    g.appendChild(s('rect', { x: place.x, y: place.y, width: place.w, height: place.h, rx: 12, fill: 'rgba(18,14,34,0.92)', stroke: accent, 'stroke-width': 2 }));
    g.appendChild(s('rect', { x: place.x, y: place.y, width: place.w, height: 30, rx: 12, fill: accent, opacity: 0.18 }));
    // 招牌
    g.appendChild(s('text', { x: place.x + place.w / 2, y: place.y + 20, 'text-anchor': 'middle', fill: '#fff', 'font-size': 13, 'font-weight': '700', text: place.name }));
    // 图标（依据 kind）
    this._renderPlaceIcon(g, place, place.x + place.w / 2, place.y + 64, accent);
    // 类型标签
    const tag = place.kind === 'store' ? '实体门店' : '体验点';
    g.appendChild(s('text', { x: place.x + place.w / 2, y: place.y + place.h - 10, 'text-anchor': 'middle', fill: accent, 'font-size': 9.5, text: tag }));
    this.placeGroups[place.id] = g;
    this.svg.appendChild(g);
  }

  _renderPlaceIcon(g, place, cx, cy, accent) {
    if (place.id === 'p-theater') {
      // 幕布
      g.appendChild(s('path', { d: `M${cx - 16} ${cy - 12} q16 -14 32 0 v18 h-32 z`, fill: accent, opacity: 0.85 }));
      g.appendChild(s('circle', { cx, cy: cy - 2, r: 4, fill: '#1b1530' }));
    } else if (place.id === 'p-fada' || place.onlineStoreId === null) {
      // 医疗/咨询十字
      g.appendChild(s('rect', { x: cx - 4, y: cy - 14, width: 8, height: 28, rx: 2, fill: accent }));
      g.appendChild(s('rect', { x: cx - 14, y: cy - 4, width: 28, height: 8, rx: 2, fill: accent }));
    } else {
      // 机器人
      g.appendChild(s('rect', { x: cx - 11, y: cy - 9, width: 22, height: 18, rx: 4, fill: accent }));
      g.appendChild(s('circle', { cx: cx - 5, cy: cy - 1, r: 2.5, fill: '#1b1530' }));
      g.appendChild(s('circle', { cx: cx + 5, cy: cy - 1, r: 2.5, fill: '#1b1530' }));
      g.appendChild(s('line', { x1: cx, y1: cy - 9, x2: cx, y2: cy - 16, stroke: accent, 'stroke-width': 2 }));
      g.appendChild(s('circle', { cx, cy: cy - 18, r: 2.5, fill: accent }));
    }
  }

  _renderEntrance() {
    const g = s('g', { class: 'street-entrance' });
    const e = STREET_ENTRANCE;
    g.appendChild(s('circle', { cx: e.x, cy: e.y, r: 12, fill: 'none', stroke: '#ffcf5c', 'stroke-width': 2 }));
    g.appendChild(s('text', { x: e.x, y: e.y + 28, 'text-anchor': 'middle', fill: '#caa06a', 'font-size': 9.5, text: '街区入口' }));
    this.svg.appendChild(g);
  }

  _renderHuman() {
    const g = s('g', { class: 'street-human', id: 'street-human' });
    const inner = s('g', { class: 'human-bob' });
    // 身体
    inner.appendChild(s('rect', { x: -9, y: -6, width: 18, height: 26, rx: 7, fill: '#ffcf5c', stroke: '#3a2a00', 'stroke-width': 1.5 }));
    // 头
    inner.appendChild(s('circle', { cx: 0, cy: -16, r: 9, fill: '#ffdca8', stroke: '#caa07a', 'stroke-width': 1.5 }));
    // 眼镜/眼
    inner.appendChild(s('circle', { cx: -3, cy: -16, r: 1.6, fill: '#3a2a00' }));
    inner.appendChild(s('circle', { cx: 3, cy: -16, r: 1.6, fill: '#3a2a00' }));
    // 名牌
    inner.appendChild(s('text', { x: 0, y: 30, 'text-anchor': 'middle', fill: '#ffcf5c', 'font-size': 9.5, 'font-weight': '700', text: '人类顾客' }));
    g.appendChild(inner);
    this.humanEl = g;
    this.setHumanPos(this.humanPos.x, this.humanPos.y);
    this.svg.appendChild(g);
  }

  setHumanPos(x, y) {
    this.humanPos = { x, y };
    if (this.humanEl) this.humanEl.setAttribute('transform', `translate(${x},${y})`);
  }

  resetHuman() {
    this.setHumanPos(LAYOUT.home.x, LAYOUT.home.y);
  }

  highlightPlace(placeId) {
    for (const id in this.placeGroups) {
      const g = this.placeGroups[id];
      if (id === placeId) {
        g.classList.remove('dim');
        g.classList.add('active');
      } else {
        g.classList.add('dim');
        g.classList.remove('active');
      }
    }
  }

  resetPlaces() {
    for (const id in this.placeGroups) {
      this.placeGroups[id].classList.add('dim');
      this.placeGroups[id].classList.remove('active');
    }
  }

  // 暂停感知地移动到坐标（duration 毫秒），与线上小星共用同一时钟
  moveHumanTo(x, y, duration, isAborted) {
    return new Promise((resolve) => {
      const startX = this.humanPos.x;
      const startY = this.humanPos.y;
      let last = performance.now();
      let elapsed = 0;
      const tick = () => {
        if (isAborted && isAborted()) { resolve(); return; }
        const now = performance.now();
        if (!clock.paused) elapsed += now - last;
        last = now;
        const t = Math.min(elapsed / duration, 1);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        this.setHumanPos(startX + (x - startX) * e, startY + (y - startY) * e);
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  get entrance() { return { ...STREET_ENTRANCE }; }
}
