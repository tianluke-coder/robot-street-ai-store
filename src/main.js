// src/main.js
// v0.3 编排器：人类与 AI 的双世界商业实验。
// 同一项主人任务，左侧「线下坂田机器人街区」（人类顾客，按分钟计时）与
// 右侧「线上 AI 商业世界」（数字分身小星，按秒计时）并行执行，
// 最后在「主人决策」区汇合，由主人综合两种渠道信息做决定。
//
// 关键约束（来自需求）：
//  · 小星不具有线下机器人身体 —— 线下移动的是「人类顾客」示意角色，线上是「小星」。
//  · 两世界行为 / 速度 / 信息来源不同，但共享同一主人任务。
//  · 模拟时间双计数器：线下用「分钟」，线上用「秒」，均标注为教学模拟参数。
//  · 线下反馈（实物体验）可影响小星后续判断（运行时调整体验分，不污染原始商品数据）。
//  · 线上架构模式（统一平台 / 独立站点）只影响右侧小星路径；左侧线下街区不受模式切换改变。
//  · 技术栈不变：Vite + 原生 JS + SVG；无 3D、无大模型、无真实支付、无硬件控制。

import { World } from './world.js';
import {
  Agent,
  STATES,
  STATE_LABELS,
  PURCHASE_STAGES,
  PURCHASE_STAGE_LABELS,
} from './agent.js';
import { UI } from './ui.js';
import { StreetWorld } from './world-street.js';
import { HumanCustomer, HUMAN_STATES, HUMAN_STATE_LABELS } from './human.js';
import { wait, clock } from './clock.js';
import { SCENARIO } from '../data/scenarios.js';
import { STORES, getStoreById } from '../data/stores.js';
import { getProductsByStore, getProductById, PRODUCTS } from '../data/products.js';
import { TASK_TYPES, TASK_TYPE_LABELS } from '../data/tasks.js';
import { ARCH_MODES, getArch } from '../data/architecture.js';
import { getExperimentById } from '../data/experiments.js';
import { getPlaceById, STREET_ENTRANCE } from '../data/street.js';
import * as dialogue from './dialogue.js';
import * as proto from './protocol.js';
import { setExperienceAdjust, resetExperienceAdjust } from './scoring.js';

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- DOM ----------
const streetSvg = document.getElementById('street');
const worldSvg = document.getElementById('world');
const futureStoreEl = document.getElementById('future-store');

const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnReplay = document.getElementById('btn-replay');
const btnSpeed = document.getElementById('btn-speed');
const btnModePlatform = document.getElementById('mode-platform');
const btnModeP2p = document.getElementById('mode-p2p');
const expBtnA = document.getElementById('exp-a');
const expBtnB = document.getElementById('exp-b');
const expBtnC = document.getElementById('exp-c');

// ---------- 实例 ----------
const street = new StreetWorld(streetSvg); // 左侧线下街区（人类顾客）
const world = new World(worldSvg); // 右侧线上世界（小星）
const human = new HumanCustomer(); // 线下人类顾客状态机
const agent = new Agent(); // 线上小星状态机与数据

const ui = new UI({
  panel: document.getElementById('world-panel'),
  dialogue: document.getElementById('dialogue'),
  arch: {
    svg: document.getElementById('arch-diagram'),
    nameEl: document.getElementById('arch-mode-name'),
    noteEl: document.getElementById('arch-note'),
    disclaimerEl: document.getElementById('arch-disclaimer'),
  },
  humanLog: document.getElementById('human-log'),
  starLog: document.getElementById('star-log'),
  humanState: document.getElementById('human-state'),
  humanTime: document.getElementById('human-time'),
  humanPlace: document.getElementById('human-place'),
  starState: document.getElementById('star-state'),
  starTime: document.getElementById('star-time'),
  starStore: document.getElementById('star-store'),
  futureStore: futureStoreEl,
  decision: document.getElementById('decision'),
  controls: document.getElementById('ui-controls'),
  modecmp: document.getElementById('ui-modecmp'),
  disclaimer: document.getElementById('ui-disclaimer'),
});

