// src/main.js
// 应用初始化与状态机协调。
// 状态流：IDLE → ACCEPTING_TASK → LEAVING_HOME → VISITING_STORE
//        → COMPARING_PRODUCTS → RETURNING_HOME → REPORTING → COMPLETED
// 三个任务（比价 / 看新品 / 授权购买）按顺序轮换执行，每个任务完整走一遍状态机。
// 全程可暂停 / 继续 / 重置；重播会清空角色位置、命中清单、任务进度与报告，无残留。

import { World } from './world.js';
import { Agent, STATES, PURCHASE_STAGES } from './agent.js';
import { UI } from './ui.js';
import { wait, clock } from './clock.js';
import { STORES, getStoreById } from '../data/stores.js';
import { getProductsByStore, getProductById, PRODUCTS } from '../data/products.js';
import { TASK_TYPES } from '../data/tasks.js';
import { ARCH_MODES, getArch } from '../data/architecture.js';
import * as dialogue from './dialogue.js';
import * as proto from './protocol.js';

const svg = document.getElementById('world');
const observerEl = document.getElementById('observer');
const dialogueEl = document.getElementById('dialogue');
const panelEl = document.getElementById('world-panel');

const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnReplay = document.getElementById('btn-replay');
const btnModePlatform = document.getElementById('mode-platform');
const btnModeP2p = document.getElementById('mode-p2p');

const world = new World(svg);
const agent = new Agent();
const ui = new UI(observerEl, dialogueEl, panelEl, {
  svg: document.getElementById('arch-diagram'),
  nameEl: document.getElementById('arch-mode-name'),
  noteEl: document.getElementById('arch-note'),
  disclaimerEl: document.getElementById('arch-disclaimer'),
});

// 当前世界架构：platform = 统一平台入口；p2p = 独立智能体商店
let archMode = ARCH_MODES.PLATFORM;

let currentRunId = 0;
let running = false;

// ---------- 按钮交互 ----------
function updateButtons() {
  btnStart.disabled = running;
  btnPause.disabled = !running;
  btnPause.textContent = clock.paused ? '▶ 继续' : '⏸ 暂停';
}

btnStart.addEventListener('click', () => {
  if (running) return;
  runDemo();
});

btnPause.addEventListener('click', () => {
  if (!running) return;
  clock.paused = !clock.paused;
  updateButtons();
});

btnReplay.addEventListener('click', () => {
  currentRunId++;
  runDemo();
});

// ---------- 架构模式切换 ----------
function switchArch(mode) {
  if (mode === archMode) return;
  archMode = mode;
  btnModePlatform.classList.toggle('active', mode === ARCH_MODES.PLATFORM);
  btnModeP2p.classList.toggle('active', mode === ARCH_MODES.P2P);

  // 中止正在进行的演示并重置世界
  currentRunId++;
  running = false;
  clock.paused = false;

  world.render(archMode);
  ui.build();
  ui.setArch(archMode);
  ui.renderControls(agent, onSettingsChange);
  ui.setState(STATES.IDLE);
  ui.setTask(null);
  ui.setStore('—');
  ui.clearDialogue();
  ui.hidePanel();
  dialogueEl.classList.add('hidden');
  updateButtons();
}

btnModePlatform.addEventListener('click', () => switchArch(ARCH_MODES.PLATFORM));
btnModeP2p.addEventListener('click', () => switchArch(ARCH_MODES.P2P));

// ---------- 主人条件调整（预算 / 授权 / 优先条件）后立即重新计算 ----------
function onSettingsChange(patch) {
  const p = agent.preferences;
  agent.userAdjusted = true; // 主人改过条件，重播时保留
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

  // 重新评分（预算与优先条件改变会真实影响结果）
  agent.recomputeRanking(PRODUCTS);
  if (ui.panelView === 'compare' && agent.ranking && agent.recommendation) {
    ui.showCompare(agent.ranking, agent.recommendation.product.id);
  }

  // 重新校验采购（若已评估过）
  if (agent.purchase) {
    const wasCompleted = agent.purchase.stage === PURCHASE_STAGES.COMPLETED;
    agent.evaluatePurchase(agent.purchase.item, agent.purchase.qty);
    if (wasCompleted && agent.purchase.hardOk) {
      agent.purchase.stage = PURCHASE_STAGES.APPROVED; // 回到已批准，等待重新下单
    }
    ui.showPurchaseStage(agent.purchase);
  }

  ui.log(
    `条件已更新：硬性预算 ￥${p.budget}｜授权额度 ￥${p.authorization.budgetLimit}｜${
      p.authorization.allowPurchase ? '已授权下单' : '未授予下单权限'
    }｜新增优先：${p.extraPriority.length ? p.extraPriority.join('、') : '无'}`
  );
  ui.renderControls(agent, onSettingsChange);
  if (agent.currentTask) {
    ui.setTask(agent.currentTask, agent.taskIndex, agent.tasks.length, agent.preferences);
  }
  ui.updatePreferences(agent);
}

