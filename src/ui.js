// src/ui.js
// 界面更新：观察面板、微信风格对话窗口、世界下方面板。
// 只负责把状态/数据渲染成画面，不持有业务规则。

import { STATE_LABELS, STATES } from './agent.js';
import { SCENARIO } from '../data/scenarios.js';
import { TASK_TYPE_LABELS } from '../data/tasks.js';
import { getStoreById, STORES } from '../data/stores.js';
import { getProductById } from '../data/products.js';
import { formatJson, highlightJson } from './protocol.js';
import {
  getArch,
  MODE_COMPARISON,
  REALITY_SPLIT,
  DISCLAIMER,
} from '../data/architecture.js';
import { PURCHASE_STAGE_LABELS } from './agent.js';
import { formatVisitTime } from './history.js';

const PROGRESS_STATES = [
  STATES.ACCEPTING_TASK,
  STATES.LEAVING_HOME,
  STATES.VISITING_STORE,
  STATES.COMPARING_PRODUCTS,
  STATES.RETURNING_HOME,
  STATES.REPORTING,
];

function el(tag, attrs = {}, html = '') {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  if (html) e.innerHTML = html;
  return e;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class UI {
  // arch: { svg, nameEl, noteEl, disclaimerEl }
  constructor(observerEl, dialogueEl, panelEl, arch) {
    this.observer = observerEl;
    this.dialogue = dialogueEl;
    this.panel = panelEl;
    this.arch = arch || {};
    this.logCount = 0;
  }

  // ---------- 初始静态结构 ----------
  build() {
    const p = SCENARIO.preferences;
    this.observer.innerHTML = `
      <div class="obs-block">
        <p class="obs-title">世界架构</p>
        <div id="ui-arch"></div>
      </div>

      <div class="obs-block">
        <p class="obs-title">当前状态</p>
        <div id="ui-state" class="state-badge"><span class="dot"></span><span>待机</span></div>
        <div class="progress" id="ui-progress" style="margin-top:10px">
          ${PROGRESS_STATES.map(() => '<div class="step"></div>').join('')}
        </div>
        <div class="step-labels"><span>接受</span><span>离开</span><span>访问</span><span>处理</span><span>返回</span><span>汇报</span></div>
      </div>

      <div class="obs-block">
        <p class="obs-title">当前任务</p>
        <div id="ui-task" class="empty-hint">尚未开始</div>
      </div>

      <div class="obs-block">
        <p class="obs-title">当前访问</p>
        <div id="ui-store" class="empty-hint">尚未出发</div>
      </div>

      <div class="obs-block">
        <p class="obs-title">已查看商品 <span id="ui-disc-count" class="tag">0</span></p>
        <div id="ui-discovered"><div class="empty-hint">数字分身尚未查看任何商品</div></div>
      </div>

      <div class="obs-block">
        <p class="obs-title">命中清单 <span id="ui-cand-count" class="tag">0</span></p>
        <div id="ui-candidates"><div class="empty-hint">符合条件的商品将加入此处</div></div>
      </div>

      <div class="obs-block">
        <p class="obs-title">采购状态</p>
        <div id="ui-purchase"><div class="empty-hint">尚未进入采购任务</div></div>
      </div>

      <div class="obs-block">
        <p class="obs-title">行动记录</p>
        <div id="ui-log" class="log"><div class="empty-hint">点击「开始演示」后，这里会实时记录小星的行动。</div></div>
      </div>

      <div class="obs-block">
        <p class="obs-title">主人条件（可调整）</p>
        <div id="ui-controls"></div>
        <div class="ctl-hint">改动后会立即重新计算评分与采购校验。</div>
      </div>

      <div class="obs-block">
        <p class="obs-title">模式说明 · 两种模式对比</p>
        <div id="ui-modecmp"></div>
      </div>

      <div class="obs-block">
        <p class="obs-title">主人偏好（本地）</p>
        <div id="ui-prefs">
          <div class="kv"><span class="k">兴趣</span><span class="v">${p.interestsText}</span></div>
          <div class="kv"><span class="k">优先</span><span class="v">${p.priorityText}</span></div>
          <div class="kv"><span class="k">排除</span><span class="v">${p.excludeText}</span></div>
          <div class="kv"><span class="k">授权额度</span><span class="v">¥${SCENARIO.authorization.budgetLimit}</span></div>
          <div id="ui-extra" class="kv" style="display:none"><span class="k">下一次优先</span><span class="v"></span></div>
        </div>
      </div>
    `;
    this.elArch = this.observer.querySelector('#ui-arch');
    this.elState = this.observer.querySelector('#ui-state');
    this.elProgress = [...this.observer.querySelectorAll('#ui-progress .step')];
    this.elTask = this.observer.querySelector('#ui-task');
    this.elStore = this.observer.querySelector('#ui-store');
    this.elDisc = this.observer.querySelector('#ui-discovered');
    this.elDiscCount = this.observer.querySelector('#ui-disc-count');
    this.elCand = this.observer.querySelector('#ui-candidates');
    this.elCandCount = this.observer.querySelector('#ui-cand-count');
    this.elLog = this.observer.querySelector('#ui-log');
    this.elPurchase = this.observer.querySelector('#ui-purchase');
    this.elControls = this.observer.querySelector('#ui-controls');
    this.elModeCmp = this.observer.querySelector('#ui-modecmp');
    this.elExtra = this.observer.querySelector('#ui-extra');
    this.elExtraVal = this.elExtra.querySelector('.v');
  }

  // 切换世界架构：架构图、路径说明、对比表同步变化
  setArch(mode) {
    this.mode = mode;
    const arch = getArch(mode);

    if (this.elArch) {
      this.elArch.innerHTML = `
        <div class="kv"><span class="k">模式</span><span class="v"><span class="tag warn">${esc(
          arch.displayName
        )}</span></span></div>
        <div class="kv"><span class="k">入口</span><span class="v" style="font-size:11px">${
          arch.hasGateway ? esc(arch.gateway.short) : '无（分别直连每家店）'
        }</span></div>
        <div class="kv"><span class="k">授权</span><span class="v" style="font-size:11px">${esc(
          arch.authOwner
        )}</span></div>
        <div class="kv"><span class="k">路由</span><span class="v" style="font-size:11px">${esc(
          arch.routing
        )}</span></div>
        <div class="arch-diffs">${arch.diffs.map((d) => `<div>· ${esc(d)}</div>`).join('')}</div>
      `;
    }

    if (this.arch.nameEl) this.arch.nameEl.textContent = arch.displayName;
    if (this.arch.disclaimerEl) this.arch.disclaimerEl.textContent = DISCLAIMER;
    if (this.arch.noteEl) {
      this.arch.noteEl.innerHTML = `
        <div class="an-item">${esc(arch.description)}</div>
        <div class="an-item" style="margin-top:6px">小星的行动路径：</div>
        <div class="an-item an-path">${esc(arch.pathText)}</div>
      `;
    }

    this.renderArchDiagram(mode);
    this.renderModeComparison(mode);
  }

  // ---------- 架构示意图 ----------
  renderArchDiagram(mode) {
    const svg = this.arch.svg;
    if (!svg) return;
    const arch = getArch(mode);
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs = {}, text) => {
      const e = document.createElementNS(NS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (text != null) e.textContent = text;
      return e;
    };

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const defs = mk('defs');
    const marker = mk('marker', {
      id: 'ad-arrow',
      viewBox: '0 0 10 10',
      refX: '8',
      refY: '5',
      markerWidth: '6',
      markerHeight: '6',
      orient: 'auto-start-reverse',
    });
    marker.appendChild(
      mk('path', {
        d: 'M2 1L8 5L2 9',
        fill: 'none',
        stroke: 'context-stroke',
        'stroke-width': '1.6',
        'stroke-linecap': 'round',
      })
    );
    defs.appendChild(marker);
    svg.appendChild(defs);

    const storeY = [30, 78, 126];
    const starCx = 75;
    const starCy = 78;

    // 连线
    if (arch.hasGateway) {
      svg.appendChild(
        mk('path', { class: 'ad-edge', 'data-key': 'hub', d: `M130 ${starCy} H285`, 'marker-end': 'url(#ad-arrow)' })
      );
      STORES.forEach((s, i) => {
        svg.appendChild(
          mk('path', {
            class: 'ad-edge',
            'data-key': s.id,
            d: `M455 ${starCy} H575 V${storeY[i]} H700`,
            'marker-end': 'url(#ad-arrow)',
          })
        );
      });
    } else {
      STORES.forEach((s, i) => {
        const sy = 68 + i * 10;
        svg.appendChild(
          mk('path', {
            class: 'ad-edge',
            'data-key': s.id,
            d: `M130 ${sy} H575 V${storeY[i]} H700`,
            'marker-end': 'url(#ad-arrow)',
          })
        );
      });
    }

    // 节点：小星
    const gStar = mk('g', { class: 'ad-node star', 'data-key': 'star' });
    gStar.appendChild(mk('rect', { x: 20, y: starCy - 22, width: 110, height: 44, rx: 10 }));
    gStar.appendChild(
      mk('text', { x: starCx, y: starCy, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, '小星')
    );
    svg.appendChild(gStar);

    // 节点：平台（仅统一平台模式）
    if (arch.hasGateway) {
      const gHub = mk('g', { class: 'ad-node hub', 'data-key': 'hub' });
      gHub.appendChild(mk('rect', { x: 285, y: 50, width: 170, height: 56, rx: 10 }));
      gHub.appendChild(
        mk('text', { x: 370, y: 68, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, '未来商业平台')
      );
      gHub.appendChild(
        mk(
          'text',
          { x: 370, y: 88, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': '9' },
          '统一目录 · 统一入口'
        )
      );
      svg.appendChild(gHub);
    }

    // 节点：三家商店
    STORES.forEach((s, i) => {
      const g = mk('g', { class: 'ad-node', 'data-key': s.id });
      g.appendChild(mk('rect', { x: 700, y: storeY[i] - 19, width: 210, height: 38, rx: 8 }));
      g.appendChild(
        mk('text', { x: 805, y: storeY[i], 'text-anchor': 'middle', 'dominant-baseline': 'central' }, s.name)
      );
      svg.appendChild(g);
    });

    this.archSvg = svg;
  }

  // 高亮当前正在发生的访问：key = 'star' | 'hub' | 商店 id | null
  highlightArch(key) {
    const svg = this.arch.svg;
    if (!svg) return;
    svg.querySelectorAll('.ad-node').forEach((n) => {
      n.classList.toggle('active', !!key && n.getAttribute('data-key') === key);
    });
    svg.querySelectorAll('.ad-edge').forEach((e) => {
      e.classList.toggle('active', !!key && e.getAttribute('data-key') === key);
    });
  }

  // ---------- 模式说明对比 ----------
  renderModeComparison(mode) {
    if (!this.elModeCmp) return;
    const curIsPlatform = mode === 'platform';
    const rows = MODE_COMPARISON.map((c, i) => {
      const cur = curIsPlatform ? c.platform : c.p2p;
      const other = curIsPlatform ? c.p2p : c.platform;
      return `<div class="mcmp-item">
        <div class="mcmp-q">${i + 1}. ${esc(c.question)}</div>
        <div class="mcmp-a cur">${curIsPlatform ? '统一平台' : '独立站点'}：${esc(cur)}</div>
        <div class="mcmp-a">${curIsPlatform ? '独立站点' : '统一平台'}：${esc(other)}</div>
      </div>`;
    }).join('');

    const real = REALITY_SPLIT.real.map((r) => `<div class="r-li">✓ ${esc(r)}</div>`).join('');
    const sim = REALITY_SPLIT.simulated.map((r) => `<div class="r-li">○ ${esc(r)}</div>`).join('');

    this.elModeCmp.innerHTML =
      rows +
      `<div class="reality-block">
        <div class="r-title real">真正执行的程序逻辑</div>
        ${real}
        <div class="r-title sim">仅架构模拟（不是真实实现）</div>
        ${sim}
      </div>`;
  }

  // ---------- 主人条件（可调整） ----------
  renderControls(agent, onChange) {
    if (!this.elControls) return;
    const p = agent.preferences;
    const auth = p.authorization || {};
    this.elControls.innerHTML = `
      <div class="ctl-row">
        <label>硬性预算</label>
        <input type="number" id="set-budget" value="${p.budget}" min="0" step="10" /> 元
      </div>
      <div class="ctl-row">
        <label>授权额度</label>
        <input type="number" id="set-limit" value="${auth.budgetLimit}" min="0" step="10" /> 元
      </div>
      <div class="ctl-row">
        <label>下单授权</label>
        <button type="button" id="set-auth" class="ctl-btn ${auth.allowPurchase ? 'on' : 'off'}">
          ${auth.allowPurchase ? '已授予' : '未授予'}
        </button>
      </div>
      <div class="ctl-row">
        <label>优先条件</label>
        <input type="checkbox" id="set-assembly" ${
          p.extraPriority.includes('动手组装') ? 'checked' : ''
        } /> 动手组装
      </div>
    `;

    const bind = () => {
      const b = this.elControls.querySelector('#set-budget');
      const l = this.elControls.querySelector('#set-limit');
      const a = this.elControls.querySelector('#set-auth');
      const asm = this.elControls.querySelector('#set-assembly');
      if (b) b.addEventListener('change', () => onChange({ budget: Number(b.value) }));
      if (l) l.addEventListener('change', () => onChange({ authLimit: Number(l.value) }));
      if (a)
        a.addEventListener('click', () => {
          const next = !agent.preferences.authorization.allowPurchase;
          onChange({ allowPurchase: next });
        });
      if (asm) asm.addEventListener('change', () => onChange({ assembly: asm.checked }));
    };
    bind();
  }

  // ---------- 采购阶段 ----------
  showPurchaseStage(purchase) {
    if (!this.elPurchase) return;
    if (!purchase) {
      this.elPurchase.innerHTML = '<div class="empty-hint">尚未进入采购任务</div>';
      return;
    }
    const label = PURCHASE_STAGE_LABELS[purchase.stage] || purchase.stage;
    const checks = (purchase.checks || [])
      .map(
        (c) =>
          `<div class="chk ${c.ok ? 'ok' : 'no'}"><span>${c.ok ? '✔' : '✘'}</span><span>${esc(
            c.label
          )} · ${esc(c.detail)}</span></div>`
      )
      .join('');
    this.elPurchase.innerHTML = `
      <div style="margin-bottom:6px">
        <span class="pstage ${purchase.stage}">${esc(label)}</span>
      </div>
      <div class="kv"><span class="k">商品</span><span class="v">${esc(purchase.item.name)}</span></div>
      <div class="kv"><span class="k">金额</span><span class="v">￥${purchase.amount}</span></div>
      ${purchase.order ? `<div class="kv"><span class="k">订单号</span><span class="v">${esc(purchase.order.orderId)}</span></div>` : ''}
      <div class="check-list">${checks}</div>
    `;
  }

  setState(state) {
    const label = STATE_LABELS[state] || state;
    this.elState.innerHTML = `<span class="dot"></span><span>${label}</span>`;
    let idx = PROGRESS_STATES.indexOf(state);
    if (state === STATES.COMPLETED) idx = PROGRESS_STATES.length;
    this.elProgress.forEach((step, i) => {
      step.classList.remove('active', 'done');
      if (i < idx) step.classList.add('done');
      else if (i === idx) step.classList.add('active');
    });
  }

  // 当前任务（n/total），并显示主人当前的预算、偏好与授权范围
  setTask(task, index, total, prefs) {
    if (!task) {
      this.elTask.className = 'empty-hint';
      this.elTask.textContent = '尚未开始';
      return;
    }
    const p = prefs || SCENARIO.preferences;
    const auth = p.authorization || {};
    this.elTask.className = '';
    this.elTask.innerHTML = `
      <div class="kv"><span class="k">进度</span><span class="v">${index + 1} / ${total}</span></div>
      <div class="kv"><span class="k">类型</span><span class="v"><span class="tag">${TASK_TYPE_LABELS[task.type]}</span></span></div>
      <div class="kv"><span class="k">目标</span><span class="v" style="font-size:11px">${esc(task.goal)}</span></div>
      <div class="kv"><span class="k">硬性预算</span><span class="v">￥${p.budget}</span></div>
      <div class="kv"><span class="k">偏好</span><span class="v" style="font-size:11px">${esc(
        p.interestsText
      )}｜${esc(p.priorityText)}${
      p.extraPriority.length ? '｜' + p.extraPriority.join('、') : ''
    }</span></div>
      <div class="kv"><span class="k">授权范围</span><span class="v" style="font-size:11px">${
        auth.allowPurchase ? '已授权下单，额度 ￥' + auth.budgetLimit : '未授予下单权限'
      }</span></div>
      <div class="kv"><span class="k">授权清单</span><span class="v" style="font-size:11px">${esc(
        (auth.allowedItems || []).join('、') || '—'
      )}</span></div>
      <div class="kv"><span class="k">权限</span><span class="v" style="font-size:11px">${esc(task.permission)}</span></div>
    `;
  }

  setStore(name) {
    this.elStore.textContent = name || '—';
    this.elStore.className = name ? '' : 'empty-hint';
  }

  log(msg) {
    this.logCount++;
    const row = el('div', { class: 'row' });
    row.appendChild(el('span', { class: 'time' }, `#${this.logCount}`));
    row.appendChild(el('span', { class: 'msg' }, msg));
    if (this.elLog.querySelector('.empty-hint')) this.elLog.innerHTML = '';
    this.elLog.appendChild(row);
    this.elLog.scrollTop = this.elLog.scrollHeight;
  }

  // 每个任务开始时清空清单
  clearLists() {
    this.elDisc.innerHTML = '<div class="empty-hint">数字分身尚未查看任何商品</div>';
    this.elCand.innerHTML = '<div class="empty-hint">符合条件的商品将加入此处</div>';
    this.elDiscCount.textContent = '0';
    this.elCandCount.textContent = '0';
  }

  addDiscovered(product) {
    const store = getStoreById(product.storeId);
    if (this.elDisc.querySelector('.empty-hint')) this.elDisc.innerHTML = '';
    const item = el('div', { class: 'cand' });
    item.innerHTML =
      `<span class="name">${esc(product.name)}</span>` +
      `<span class="store">${store.short}${product.isNew ? ' · NEW' : ''}</span>`;
    this.elDisc.appendChild(item);
    this.elDiscCount.textContent = String(this.elDisc.children.length);
  }

  // 命中清单：tagText 随任务语义变化（候选 / 新品 / 下单目标）
  addCandidate(product, tagText = '候选') {
    const store = getStoreById(product.storeId);
    if (this.elCand.querySelector('.empty-hint')) this.elCand.innerHTML = '';
    const item = el('div', { class: 'cand', 'data-id': product.id });
    const cmpTask = SCENARIO.tasks.find((t) => t.type === 'compare');
    const budget = cmpTask ? cmpTask.constraints.budget : 100;
    const over = product.price > budget;
    item.innerHTML =
      `<span class="name">${esc(product.name)}</span>` +
      `<span class="store">${store.short} · ${tagText}</span>` +
      `<span class="price ${over && tagText === '候选' ? 'over' : ''}">¥${product.price}</span>`;
    this.elCand.appendChild(item);
    this.elCandCount.textContent = String(this.elCand.children.length);
  }

  markTop(recId) {
    this.elCand.querySelectorAll('.cand').forEach((c) => {
      if (c.getAttribute('data-id') === recId) c.classList.add('top');
    });
  }

  // ---------- 世界下方面板 ----------
  openPanel(title, tag = '') {
    this.panel.classList.remove('hidden');
    this.panel.innerHTML = `
      <div class="wp-head">${esc(title)}${tag ? `<span class="wp-tag">${esc(tag)}</span>` : ''}</div>
      <div class="wp-body"></div>
    `;
    this.panelBody = this.panel.querySelector('.wp-body');
  }

  setPanelHead(title, tag = '') {
    const h = this.panel.querySelector('.wp-head');
    if (h) h.innerHTML = `${esc(title)}${tag ? `<span class="wp-tag">${esc(tag)}</span>` : ''}`;
  }

  // 机器之间的通信报文（out=小星发出，in=店铺返回）
  pushProtocol({ dir, from, to, intent, payload }) {
    if (!this.panelBody) this.openPanel('机器通信 · A2A 协议', 'JSON');
    const row = el('div', { class: `proto-row ${dir === 'in' ? 'in' : ''}` });
    const arrow = dir === 'in' ? '◀ 收到' : '▶ 发送';
    row.innerHTML =
      `<div class="proto-head"><span>${arrow}</span><span>${esc(from)} → ${esc(to)}</span>` +
      `<span class="intent">${esc(intent)}</span></div>` +
      `<pre class="proto-json">${highlightJson(formatJson(payload))}</pre>`;
    this.panelBody.appendChild(row);
    this.panelBody.scrollTop = this.panelBody.scrollHeight;
  }

  clearPanel() {
    if (this.panelBody) this.panelBody.innerHTML = '';
  }

  hidePanel() {
    this.panel.classList.add('hidden');
    this.panel.innerHTML = '';
    this.panelBody = null;
    this.panelView = null;
  }

  // 比价卡片
  showCompare(ranking, recId) {
    this.openPanel('商品比较 · 按匹配度排序', '比价');
    this.panelView = 'compare';
    const grid = el('div', { class: 'wp-grid' });
    for (const r of ranking) {
      const ok = r.matched.map((m) => `<div class="c-ok">✓ ${esc(m)}</div>`).join('');
      const no = r.unmatched.map((u) => `<div class="c-no">⚠ ${esc(u)}</div>`).join('');
      const card = el('div', { class: `wp-card ${r.product.id === recId ? 'top' : ''}` });
      card.innerHTML =
        `<div class="c-name"><span>${esc(r.product.name)}</span><span class="c-score">${r.score}分</span></div>` +
        `<div class="c-line">¥${r.product.price} · ${getStoreById(r.product.storeId).short}</div>` +
        ok +
        no;
      grid.appendChild(card);
    }
    this.panelBody.appendChild(grid);
  }

  // 新品发现：两种语义必须分开显示，不能混为一谈
  //   currentIds —— 当前上架新品（商品数据里标记为新品）
  //   addedIds   —— 自上次访问后新增（这次才出现的）
  showNewArrivals(currentIds, addedIds = [], lastVisitAt = null, hasHistory = false) {
    this.openPanel('新品发现 · 两种语义分开显示', '新品');
    this.panelView = 'new';

    const mkCard = (p, tag) => {
      const store = getStoreById(p.storeId);
      const card = el('div', { class: 'wp-card' });
      card.innerHTML =
        `<div class="c-name"><span>${esc(p.name)}</span><span class="c-new">NEW</span></div>` +
        `<div class="c-line">¥${p.price} · ${store.short} · ${p.releaseDate} 上架</div>` +
        `<div class="c-line">${esc(p.features)}</div>` +
        `<div class="c-ok">库存 ${p.stock} 件${tag ? ' · ' + tag : ''}</div>`;
      return card;
    };

    // 语义一：当前上架新品
    const sec1 = el('div', { class: 'newsec current' });
    sec1.innerHTML = `<div class="newsec-t">当前上架新品（数据中标记为新品）<span class="cnt">共 ${
      currentIds.length
    } 件</span></div>`;
    const grid1 = el('div', { class: 'wp-grid' });
    currentIds.forEach((id) => {
      const p = getProductById(id);
      if (p) grid1.appendChild(mkCard(p));
    });
    sec1.appendChild(grid1);
    this.panelBody.appendChild(sec1);

    // 语义二：自上次访问后新增
    const sec2 = el('div', { class: 'newsec added' });
    const t = formatVisitTime(lastVisitAt);
    if (!hasHistory) {
      sec2.innerHTML =
        `<div class="newsec-t">自上次访问后新增<span class="cnt">首次访问</span></div>` +
        `<div class="c-line">还没有历史记录，无法判断哪些是新增。本次访问结束后会记录，再次演示即可看到新增项。</div>`;
    } else {
      sec2.innerHTML = `<div class="newsec-t">自上次访问后新增（上次访问：${esc(
        t || '未知'
      )}）<span class="cnt">共 ${addedIds.length} 件</span></div>`;
      if (addedIds.length === 0) {
        sec2.appendChild(el('div', { class: 'c-line' }, '自上次访问以来没有新增上架的商品。'));
      } else {
        const grid2 = el('div', { class: 'wp-grid' });
        addedIds.forEach((id) => {
          const p = getProductById(id);
          if (p) grid2.appendChild(mkCard(p, '本次新增'));
        });
        sec2.appendChild(grid2);
      }
    }
    this.panelBody.appendChild(sec2);
  }

  // 主人反馈后的重新计算结果
  showRecompute(res) {
    if (!res || !res.before) return;
    this.openPanel('主人反馈后的重新计算', '重算');
    this.panelView = 'recompute';
    const b = res.before;
    const a = res.after;
    let html = `<div class="order-panel">
      <div class="op-title">反馈前推荐：${esc(b.recName)}（${b.score} 分）</div>
      <div class="op-title">反馈后推荐：${esc(a.recName)}（${a.score} 分）</div>
      <div class="op-row"><span>推荐是否变化</span><b>${
        res.changed ? '是（已切换）' : '否，但分数已提升'
      }</b></div>
    </div>`;
    if (res.movements && res.movements.length) {
      html +=
        `<div class="check-list" style="margin-top:8px"><div class="r-title real">名次变化</div>` +
        res.movements
          .map(
            (m) =>
              `<div class="chk ok"><span>▸</span><span>${esc(m.name)}：第 ${m.from} 名 → 第 ${
                m.to
              } 名</span></div>`
          )
          .join('') +
        `</div>`;
    }
    this.panelBody.innerHTML = html;
  }

  // 授权校验 + 订单确认
  showOrder(check, order, store) {
    this.openPanel('授权校验与下单结果', '下单');
    const box = el('div', { class: 'order-panel' });
    let html = `<div class="op-title">${order ? '✔ 下单成功（模拟）' : '✘ 未下单'}</div>`;
    if (check) {
      html += '<div class="check-list">';
      for (const c of check.checks) {
        html += `<div class="chk ${c.ok ? 'ok' : 'no'}"><span>${c.ok ? '✔' : '✘'}</span><span>${esc(
          c.label
        )} · ${esc(c.detail)}</span></div>`;
      }
      html += '</div>';
    }
    if (order) {
      html +=
        `<div class="op-row" style="margin-top:8px"><span>订单号</span><b>${esc(order.orderId)}</b></div>` +
        `<div class="op-row"><span>商品</span><b>${esc(order.name)} × ${order.qty}</b></div>` +
        `<div class="op-row"><span>商店</span><b>${store ? esc(store.name) : '—'}</b></div>` +
        `<div class="op-row"><span>金额</span><b class="op-amt">¥${order.amount}</b></div>` +
        `<div class="op-row"><span>状态</span><b>${esc(order.status)} · 模拟交易</b></div>`;
    }
    box.innerHTML = html;
    this.panelBody.appendChild(box);
  }

  // ---------- 微信风格对话窗口 ----------
  openDialogue() {
    this.dialogue.classList.remove('hidden');
  }

  clearDialogue() {
    this.dialogue.innerHTML = `
      <div class="chat-head"><span class="ch-back">‹</span><span>小星</span><span class="ch-dots">···</span></div>
      <div class="chat-body"></div>
    `;
    this.chatBody = this.dialogue.querySelector('.chat-body');
  }

  // msg: { role:'star'|'owner', type:'text'|'order', text?, order? }
  pushMessage(msg) {
    if (!this.chatBody) this.clearDialogue();
    const row = el('div', { class: `msg-row ${msg.role}` });
    const av = el('div', { class: 'avatar' });
    av.textContent =
      msg.role === 'star' ? SCENARIO.avatar.avatarText : SCENARIO.master.avatarText;
    row.appendChild(av);

    const bubble = el('div', { class: 'bubble' });
    if (msg.type === 'order' && msg.order) {
      const o = msg.order;
      const store = getStoreById(o.storeId);
      bubble.classList.add('order-card');
      bubble.innerHTML =
        `<div class="oc-head">📦 订单已确认 · 模拟交易</div>` +
        `<div class="oc-row"><span>商品</span><b>${esc(o.name)}</b></div>` +
        `<div class="oc-row"><span>数量</span><b>× ${o.qty}</b></div>` +
        `<div class="oc-row"><span>商店</span><b>${store ? esc(store.short) : '—'}</b></div>` +
        `<div class="oc-row"><span>金额</span><b class="oc-amt">¥${o.amount}</b></div>` +
        `<div class="oc-row"><span>订单号</span><b>${esc(o.orderId)}</b></div>` +
        `<div class="oc-foot">模拟订单，不涉及真实支付</div>`;
    } else {
      bubble.textContent = msg.text || '';
    }
    row.appendChild(bubble);
    this.chatBody.appendChild(row);
    this.chatBody.scrollTop = this.chatBody.scrollHeight;
  }

  // 时间戳分隔（微信风格）
  pushTime(text) {
    if (!this.chatBody) this.clearDialogue();
    const t = el('div', { class: 'chat-time' }, esc(text));
    this.chatBody.appendChild(t);
  }

  updatePreferences(agent) {
    const extra = agent.preferences.extraPriority;
    if (extra && extra.length) {
      this.elExtra.style.display = '';
      this.elExtraVal.innerHTML = extra.map((e) => `<span class="tag">${esc(e)}</span>`).join('');
    }
  }
}