// ---------- 全局状态 ----------
let archMode = ARCH_MODES.PLATFORM;
let currentRunId = 0;
let running = false;
let currentExp = getExperimentById('exp-compare');
let speed = 1; // 速度倍率：1× / 2× / 4× / 0.5×
const SPEED_CYCLE = [1, 2, 4, 0.5];

// 线上小星的模拟用时（秒）—— 与线下「分钟」严格区分
const starSeconds = { v: 0 };
function addStarSeconds(n) {
  starSeconds.v += n;
  ui.updateStar(null, starSeconds.v, null);
}
function resetStarSeconds() {
  starSeconds.v = 0;
  ui.updateStar(null, 0, null);
}

// ---------- 按钮状态 ----------
function updateButtons() {
  btnStart.disabled = running;
  btnPause.disabled = !running;
  btnReplay.disabled = running;
  btnSpeed.textContent = `速度 ${speed}×`;
  btnPause.textContent = clock.paused ? '▶ 继续' : '⏸ 暂停';
}

// ---------- 重置场景（双世界回到初始） ----------
function resetScene() {
  agent.reset();
  human.reset();
  resetStarSeconds();
  resetExperienceAdjust();
  world.render(archMode);
  street.render();
  ui.resetAll();
  ui.setArch(archMode);
  ui.renderControls(agent, onSettingsChange);
}

// ---------- 选择实验（高亮 + 显示说明，不立即运行） ----------
const EXP_MAP = [
  ['exp-a', 'exp-compare'],
  ['exp-b', 'exp-discover'],
  ['exp-c', 'exp-purchase'],
];
function selectExperiment(expId) {
  const exp = getExperimentById(expId);
  if (!exp) return;
  currentExp = exp;
  for (const [btnId, eid] of EXP_MAP) {
    document.getElementById(btnId).classList.toggle('active', eid === expId);
  }
  resetScene();
  futureStoreEl.innerHTML = `
    <div class="fs-head">🧪 ${esc(exp.title)}</div>
    <div class="fs-cols">
      <div class="fs-col human"><div class="fs-col-title">共同的线下 + 线上目标</div><div class="fs-sub">${esc(exp.masterGoal)}</div></div>
      <div class="fs-col ai"><div class="fs-col-title">过程说明</div><div class="fs-sub">${esc(exp.detail)}</div></div>
    </div>
    <div class="fs-note">选择实验后点击「开始双世界实验」。左侧人类顾客走线下街区（按分钟），右侧小星走线上智能体商店（按秒），最后在下方「双世界汇合」区由主人综合决策。</div>`;
}

// ---------- 主人条件调整（预算 / 授权 / 优先条件） ----------
function onSettingsChange(patch) {
  const p = agent.preferences;
  agent.userAdjusted = true; // 主人改过条件，重置与重播时保留
  if (patch.budget != null && !Number.isNaN(patch.budget)) p.budget = patch.budget;
  if (patch.authLimit != null && !Number.isNaN(patch.authLimit))
    p.authorization.budgetLimit = patch.authLimit;
  if (patch.allowPurchase != null) p.authorization.allowPurchase = patch.allowPurchase;
  if (patch.assembly != null) {
    if (patch.assembly && !p.extraPriority.includes('动手组装')) {
      p.extraPriority.push('动手组装');
    } else if (!patch.assembly) {
      p.extraPriority = p.extraPriority.filter((x) => x !== '动手组装');
    }
  }
  agent.recomputeRanking(PRODUCTS);
  ui.renderControls(agent, onSettingsChange);
  ui.logStar(
    `条件已更新：硬性预算 ￥${p.budget}｜授权额度 ￥${p.authorization.budgetLimit}｜${
      p.authorization.allowPurchase ? '已授权下单' : '未授予下单权限'
    }｜优先：${p.extraPriority.length ? p.extraPriority.join('、') : '无'}`
  );
}