// ---------- 单个任务的完整状态机 ----------
async function runTask(task, index, total, isAborted, check, mode) {
  // ===== 阶段1：接受任务（微信对话） =====
  agent.setState(STATES.ACCEPTING_TASK);
  ui.setState(STATES.ACCEPTING_TASK);
  ui.setStore('—');
  ui.clearDialogue();
  ui.openDialogue();
  ui.pushTime(dialogue.buildTaskAnnounce(task, index + 1, total));
  ui.pushMessage({ role: 'owner', type: 'text', text: task.ownerRequest });
  ui.log(`【任务 ${index + 1}/${total}】主人下达：${task.goal}`);
  await wait(1400);
  if (!check()) return false;
  ui.pushMessage({ role: 'star', type: 'text', text: dialogue.buildAcceptReply(task) });
  ui.log('小星已接受任务，记录条件与权限。');
  await wait(1800);
  if (!check()) return false;

  // ===== 阶段2：离开主人电脑 =====
  agent.setState(STATES.LEAVING_HOME);
  ui.setState(STATES.LEAVING_HOME);
  ui.log('小星离开主人电脑，进入数字通道。');
  await world.moveAvatarTo(world.waypoints.channel.x, world.waypoints.channel.y, 2000, isAborted);
  if (!check()) return false;
  await wait(300);
  if (!check()) return false;
  await world.moveAvatarTo(world.waypoints.portal.x, world.waypoints.portal.y, 1100, isAborted);
  if (!check()) return false;

  // ===== 服务发现（仅平台模式） =====
  const arch = getArch(mode);
  const stores = STORES.filter((st) => (task.stores || []).includes(st.id));

  if (arch.hasGateway) {
    ui.log(`进入【${arch.gateway.name}】，开始服务发现。`);
    ui.highlightArch('hub');
    await world.moveAvatarTo(world.waypoints.gateway.x, world.waypoints.gateway.y, 1500, isAborted);
    if (!check()) return false;
    const q = proto.buildDiscoverStoresQuery(arch.gateway, task);
    ui.openPanel('机器通信 · 服务发现（平台网关）', 'DISCOVER');
    ui.pushProtocol({
      dir: 'out',
      from: proto.selfAddress(),
      to: arch.gateway.id,
      intent: q.intent,
      payload: q,
    });
    ui.log('发送 DISCOVER_STORES → 平台网关');
    await wait(1400);
    if (!check()) return false;

    const r = proto.buildStoreDirectoryResult(arch.gateway, stores);
    ui.pushProtocol({
      dir: 'in',
      from: arch.gateway.id,
      to: proto.selfAddress(),
      intent: r.intent,
      payload: r,
    });
    ui.log(`收到 STORE_DIRECTORY（${r.count} 家入驻商户）`);
    await wait(1500);
    if (!check()) return false;
  } else {
    ui.log('无统一平台：按主人预设的商店清单直接访问各独立端点。');
    await wait(1200);
    if (!check()) return false;
  }

  // ===== 阶段3：进入商店并探索（机器之间用 JSON 通信） =====
  agent.setState(STATES.VISITING_STORE);
  ui.setState(STATES.VISITING_STORE);

  for (const store of stores) {
    if (!check()) return false;
    ui.setStore(store.name);
    ui.log(`前往【${store.name}】…`);
    ui.highlightArch(store.id); // 架构图上高亮当前这条访问路径
    const door = world.waypoints.doors[store.id];
    await world.moveAvatarTo(door.x, door.y, 1500, isAborted);
    if (!check()) return false;

    world.activateStore(store.id);

    // --- 机器通信：请求 ---
    const all = getProductsByStore(store.id);
    let request;
    if (task.type === TASK_TYPES.DISCOVER) {
      request = proto.buildNewArrivalsQuery(store, task, mode);
    } else {
      request = proto.buildCatalogQuery(store, task, mode);
    }
    ui.openPanel(
      arch.hasGateway
        ? '机器通信 · A2A 协议（经平台网关路由）'
        : '机器通信 · A2A 协议（点对点直连）',
      'JSON'
    );
    ui.pushProtocol({
      dir: 'out',
      from: proto.selfAddress(),
      to: proto.storeAgentAddress(store),
      intent: request.intent,
      payload: request,
    });
    ui.log(`发送 ${request.intent} → ${store.agent.name}`);
    await wait(1300);
    if (!check()) return false;

    // --- 机器通信：响应 ---
    let response;
    if (task.type === TASK_TYPES.DISCOVER) {
      response = proto.buildNewArrivalsResult(
        store,
        all.filter((p) => p.isNew)
      );
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
    ui.log(`收到 ${response.intent}（${response.count} 件）`);
    await wait(1000);
    if (!check()) return false;

    // --- 主人看到的可视化：商品卡片逐张出现 ---
    const tagText =
      task.type === TASK_TYPES.DISCOVER
        ? '新品'
        : task.type === TASK_TYPES.PURCHASE
        ? '目标'
        : '候选';
    for (const p of all) {
      if (!check()) return false;
      agent.discover(p);
      const hit = agent.isHit(p);
      world.revealProduct(p, hit);
      ui.addDiscovered(p);
      if (hit) ui.addCandidate(p, tagText);
      ui.log(`查看「${p.name}」（¥${p.price}）${hit ? '→ ' + tagText : '→ 不命中'}`);
      await wait(950);
      if (!check()) return false;
    }
    world.hideAgent(store.id);
    ui.log(`离开【${store.name}】。`);
    await wait(400);
    if (!check()) return false;
  }

  // ===== 阶段4：处理（比较 / 汇总新品 / 授权下单） =====
  agent.setState(STATES.COMPARING_PRODUCTS);
  ui.setState(STATES.COMPARING_PRODUCTS);
  ui.setStore('—（处理中）');

  if (task.type === TASK_TYPES.COMPARE) {
    ui.log('开始按评分规则比较全部商品。');
    await wait(700);
    if (!check()) return false;
    const ranking = agent.finalizeComparison(
      agent.discovered.map((id) => getProductById(id)).filter(Boolean)
    );
    ui.showCompare(ranking, agent.recommendation.product.id);
    ui.log(
      `评分完成（${ranking.length} 件）。最高分：${agent.recommendation.product.name}（${agent.recommendation.score} 分）。`
    );
    ui.markTop(agent.recommendation.product.id);
    await wait(4500);
    if (!check()) return false;
  } else if (task.type === TASK_TYPES.DISCOVER) {
    ui.log('汇总各店新品，区分「当前上架新品」与「自上次访问后新增」。');
    await wait(700);
    if (!check()) return false;
    const res = agent.finalizeNewArrivals(
      agent.discovered.map((id) => getProductById(id)).filter(Boolean)
    );
    ui.showNewArrivals(res.currentNew, res.newlyAdded, res.lastVisitAt, res.hasHistory);
    ui.log(
      `当前上架新品 ${res.currentNew.length} 件；自上次访问后新增 ${
        res.newlyAdded.length
      } 件${res.hasHistory ? '' : '（首次访问，暂无历史对照）'}。`
    );
    await wait(5200);
    if (!check()) return false;
  } else if (task.type === TASK_TYPES.PURCHASE) {
    const item = getProductById(task.constraints.targetItemId);
    const store = getStoreById(item.storeId);
    const qty = task.constraints.qty || 1;

    // ① 推荐：先看是否满足主人的硬性预算
    ui.log('开始按主人的硬性预算与授权条件评估采购。');
    await wait(700);
    if (!check()) return false;
    let pur = agent.evaluatePurchase(item, qty);
    ui.showPurchaseStage({
      ...pur,
      stage: pur.hardOk ? PURCHASE_STAGES.RECOMMENDED : PURCHASE_STAGES.OVER_BUDGET,
    });
    ui.log(
      pur.hardOk
        ? `符合硬性预算 ￥${agent.preferences.budget}，列入推荐。`
        : `￥${item.price} 超出硬性预算 ￥${agent.preferences.budget}，不列入推荐，也不进入下单。`
    );
    await wait(2400);
    if (!check()) return false;

    if (!pur.hardOk) {
      ui.log('超出硬性预算，采购流程终止。');
      await wait(3200);
      if (!check()) return false;
    } else {
      // ② 待审批
      pur = agent.submitForApproval();
      ui.showPurchaseStage(pur);
      ui.log('已提交主人审批，等待授权结果。');
      await wait(2400);
      if (!check()) return false;

      // ③ 审批结果（授权归属随模式不同）
      pur = agent.decideApproval();
      ui.showPurchaseStage(pur);
      const approved = pur.stage === PURCHASE_STAGES.APPROVED;
      ui.log(
        approved
          ? `已批准下单（授权归属：${arch.authOwner}）。`
          : '未获批准：授权条件不满足，不进入下单。'
      );
      await wait(2400);
      if (!check()) return false;

      if (approved) {
        // ④ 机器通信：下单请求 → 商店确认
        ui.openPanel(
          arch.hasGateway
            ? '机器通信 · 下单（平台授权中心签发）'
            : '机器通信 · 下单（分身自行校验）',
          'PLACE_ORDER'
        );
        const orderReq = proto.buildOrderRequest(
          store,
          task,
          item,
          mode,
          agent.preferences.authorization
        );
        ui.pushProtocol({
          dir: 'out',
          from: proto.selfAddress(),
          to: proto.storeAgentAddress(store),
          intent: orderReq.intent,
          payload: orderReq,
        });
        ui.log(`发送 ${orderReq.intent}（${item.name} × ${qty}）`);
        await wait(1600);
        if (!check()) return false;

        pur = agent.completePurchase();
        const accepted = proto.buildOrderResult(store, pur.order, true, null, mode);
        ui.pushProtocol({
          dir: 'in',
          from: proto.storeAgentAddress(store),
          to: proto.selfAddress(),
          intent: accepted.intent,
          payload: accepted,
        });
        ui.log(`收到 ${accepted.intent}：${pur.order.orderId}`);
        ui.showPurchaseStage(pur);
        await wait(1200);
        if (!check()) return false;

        ui.showOrder({ ok: true, checks: pur.checks }, pur.order, store);
        await wait(3400);
        if (!check()) return false;
      } else {
        const rejected = proto.buildOrderResult(store, null, false, 'AUTH_CHECK_FAILED', mode);
        ui.openPanel('机器通信 · 下单未执行（未获批准）', 'REJECTED');
        ui.pushProtocol({
          dir: 'in',
          from: proto.storeAgentAddress(store),
          to: proto.selfAddress(),
          intent: rejected.intent,
          payload: rejected,
        });
        ui.log('未获批准，没有发送下单请求。');
        await wait(3400);
        if (!check()) return false;
      }
    }
  }

  // ===== 阶段5：返回主人电脑 =====
  agent.setState(STATES.RETURNING_HOME);
  ui.setState(STATES.RETURNING_HOME);
  ui.hidePanel();
  ui.highlightArch(null); // 清除架构图高亮
  ui.log('小星沿数字通道返回主人电脑。');
  world.resetStores();
  await world.moveAvatarTo(world.waypoints.channel.x, world.waypoints.channel.y, 1800, isAborted);
  if (!check()) return false;
  await world.moveAvatarTo(world.waypoints.home.x, world.waypoints.home.y, 1900, isAborted);
  if (!check()) return false;
  ui.log('小星已回到主人电脑屏幕，准备汇报。');

  // ===== 阶段6：向主人汇报（微信对话） =====
  agent.setState(STATES.REPORTING);
  ui.setState(STATES.REPORTING);
  ui.openDialogue();
  ui.pushMessage({ role: 'star', type: 'text', text: '主人，我回来了。' });
  await wait(900);
  if (!check()) return false;

  const msgs = dialogue.buildReport(agent, task);
  for (const m of msgs) {
    if (!check()) return false;
    ui.pushMessage(m);
    await wait(1300);
    if (!check()) return false;
  }
  ui.pushMessage({ role: 'owner', type: 'text', text: dialogue.ownerTaskResponse(task) });
  agent.finishTask(task.name + ' 完成');
  await wait(1200);
  if (!check()) return false;
  return true;
}

// ---------- 多任务轮换 ----------
async function runDemo() {
  const myRun = ++currentRunId;
  const isAborted = () => currentRunId !== myRun;
  const check = () => currentRunId === myRun;

  running = true;
  clock.paused = false;
  updateButtons();

  // 重置一切（位置 / 命中清单 / 任务进度 / 报告 / 对话）
  agent.reset();
  world.render(archMode);
  ui.build();
  ui.setArch(archMode);
  ui.renderControls(agent, onSettingsChange); // 主人条件可调，改完立即重算
  ui.setState(STATES.IDLE);
  ui.setTask(null);
  ui.setStore('—');
  ui.showPurchaseStage(null);
  ui.clearDialogue();
  ui.hidePanel();
  dialogueEl.classList.add('hidden');

  const total = agent.tasks.length;

  for (let i = 0; i < total; i++) {
    if (!check()) return;
    const task = agent.beginTask(i);
    world.setActiveTask(i);
    ui.setTask(task, i, total, agent.preferences);
    ui.clearLists();
    ui.showPurchaseStage(null);
    const ok = await runTask(task, i, total, isAborted, check, archMode);
    if (!ok) return;
  }

  // ===== 全部任务完成：主人反馈 + 更新本地偏好 =====
  const lastTask = agent.tasks[total - 1];
  ui.pushMessage({ role: 'owner', type: 'text', text: dialogue.ownerFeedbackMessage() });
  ui.log('主人给出反馈。');
  await wait(1500);
  if (!check()) return;
  agent.applyOwnerFeedback();
  ui.updatePreferences(agent);
  ui.pushMessage({ role: 'star', type: 'text', text: dialogue.buildFeedbackAck(agent) });

  // 反馈必须真正影响后续推荐：用更新后的偏好重新计算并展示前后差异
  const recomputed = agent.recomputeAfterFeedback(PRODUCTS);
  ui.showRecompute(recomputed);
  ui.pushMessage({
    role: 'star',
    type: 'text',
    text: dialogue.buildRecomputeMessage(recomputed),
  });
  ui.renderControls(agent, onSettingsChange);
  ui.log(
    `按新偏好重算完成：${recomputed.before ? recomputed.before.recName : '—'} → ${
      recomputed.after.recName
    }（${recomputed.changed ? '推荐已变化' : '推荐未变，分数提升'}）`
  );
  await wait(3000);
  if (!check()) return;

  ui.pushMessage({ role: 'star', type: 'text', text: dialogue.buildFinalSummary(agent) });
  ui.log(`主人反馈已写入本地偏好：${agent.preferences.extraPriority.join('、') || '（无）'}。`);
  if (lastTask) {
    ui.log('全部任务执行完毕。');
  }

  agent.setState(STATES.COMPLETED);
  ui.setState(STATES.COMPLETED);
  running = false;
  updateButtons();
}

// ---------- 访问地址浮层（本机 / 局域网） ----------
function setupNetHint() {
  const hint = document.getElementById('net-hint');
  const localEl = document.getElementById('nh-local');
  const netEl = document.getElementById('nh-net');
  const closeEl = document.getElementById('nh-close');
  if (!hint || !localEl || !netEl) return;

  const port = location.port || (location.protocol === 'https:' ? '443' : '80');
  const host = location.hostname;
  const localURL = `http://127.0.0.1:${port}/`;
  // 如果已经是经局域网 IP/域名访问，就直接回显真实地址；否则提示用本机局域网 IP 替换
  const netURL =
    host === '127.0.0.1' || host === 'localhost' || host === '[::1]'
      ? `http://<本机局域网IP>:${port}/`
      : `${location.protocol}//${host}:${port}/`;
  localEl.textContent = localURL;
  netEl.textContent = netURL;

  if (closeEl) closeEl.addEventListener('click', () => hint.classList.add('hidden'));
}

// ---------- 初始静态世界 ----------
function init() {
  world.render(archMode);
  ui.build();
  ui.setArch(archMode);
  ui.renderControls(agent, onSettingsChange);
  ui.setState(STATES.IDLE);
  ui.setTask(null);
  dialogueEl.classList.add('hidden');
  ui.hidePanel();
  setupNetHint();
  updateButtons();
}

init();
