// src/ui.js
// 双世界界面更新：左侧线下（人类顾客）、右侧线上（小星）、汇合决策、未来商店观察、架构对比。
// 只负责把状态/数据渲染成画面，不持有业务规则。

import { getArch, MODE_COMPARISON, REALITY_SPLIT, DISCLAIMER, ARCH_CONFIG } from '../data/architecture.js';
import { getStoreById, STORES } from '../data/stores.js';
import { getProductById, getProductsByStore } from '../data/products.js';
import { getPlaceById } from '../data/street.js';
import { formatJson, highlightJson } from './protocol.js';
import { PURCHASE_STAGE_LABELS } from './agent.js';
import { HUMAN_STATE_LABELS } from './human.js';

function el(tag, attrs = {}, html = '') {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  if (html) e.innerHTML = html;
  return e;
}
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class UI {
  // els: 各 DOM 挂载点
  constructor(els) {
    this.els = els;
    this.panel = els.panel;
    this.dialogue = els.dialogue;
    this.arch = els.arch;
    this.humanLog = els.humanLog;
    this.starLog = els.starLog;
  }

  // ---------- 初始化静态结构 ----------
  build() {
    this.els.disclaimer.innerHTML = esc(DISCLAIMER);
    this.buildControlsPlaceholder();
  }

  buildControlsPlaceholder() {
    this.els.controls.innerHTML = '<div class="empty-hint">开始实验后可调整预算 / 授权 / 优先条件。</div>';
  }

  // ---------- 线上架构 ----------
  setArch(mode) {
    const arch = getArch(mode);
    this.arch.nameEl.textContent = arch.name;
    this.arch.noteEl.textContent = arch.pathText;
    this.arch.disclaimerEl.textContent = DISCLAIMER;
    this.renderArchDiagram(mode);
    this.renderModeComparison(mode);
  }

  renderArchDiagram(mode) {
    const svg = this.arch.svg;
    svg.innerHTML = '';
    const arch = getArch(mode);
    const mk = (key, x, label, fill) => {
      const g = elNS('g', { class: 'ad-node', 'data-key': key });
      g.appendChild(elNS('rect', { x: x, y: 55, width: 120, height: 40, rx: 10, fill, stroke: '#fff', 'stroke-width': 1, 'fill-opacity': 0.15 }));
      g.appendChild(elNS('text', { x: x + 60, y: 80, 'text-anchor': 'middle', fill: '#dfe9ff', 'font-size': 12 }, label));
      return g;
    };
    const edge = (x1, x2, key) =>
      elNS('line', { class: 'ad-edge', 'data-edge': key, x1: x1, y1: 75, x2: x2, y2: 75, stroke: '#5b8def', 'stroke-width': 2 });

    svg.appendChild(mk('star', 30, '小星', 'rgba(124,246,255,0.5)'));
    let x = 30 + 120 + 40;
    const stores = STORES;
    if (arch.hasGateway) {
      svg.appendChild(edge(150, x + 60, 'hub'));
      svg.appendChild(mk('hub', x, '平台网关', 'rgba(255,207,92,0.5)'));
      const gx2 = x + 120;
      stores.forEach((st, i) => {
        const sx = gx2 + 40 + i * 175;
        svg.appendChild(edge(gx2, sx + 60, st.id));
        svg.appendChild(mk(st.id, sx, st.short, 'rgba(124,246,255,0.25)'));
      });
    } else {
      stores.forEach((st, i) => {
        const sx = x + i * 195;
        svg.appendChild(edge(150, sx + 60, st.id));
        svg.appendChild(mk(st.id, sx, st.short, 'rgba(124,246,255,0.25)'));
      });
    }
  }

  highlightArch(key) {
    this.arch.svg.querySelectorAll('.ad-node').forEach((n) => {
      n.classList.toggle('active', n.getAttribute('data-key') === key);
    });
    this.arch.svg.querySelectorAll('.ad-edge').forEach((e) => {
      e.classList.toggle('active', e.getAttribute('data-edge') === key);
    });
  }

  renderModeComparison(mode) {
    const curIsPlatform = mode === 'platform';
    const rows = MODE_COMPARISON.map((c, i) => {
      const cur = curIsPlatform ? c.platform : c.p2p;
      const other = curIsPlatform ? c.p2p : c.platform;
      return `<div class="mcmp-item"><div class="mcmp-q">${i + 1}. ${esc(c.question)}</div>
        <div class="mcmp-a cur">${curIsPlatform ? '统一平台' : '独立站点'}：${esc(cur)}</div>
        <div class="mcmp-a">${curIsPlatform ? '独立站点' : '统一平台'}：${esc(other)}</div></div>`;
    }).join('');
    const real = REALITY_SPLIT.real.map((r) => `<div class="r-li">✓ ${esc(r)}</div>`).join('');
    const sim = REALITY_SPLIT.simulated.map((r) => `<div class="r-li">○ ${esc(r)}</div>`).join('');
    this.els.modecmp.innerHTML =
      rows +
      `<div class="reality-block"><div class="r-title real">真正执行的程序逻辑</div>${real}
       <div class="r-title sim">仅架构模拟（不是真实实现）</div>${sim}</div>`;
  }

  // ---------- 主人条件可调面板 ----------
  renderControls(agent, onChange) {
    const p = agent.preferences;
    const auth = p.authorization || {};
    this.els.controls.innerHTML = `
      <div class="ctl-row"><label>硬性预算</label><input type="number" id="set-budget" value="${p.budget}" min="0" step="10" /> 元</div>
      <div class="ctl-row"><label>授权额度</label><input type="number" id="set-limit" value="${auth.budgetLimit}" min="0" step="10" /> 元</div>
      <div class="ctl-row"><label>下单授权</label><button type="button" id="set-auth" class="ctl-btn ${auth.allowPurchase ? 'on' : 'off'}">${auth.allowPurchase ? '已授予' : '未授予'}</button></div>
      <div class="ctl-row"><label>优先条件</label><input type="checkbox" id="set-assembly" ${p.extraPriority.includes('动手组装') ? 'checked' : ''} /> 动手组装</div>`;
    const bind = () => {
      const b = this.els.controls.querySelector('#set-budget');
      const l = this.els.controls.querySelector('#set-limit');
      const a = this.els.controls.querySelector('#set-auth');
      const asm = this.els.controls.querySelector('#set-assembly');
      if (b) b.addEventListener('change', () => onChange({ budget: Number(b.value) }));
      if (l) l.addEventListener('change', () => onChange({ authLimit: Number(l.value) }));
      if (a)
        a.addEventListener('click', () => onChange({ allowPurchase: !agent.preferences.authorization.allowPurchase }));
      if (asm) asm.addEventListener('change', () => onChange({ assembly: asm.checked }));
    };
    bind();
  }

  // ---------- 线下：人类顾客 ----------
  updateHuman(state, minutes, place) {
    if (state != null) this.els.humanState.textContent = state;
    if (minutes != null) this.els.humanTime.textContent = minutes;
    if (place != null) this.els.humanPlace.textContent = place;
  }
  logHuman(text) {
    const d = el('div', { class: 'log-line' }, `🚶 ${esc(text)}`);
    this.humanLog.appendChild(d);
    this.humanLog.scrollTop = this.humanLog.scrollHeight;
  }
  showHumanReport(report) {
    const wrap = el('div', { class: 'report-block' }, '<div class="report-title">📝 线下体验报告（人类顾客提交）</div>');
    for (const r of report) {
      const items = (r.services || []).map((s) => `· ${esc(s)}`).join('<br>');
      const notes = (r.notes || []).map((n) => `· ${esc(n)}`).join('<br>');
      wrap.appendChild(
        el('div', { class: 'report-item' }, `<div class="ri-place">${esc(r.place)}${r.newlyFound ? ' <span class="tag-new">现场新发现</span>' : ''}</div>
          <div class="ri-sub">现场体验项目：<br>${items}</div>${notes ? `<div class="ri-sub">实物观察：${notes}</div>` : ''}`)
      );
    }
    this.els.futureStore.parentNode; // noop
    this.humanLog.appendChild(wrap);
    this.humanLog.scrollTop = this.humanLog.scrollHeight;
  }

  // ---------- 线上：小星 ----------
  updateStar(state, seconds, store) {
    if (state != null) this.els.starState.textContent = state;
    if (seconds != null) this.els.starTime.textContent = seconds;
    if (store != null) this.els.starStore.textContent = store;
  }
  logStar(text) {
    const d = el('div', { class: 'log-line' }, `⭐ ${esc(text)}`);
    this.starLog.appendChild(d);
    this.starLog.scrollTop = this.starLog.scrollHeight;
  }

  // ---------- 未来商店观察（点击线下门店） ----------
  showFutureStore(placeId) {
    const place = getPlaceById(placeId);
    if (!place) return;
    const box = this.els.futureStore;
    let humanHtml = (place.humanServices || []).map((s) => `<li>${esc(s)}</li>`).join('');
    let aiHtml = '';
    if (place.aiInfo) {
      const ai = place.aiInfo;
      const fields = (ai.fields || []).map((f) => `<span class="kv-chip">${esc(f)}</span>`).join('');
      let extra = '';
      if (ai.programs) {
        extra = '<div class="fs-sub">模拟节目：' + ai.programs.map((p) => `${esc(p.name)}（${esc(p.date)}，适龄${esc(p.age)}）`).join('；') + '</div>';
      }
      aiHtml = `<div class="fs-sub">${esc(ai.summary)}</div><div class="fs-chips">${fields}</div>${extra}
        <div class="fs-endpoint">数据入口：${esc(ai.endpoint)}</div>`;
    } else {
      aiHtml = '<div class="fs-sub">该点位暂无对应的线上智能体商店（仅线下服务）。</div>';
    }
    box.innerHTML = `
      <div class="fs-head">🔍 未来商店观察 · ${esc(place.name)}</div>
      <div class="fs-cols">
        <div class="fs-col human"><div class="fs-col-title">面向人类</div><ul>${humanHtml}</ul>
          <div class="fs-note">实体展示 · 亲身体验 · 人工咨询 · 培训 · 演出 · 售后</div></div>
        <div class="fs-col ai"><div class="fs-col-title">面向 AI 智能体</div>${aiHtml}
          <div class="fs-note">机器可读目录 · 结构化规格与价格 · 库存/服务规则 · 数据入口 · 可解释推荐</div></div>
      </div>`;
  }

  // ---------- 微信风格对话（仅线上小星与主人） ----------
  openDialogue() { this.dialogue.classList.remove('hidden'); }
  clearDialogue() { this.dialogue.innerHTML = ''; this.dialogue.classList.add('hidden'); }
  pushTime(text) {
    const d = el('div', { class: 'chat-time' }, esc(text));
    this.dialogue.appendChild(d);
  }
  pushMessage(msg) {
    const row = el('div', { class: 'msg-row ' + (msg.role === 'owner' ? 'owner' : 'star') });
    const avatar = el('div', { class: 'avatar' }, msg.role === 'owner' ? '大' : '星');
    if (msg.role === 'owner') row.appendChild(avatar);
    const bubble = el('div', { class: 'bubble' });
    if (msg.type === 'order' && msg.order) {
      bubble.appendChild(el('div', { class: 'order-card' },
        `<div class="oc-t">模拟订单 · ${esc(msg.order.status)}</div>
         <div>商品：${esc(msg.order.name)} × ${msg.order.qty}</div>
         <div>金额：￥${msg.order.amount}</div>
         <div>订单号：${esc(msg.order.orderId)}</div>
         <div class="oc-note">非真实支付</div>`));
    } else {
      bubble.textContent = msg.text;
    }
    row.appendChild(bubble);
    if (msg.role === 'star') row.appendChild(avatar);
    this.dialogue.appendChild(row);
    this.dialogue.scrollTop = this.dialogue.scrollHeight;
  }

  // ---------- 机器通信 JSON 面板（仅线上小星） ----------
  openPanel(title) {
    this.panel.classList.remove('hidden');
    this.panel.innerHTML = `<div class="wp-head">${esc(title)}</div><div class="wp-body"></div>`;
  }
  clearPanel() { this.panel.classList.add('hidden'); this.panel.innerHTML = ''; }
  pushProtocol({ dir, from, to, intent, payload }) {
    const body = this.panel.querySelector('.wp-body');
    if (!body) return;
    const line = el('div', { class: 'proto-line ' + (dir === 'out' ? 'out' : 'in') });
    line.appendChild(el('div', { class: 'proto-meta' }, `${dir === 'out' ? '→ 发出' : '← 收到'} ${esc(intent)} · ${esc(from)} → ${esc(to)}`));
    line.appendChild(el('pre', { class: 'proto-json' }, highlightJson(formatJson(payload))));
    body.appendChild(line);
    this.panel.scrollTop = this.panel.scrollHeight;
  }

  // ---------- 采购阶段 ----------
  showPurchaseStage(purchase) {
    if (!purchase) { this.els.purchaseStage && (this.els.purchaseStage.innerHTML = ''); return; }
    const label = PURCHASE_STAGE_LABELS[purchase.stage] || purchase.stage;
    const checks = (purchase.checks || []).map((c) =>
      `<div class="chk ${c.ok ? 'ok' : 'no'}"><span>${c.ok ? '✔' : '✘'}</span><span>${esc(c.label)} · ${esc(c.detail)}</span></div>`
    ).join('');
    this.panel.classList.remove('hidden');
    this.panel.innerHTML = `<div class="wp-head">采购状态</div><div class="wp-body">
      <div style="margin-bottom:6px"><span class="pstage ${purchase.stage}">${esc(label)}</span></div>
      <div class="kv"><span class="k">商品</span><span class="v">${esc(purchase.item.name)}</span></div>
      <div class="kv"><span class="k">金额</span><span class="v">￥${purchase.amount}</span></div>
      ${purchase.order ? `<div class="kv"><span class="k">订单号</span><span class="v">${esc(purchase.order.orderId)}</span></div>` : ''}
      <div class="check-list">${checks}</div></div>`;
  }

  // 比价结果卡片
  showCompare(ranking, recId) {
    const rows = ranking.slice(0, 5).map((r) => {
      const top = r.product.id === recId ? ' top' : '';
      return `<div class="cmp-row${top}"><span class="cmp-name">${esc(r.product.name)}</span>
        <span class="cmp-score">${r.score}</span><span class="cmp-store">${esc(getStoreById(r.product.storeId).short)}</span></div>`;
    }).join('');
    this.panel.classList.remove('hidden');
    this.panel.innerHTML = `<div class="wp-head">线上比价结果（可解释评分）</div><div class="wp-body cmp-list">${rows}</div>`;
  }

  showNewArrivals(currentIds, addedIds) {
    const name = (id) => { const p = getProductById(id); return p ? `${esc(p.name)}（￥${p.price}）` : id; };
    const cur = currentIds.map((id) => `<li>${name(id)}</li>`).join('');
    const add = addedIds.length ? addedIds.map((id) => `<li>${name(id)}</li>`).join('') : '<li>本次无新增（目录与上次一致）</li>';
    this.panel.classList.remove('hidden');
    this.panel.innerHTML = `<div class="wp-head">线上新品发现</div><div class="wp-body">
      <div class="fs-sub">当前上架新品：</div><ul>${cur}</ul>
      <div class="fs-sub">自上次访问后新增：</div><ul>${add}</ul></div>`;
  }

  showRecompute(res) {
    if (!res || !res.before) return;
    this.panel.classList.remove('hidden');
    this.panel.innerHTML = `<div class="wp-head">反馈后重算</div><div class="wp-body">
      <div class="fs-sub">推荐从【${esc(res.before.recName)}】→【${esc(res.after.recName)}】${res.changed ? '（已变化）' : '（未变，分数提升）'}</div></div>`;
  }

  // ---------- 双世界汇合：主人决策界面 ----------
  showDecision(data, handlers) {
    const dec = this.els.decision;
    dec.classList.remove('hidden');
    const humanHtml = (data.humanReport || []).map((r) =>
      `<li><b>${esc(r.place)}</b>：${(r.notes && r.notes.length ? r.notes.join('；') : '（现场体验记录）')}</li>`
    ).join('');
    const starHtml = data.starReport || '';
    const fb = data.feedbackLoop;

    let center = '';
    if (fb) {
      center = `
        <div class="dec-fb">
          <div class="dec-fb-note">线下反馈：${esc(fb.humanNote)}</div>
          <button type="button" id="dec-feedback" class="btn btn-primary">把线下体验反馈给小星</button>
          <div id="dec-fb-result" class="dec-fb-result"></div>
        </div>
        <div class="dec-actions">
          <span class="dec-ask">主人最终决定：</span>
          ${['购买', '预约体验', '继续调查', '放弃'].map((c) => `<button type="button" class="dec-btn" data-choice="${c}">${c}</button>`).join('')}
        </div>
        <div id="dec-final" class="dec-final"></div>`;
    } else {
      center = `<div class="dec-actions">
          <span class="dec-ask">主人综合判断：</span>
          ${['采纳推荐', '继续调查', '放弃'].map((c) => `<button type="button" class="dec-btn" data-choice="${c}">${c}</button>`).join('')}
        </div><div id="dec-final" class="dec-final"></div>`;
    }

    dec.innerHTML = `
      <div class="dec-head">🔗 双世界汇合 · 主人决策（${esc(data.expTitle)}）</div>
      <div class="dec-cols">
        <div class="dec-col"><div class="dec-col-title left">线下 · 人类顾客体验报告</div><ul class="dec-list">${humanHtml || '<li>无</li>'}</ul></div>
        <div class="dec-col center">${center}</div>
        <div class="dec-col"><div class="dec-col-title right">线上 · 小星调查报告</div><div class="dec-star">${starHtml}</div></div>
      </div>`;

    if (fb) {
      dec.querySelector('#dec-feedback').addEventListener('click', () => {
        const res = handlers.onFeedback();
        dec.querySelector('#dec-fb-result').innerHTML =
          `小星已按线下体验重新计算：推荐从【${esc(res.before.recName)}】变为【${esc(res.after.recName)}】${res.changed ? '' : '（同款，匹配分提升）'}。`;
        handlers.onStarReportUpdate && handlers.onStarReportUpdate();
      });
    }
    dec.querySelectorAll('.dec-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const choice = b.getAttribute('data-choice');
        dec.querySelector('#dec-final').textContent = `主人决定：${choice}。${choice === '购买' || choice === '预约体验' ? '（模拟流程，不涉及真实支付）' : ''}`;
        handlers.onDecision && handlers.onDecision(choice);
      });
    });
  }

  hideDecision() { this.els.decision.classList.add('hidden'); this.els.decision.innerHTML = ''; }

  // ---------- 全面重置 ----------
  resetAll() {
    this.els.humanState.textContent = '待出发';
    this.els.humanTime.textContent = '0';
    this.els.humanPlace.textContent = '街区入口';
    this.els.starState.textContent = '待机';
    this.els.starTime.textContent = '0';
    this.els.starStore.textContent = '尚未出发';
    this.humanLog.innerHTML = '';
    this.starLog.innerHTML = '';
    this.els.futureStore.innerHTML = '';
    this.hideDecision();
    this.clearDialogue();
    this.clearPanel();
  }

  // 仅重置右侧线上状态与面板（架构模式切换时使用，不影响左侧线下街区）
  resetStar() {
    this.els.starState.textContent = '待机';
    this.els.starTime.textContent = '0';
    this.els.starStore.textContent = '尚未出发';
    this.starLog.innerHTML = '';
    this.hideDecision();
    this.clearDialogue();
    this.clearPanel();
  }
}

// 简易 SVG 元素创建
function elNS(tag, attrs = {}, text) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text) e.textContent = text;
  return e;
}