// ============================================================
// 左侧：线下人类顾客状态机（按分钟计）
// ============================================================
async function runHumanSide(exp, isAborted, check) {
  human.setExperiment(exp);
  ui.updateHuman(HUMAN_STATE_LABELS[HUMAN_STATES.IDLE], human.minutes, '街区入口');
  ui.logHuman(`主人任务：「${exp.masterGoal}」`);
  ui.logHuman('我（人类顾客）从街区入口出发，沿机器人大街步行前往各实体点位。');

  for (const placeId of exp.humanPlaces) {
    if (!check()) return;
    const place = getPlaceById(placeId);

    // WALKING —— 沿街步行
    human.setState(HUMAN_STATES.WALKING);
    ui.updateHuman(HUMAN_STATE_LABELS[HUMAN_STATES.WALKING], human.minutes, `前往 ${place.name}`);
    ui.logHuman(`沿街步行前往【${place.name}】…`);
    street.highlightPlace(placeId);
    await street.moveHumanTo(place.x + place.w / 2, place.y + place.h + 26, 1700, isAborted);
    if (!check()) return;
    human.addMinutes(6); // 线下步行耗时（分钟）

    // ENTERING —— 进入门店
    human.setState(HUMAN_STATES.ENTERING);
    ui.updateHuman(HUMAN_STATE_LABELS[HUMAN_STATES.ENTERING], human.minutes, place.name);
    ui.logHuman(`进入【${place.name}】。`);
    await wait(900 / speed);
    if (!check()) return;
    human.addMinutes(2);

    // OBSERVING —— 观察体验（记录实物，与线上规格分开）
    human.setState(HUMAN_STATES.OBSERVING);
    ui.updateHuman(HUMAN_STATE_LABELS[HUMAN_STATES.OBSERVING], human.minutes, place.name);
    const obs = human.observePlace(placeId);
    ui.showFutureStore(placeId); // 未来商店观察：同一门店面向人 / 面向 AI 双列
    ui.logHuman(`观察体验：${(obs.physicalNotes || []).join('；') || '（记录现场活动）'}`);
    await wait(1300 / speed);
    if (!check()) return;
    human.addMinutes(5);

    // CONSULTING —— 咨询店员（仅线下人工咨询）
    human.setState(HUMAN_STATES.CONSULTING);
    ui.updateHuman(HUMAN_STATE_LABELS[HUMAN_STATES.CONSULTING], human.minutes, place.name);
    ui.logHuman(`咨询店员：${(place.humanServices || []).slice(0, 2).join('、')}等。`);
    await wait(1100 / speed);
    if (!check()) return;
    human.addMinutes(4);

    // RECORDING —— 记录体验
    human.setState(HUMAN_STATES.RECORDING);
    ui.updateHuman(HUMAN_STATE_LABELS[HUMAN_STATES.RECORDING], human.minutes, place.name);
    ui.logHuman(`记录线下体验：${place.name} → ${(obs.physicalNotes || []).join('；') || '现场活动'}`);
    await wait(900 / speed);
    if (!check()) return;
    human.addMinutes(3);
  }

  // RETURNING —— 返回入口
  human.setState(HUMAN_STATES.RETURNING);
  ui.updateHuman(HUMAN_STATE_LABELS[HUMAN_STATES.RETURNING], human.minutes, '返回入口');
  ui.logHuman('沿街返回街区入口，整理体验笔记。');
  street.resetPlaces();
  await street.moveHumanTo(STREET_ENTRANCE.x, STREET_ENTRANCE.y, 1500, isAborted);
  if (!check()) return;
  human.addMinutes(5);

  // REPORTING —— 提交报告
  human.setState(HUMAN_STATES.REPORTING);
  ui.updateHuman(HUMAN_STATE_LABELS[HUMAN_STATES.REPORTING], human.minutes, '提交报告');
  ui.logHuman(`提交线下体验报告（共 ${human.observations.length} 个点位）。`);
  ui.showHumanReport(human.buildReport());
  await wait(600 / speed);
}

// ============================================================
// 右侧：线上小星状态机（按秒计，复用 agent 的底层方法）
// ============================================================
async function runStarSide(exp, isAborted, check, mode) {
  // 构造本实验对应的线上任务（复用 SCENARIO 中同类型任务，覆盖预算 / 商店 / 目标商品）
  const base = SCENARIO.tasks.find((t) => t.type === exp.type) || SCENARIO.tasks[0];
  const starTask = {
    ...base,
    id: base.id,
    type: exp.type,
    name: exp.title,
    goal: exp.masterGoal,
    constraints: {
      ...base.constraints,
      budget: exp.budget,
      ...(exp.targetItemId
        ? { targetItemId: exp.targetItemId, qty: exp.qty }
        : {}),
    },
    stores: exp.starStores,
  };
  agent.currentTask = starTask;
  agent.resetTaskState();
  agent.preferences.budget = exp.budget; // 实验固定预算（如实验 A/B/C 均为 200）

  // —— 接受任务（微信对话，仅线上） ——
  agent.setState(STATES.ACCEPTING_TASK);
  ui.updateStar(STATE_LABELS[STATES.ACCEPTING_TASK], starSeconds.v, '尚未出发');
  ui.clearDialogue();
  ui.openDialogue();
  ui.pushTime(`【线上任务】${TASK_TYPE_LABELS[exp.type]}：${exp.masterGoal}`);
  ui.pushMessage({ role: 'owner', type: 'text', text: exp.masterGoal });
  await wait(1300 / speed);
  if (!check()) return;
  ui.pushMessage({ role: 'star', type: 'text', text: dialogue.buildAcceptReply(starTask) });
  ui.logStar('小星已接受任务，记录条件与权限。');
  await wait(1500 / speed);
  if (!check()) return;

  // —— 离开主人电脑 ——
  agent.setState(STATES.LEAVING_HOME);
  ui.updateStar(STATE_LABELS[STATES.LEAVING_HOME], starSeconds.v, '数字通道');
  ui.logStar('小星离开主人电脑，进入数字通道。');
  await world.moveAvatarTo(world.waypoints.channel.x, world.waypoints.channel.y, 1800, isAborted);
  if (!check()) return;
  await wait(300 / speed);
  if (!check()) return;
  addStarSeconds(1);
  await world.moveAvatarTo(world.waypoints.portal.x, world.waypoints.portal.y, 1000, isAborted);
  if (!check()) return;
  addStarSeconds(1);

  // —— 服务发现（仅平台模式；独立站点模式按清单直连） ——
  const arch = getArch(mode);
  const stores = STORES.filter((s) => (starTask.stores || []).includes(s.id));
  if (arch.hasGateway) {
    ui.logStar(`进入【${arch.gateway.name}】，开始服务发现。`);
    ui.highlightArch('hub');
    await world.moveAvatarTo(world.waypoints.gateway.x, world.waypoints.gateway.y, 1400, isAborted);
    if (!check()) return;
    addStarSeconds(1);
    const q = proto.buildDiscoverStoresQuery(arch.gateway, starTask);
    ui.openPanel('机器通信 · 服务发现（平台网关）');
    ui.pushProtocol({
      dir: 'out',
      from: proto.selfAddress(),
      to: arch.gateway.id,
      intent: q.intent,
      payload: q,
    });
    ui.logStar('发送 DISCOVER_STORES → 平台网关');
    await wait(1300 / speed);
    if (!check()) return;
    const r = proto.buildStoreDirectoryResult(arch.gateway, stores);
    ui.pushProtocol({
      dir: 'in',
      from: arch.gateway.id,
      to: proto.selfAddress(),
      intent: r.intent,
      payload: r,
    });
    ui.logStar(`收到 STORE_DIRECTORY（${r.count} 家入驻商户）`);
    await wait(1400 / speed);
    if (!check()) return;
  } else {
    ui.logStar('无统一平台：按商店清单分别直连各独立端点。');
    await wait(1100 / speed);
    if (!check()) return;
  }

  // —— 访问各商店（机器间用 JSON 报文，仅线上） ——
  agent.setState(STATES.VISITING_STORE);
  ui.updateStar(STATE_LABELS[STATES.VISITING_STORE], starSeconds.v, '访问商店');
  for (const store of stores) {
    if (!check()) return;
    ui.logStar(`前往【${store.name}】…`);
    ui.updateStar(STATE_LABELS[STATES.VISITING_STORE], starSeconds.v, store.name);
    ui.highlightArch(store.id);
    const door = world.waypoints.doors[store.id];
    await world.moveAvatarTo(door.x, door.y, 1400, isAborted);
    if (!check()) return;
    addStarSeconds(1);
    world.activateStore(store.id);
    const all = getProductsByStore(store.id);
    let request;
    if (exp.type === TASK_TYPES.DISCOVER) {
      request = proto.buildNewArrivalsQuery(store, starTask, mode);
    } else {
      request = proto.buildCatalogQuery(store, starTask, mode);
    }
    ui.openPanel(
      arch.hasGateway
        ? '机器通信 · A2A 协议（经平台网关路由）'
        : '机器通信 · A2A 协议（点对点直连）'
    );
    ui.pushProtocol({
      dir: 'out',
      from: proto.selfAddress(),
      to: proto.storeAgentAddress(store),
      intent: request.intent,
      payload: request,
    });
    ui.logStar(`发送 ${request.intent} → ${store.agent.name}`);
    await wait(1200 / speed);
    if (!check()) return;

    let response;
    if (exp.type === TASK_TYPES.DISCOVER) {
      response = proto.buildNewArrivalsResult(store, all.filter((p) => p.isNew));
    } else {
      response = proto.buildCatalogResult(store, all);
    }
    ui.pushProtocol({
      dir: 'in',
      from: proto.storeAgentAddress(store),
      to: proto.selfAddress(),
      intent: response.intent,
      payload: response,
    });
    ui.logStar(`收到 ${response.intent}（${response.count} 件）`);
    await wait(900 / speed);
    if (!check()) return;

    const tagText =
      exp.type === TASK_TYPES.DISCOVER
        ? '新品'
        : exp.type === TASK_TYPES.PURCHASE
        ? '目标'
        : '候选';
    for (const p of all) {
      if (!check()) return;
      agent.discover(p);
      const hit = agent.isHit(p);
      world.revealProduct(p, hit);
      ui.logStar(`查看「${p.name}」（¥${p.price}）${hit ? '→ ' + tagText : '→ 不命中'}`);
      await wait(800 / speed);
      if (!check()) return;
    }
    addStarSeconds(1);
    world.hideAgent(store.id);
    ui.logStar(`离开【${store.name}】。`);
    await wait(300 / speed);
    if (!check()) return;
  }

  // —— 处理（比较 / 汇总新品 / 授权评估） ——
  agent.setState(STATES.COMPARING_PRODUCTS);
  ui.updateStar(STATE_LABELS[STATES.COMPARING_PRODUCTS], starSeconds.v, '处理中');
  const reviewed = agent.discovered.map((id) => getProductById(id)).filter(Boolean);

  if (exp.type === TASK_TYPES.COMPARE) {
    ui.logStar('开始按评分规则比较全部商品。');
    await wait(700 / speed);
    if (!check()) return;
    const ranking = agent.finalizeComparison(reviewed);
    ui.showCompare(ranking, agent.recommendation.product.id);
    ui.logStar(
      `评分完成：${agent.recommendation.product.name}（${agent.recommendation.score} 分）推荐首选。`
    );
    await wait(4000 / speed);
    if (!check()) return;
    addStarSeconds(2);
  } else if (exp.type === TASK_TYPES.DISCOVER) {
    ui.logStar('汇总各店新品，区分「当前上架新品」与「自上次访问后新增」。');
    await wait(700 / speed);
    if (!check()) return;
    const res = agent.finalizeNewArrivals(reviewed);
    ui.showNewArrivals(res.currentNew, res.newlyAdded);
    ui.logStar(
      `当前上架新品 ${res.currentNew.length} 件；本次新增 ${res.newlyAdded.length} 件${
        res.hasHistory ? '' : '（首次访问，暂无历史对照）'
      }。`
    );
    await wait(4500 / speed);
    if (!check()) return;
    addStarSeconds(2);
  } else if (exp.type === TASK_TYPES.PURCHASE) {
    const item = getProductById(starTask.constraints.targetItemId);
    const store = getStoreById(item.storeId);
    const qty = starTask.constraints.qty || 1;
    ui.logStar('开始按硬性预算与授权条件评估采购。');
    await wait(700 / speed);
    if (!check()) return;
    let pur = agent.evaluatePurchase(item, qty);
    ui.showPurchaseStage({
      ...pur,
      stage: pur.hardOk ? PURCHASE_STAGES.RECOMMENDED : PURCHASE_STAGES.OVER_BUDGET,
    });
    ui.logStar(
      pur.hardOk
        ? `符合硬性预算 ￥${agent.preferences.budget}，列入推荐。`
        : `￥${item.price} 超出硬性预算，不列入推荐。`
    );
    await wait(2200 / speed);
    if (!check()) return;

    if (pur.hardOk) {
      pur = agent.submitForApproval();
      ui.showPurchaseStage(pur);
      ui.logStar('已提交主人审批，等待授权结果。');
      await wait(2200 / speed);
      if (!check()) return;
      pur = agent.decideApproval();
      ui.showPurchaseStage(pur);
      ui.logStar(
        pur.stage === PURCHASE_STAGES.APPROVED
          ? `已批准下单（授权归属：${arch.authOwner}）。`
          : '未获批准：授权条件不满足，不进入下单。'
      );
      await wait(2200 / speed);
      if (!check()) return;
      addStarSeconds(3);
      // 实验 C 不在线上自动下单：把最终购买决策留给汇合区的主人，
      // 这样才能演示「采购与体验决策」——先看线下反馈，再由主人拍板。
      if (pur.stage === PURCHASE_STAGES.APPROVED) {
        ui.logStar('已通过授权校验，等待主人在「双世界汇合」区做最终购买决策。');
      }
    } else {
      await wait(2000 / speed);
      if (!check()) return;
    }
  }

  // —— 返回主人电脑 ——
  agent.setState(STATES.RETURNING_HOME);
  ui.updateStar(STATE_LABELS[STATES.RETURNING_HOME], starSeconds.v, '返回主人电脑');
  ui.clearPanel();
  ui.highlightArch(null);
  world.resetStores();
  ui.logStar('小星沿数字通道返回主人电脑。');
  await world.moveAvatarTo(world.waypoints.channel.x, world.waypoints.channel.y, 1600, isAborted);
  if (!check()) return;
  await world.moveAvatarTo(world.waypoints.home.x, world.waypoints.home.y, 1700, isAborted);
  if (!check()) return;
  addStarSeconds(1);

  // —— 汇报（微信对话，仅线上） ——
  agent.setState(STATES.REPORTING);
  ui.updateStar(STATE_LABELS[STATES.REPORTING], starSeconds.v, '准备汇报');
  ui.openDialogue();
  ui.pushMessage({ role: 'star', type: 'text', text: '主人，我回来了。' });
  await wait(800 / speed);
  if (!check()) return;
  const msgs = dialogue.buildReport(agent, starTask);
  for (const m of msgs) {
    if (!check()) return;
    ui.pushMessage(m);
    await wait(1200 / speed);
    if (!check()) return;
  }
  ui.pushMessage({ role: 'owner', type: 'text', text: dialogue.ownerTaskResponse(starTask) });
  agent.finishTask(starTask.name + ' 完成');
  await wait(1000 / speed);
  if (!check()) return;
  addStarSeconds(1);

  agent.setState(STATES.COMPLETED);
  ui.updateStar(STATE_LABELS[STATES.COMPLETED], starSeconds.v, '任务完成');
}

// ============================================================
// 双世界汇合：主人决策界面
// ============================================================
function buildStarReportHtml(exp, overrideRec) {
  if (exp.type === TASK_TYPES.COMPARE) {
    const rec = overrideRec || agent.recommendation;
    const ranking = agent.ranking || [];
    if (!rec) return '<div class="dec-star-empty">（线上比价尚未完成）</div>';
    const top3 = ranking
      .filter((r) => !r.excluded)
      .slice(0, 3)
      .map((r) => `${r.product.name}（${r.score} 分）`)
      .join('、');
    return `<div class="dec-star-line">🔝 首选推荐：<b>${rec.product.name}</b>（￥${rec.product.price}，${getStoreById(rec.product.storeId).short}）</div>
      <div class="dec-star-line">匹配分：<b>${rec.score}</b> 分</div>
      <div class="dec-star-line">理由：${rec.matched.join('；')}</div>
      <div class="dec-star-line">其他候选：${top3}</div>`;
  }
  if (exp.type === TASK_TYPES.DISCOVER) {
    const ids = agent.newArrivals || [];
    const list = ids
      .map((id) => {
        const p = getProductById(id);
        return p ? `${p.name}（￥${p.price}）` : id;
      })
      .join('、');
    return `<div class="dec-star-line">🆕 当前上架新品 <b>${ids.length}</b> 件：${list || '无'}</div>
      <div class="dec-star-line">自上次访问后新增：${(agent.newlyAdded || []).length} 件</div>`;
  }
  // PURCHASE
  const pur = agent.purchase;
  if (!pur) return '<div class="dec-star-line">（线上采购评估未生成）</div>';
  const checks = (pur.checks || []).map((c) => `${c.ok ? '✔' : '✘'} ${c.label}`).join('；');
  const rec = overrideRec || agent.recommendation;
  const recLine = rec
    ? `<div class="dec-star-line">比价参考推荐：${rec.product.name}（${rec.score} 分）</div>`
    : '';
  const orderLine = pur.order
    ? `<div class="dec-star-line">📦 模拟订单：${pur.order.orderId}（非真实支付）</div>`
    : '';
  return `<div class="dec-star-line">🛒 采购评估：${pur.item.name}（￥${pur.amount}）</div>
    <div class="dec-star-line">授权校验：${checks}</div>
    <div class="dec-star-line">状态：${PURCHASE_STAGE_LABELS[pur.stage] || pur.stage}</div>
    ${recLine}${orderLine}`;
}

function showConvergence(exp) {
  // 建立比价快照（供反馈后对比 before / after）；仅实验 C 有反馈回路
  if (exp.feedbackLoop) {
    agent.finalizeComparison(PRODUCTS);
  }
  const data = {
    expTitle: exp.title,
    humanReport: human.buildReport(),
    starReport: buildStarReportHtml(exp),
    feedbackLoop: exp.feedbackLoop || null,
  };

  ui.showDecision(data, {
    onFeedback: () => {
      const fb = exp.feedbackLoop;
      // 主人把线下体验反馈给小星：运行时调整该商品的实物体验分（不修改原始商品数据）
      setExperienceAdjust(fb.targetId, fb.adjust);
      const res = agent.recomputeAfterFeedback(PRODUCTS);
      // 重算（含体验分）更新推荐，供重新渲染线上报告
      if (fb.targetId) agent.finalizeComparison(PRODUCTS);
      return res;
    },
    onStarReportUpdate: () => {
      const elStar = document.querySelector('#decision .dec-star');
      if (elStar) elStar.innerHTML = buildStarReportHtml(exp, agent.recommendation);
    },
    onDecision: (choice) => {
      // 若主人选择购买且线上已批准，则模拟下单（非真实支付）
      if ((choice === '购买' || choice === '预约体验') && exp.type === TASK_TYPES.PURCHASE) {
        const pur = agent.completePurchase();
        if (pur && pur.order) {
          ui.pushMessage({ role: 'star', type: 'order', order: pur.order });
          ui.logStar('已按主人决定完成模拟下单（非真实支付）。');
        }
      }
      ui.logHuman(`主人最终决定：${choice}。`);
    },
  });
}

// ============================================================
// 启动一次完整实验：双世界并行
// ============================================================
async function startExperiment(exp) {
  const myRun = ++currentRunId;
  const isAborted = () => currentRunId !== myRun;
  const check = () => currentRunId === myRun;
  currentExp = exp;

  running = true;
  clock.paused = false;
  updateButtons();

  resetScene();
  ui.logHuman(`— 开始「${exp.title}」：共同目标「${exp.masterGoal}」 —`);
  ui.logStar(`— 开始「${exp.title}」：小星在线上同步执行 —`);

  await Promise.all([
    runHumanSide(exp, isAborted, check),
    runStarSide(exp, isAborted, check, archMode),
  ]);
  if (!check()) return;

  // 两世界完成 → 汇合决策
  showConvergence(exp);
  running = false;
  updateButtons();
}

// ============================================================
// 控制条按钮
// ============================================================
btnStart.addEventListener('click', () => {
  if (running) return;
  startExperiment(currentExp);
});

btnPause.addEventListener('click', () => {
  if (!running) return;
  clock.paused = !clock.paused;
  updateButtons();
});

btnReplay.addEventListener('click', () => {
  if (running) return;
  startExperiment(currentExp);
});

btnSpeed.addEventListener('click', () => {
  const idx = SPEED_CYCLE.indexOf(speed);
  speed = SPEED_CYCLE[(idx + 1) % SPEED_CYCLE.length];
  updateButtons();
});

expBtnA.addEventListener('click', () => selectExperiment('exp-compare'));
expBtnB.addEventListener('click', () => selectExperiment('exp-discover'));
expBtnC.addEventListener('click', () => selectExperiment('exp-purchase'));

// 架构模式切换：只影响右侧线上小星路径；左侧线下街区不受影响
function switchArch(mode) {
  if (mode === archMode) return;
  archMode = mode;
  currentRunId++; // 中止进行中的实验
  running = false;
  clock.paused = false;
  world.render(archMode); // 右侧按新模式重渲染
  ui.setArch(archMode);
  ui.renderControls(agent, onSettingsChange);
  ui.resetStar(); // 仅重置右侧线上状态与面板，左侧线下保留
  updateButtons();
}
btnModePlatform.addEventListener('click', () => switchArch(ARCH_MODES.PLATFORM));
btnModeP2p.addEventListener('click', () => switchArch(ARCH_MODES.P2P));

// ============================================================
// 访问地址提示条（显示本机局域网入口）
// ============================================================
function setupNetHint() {
  const hint = document.getElementById('net-hint');
  const netEl = document.getElementById('nh-net');
  const closeEl = document.getElementById('nh-close');
  if (!netEl) return;
  const info = (typeof window !== 'undefined' && window.__LAN_INFO__) || null;
  const port =
    info && info.port ? info.port : location.port || (location.protocol === 'https:' ? '443' : '80');
  const lanIP = info && info.ip ? info.ip : null;
  const netURL = lanIP ? `http://${lanIP}:${port}/` : `http://<本机局域网IP>:${port}/`;
  netEl.textContent = netURL;
  if (closeEl && hint) closeEl.addEventListener('click', () => hint.classList.add('hidden'));
}

// ============================================================
// 初始化
// ============================================================
function init() {
  world.render(archMode);
  street.render();
  ui.build();
  ui.setArch(archMode);
  ui.renderControls(agent, onSettingsChange);
  selectExperiment('exp-compare'); // 默认选实验 A 并显示说明
  setupNetHint();
  updateButtons();
}

init();
