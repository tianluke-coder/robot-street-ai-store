// regression.test.mjs
// v0.3 回归测试：在 jsdom 中真实跑双世界实验（人类顾客线下 + 小星线上并行），
// 校验双世界布局、双状态机并行、未来的商店观察、三个实验任务、汇合决策与线下反馈、
// 架构模式切换、暂停/继续，以及全程无运行时错误。
// 运行：npm test   （依赖 devDependency: jsdom）

import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = process.cwd();
const errors = [];

const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const html = fs.readFileSync(ROOT + '/index.html', 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost/',
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const w = dom.window;

// ---------- 虚拟时钟：把动画/等待压缩 ----------
let vnow = 0;
w.performance.now = () => vnow;
w.requestAnimationFrame = (cb) => w.setTimeout(() => { vnow += 60; cb(vnow); }, 0);
w.cancelAnimationFrame = (id) => w.clearTimeout(id);

// ---------- 把浏览器全局注入 Node，供 ESM 源码直接 import ----------
const def = (k, v) => Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true });
def('window', w);
def('document', w.document);
def('navigator', w.navigator);
def('location', w.location);
def('localStorage', w.localStorage);
def('performance', w.performance);
def('requestAnimationFrame', w.requestAnimationFrame);
def('cancelAnimationFrame', w.cancelAnimationFrame);
for (const k of ['Element', 'Node', 'SVGElement', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'HTMLElement', 'DOMParser']) {
  if (w[k]) def(k, w[k]);
}

w.addEventListener('error', (e) => errors.push('window.error: ' + (e.message || '')));
process.on('unhandledRejection', (r) => errors.push('unhandledRejection: ' + String(r)));

// ---------- 断言工具 ----------
let pass = 0;
let fail = 0;
const lines = [];
function ok(cond, label, extra) {
  if (cond) { pass++; lines.push('  ✓ ' + label); }
  else { fail++; lines.push('  ✗ ' + label + (extra ? '  << ' + extra : '')); }
}
function group(name) { lines.push(''); lines.push('[' + name + ']'); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => w.document.querySelector(s);
const txt = (s) => { const e = $(s); return e ? e.textContent : ''; };
const humanState = () => txt('#human-state');
const starState = () => txt('#star-state');
const humanLogCount = () => { const e = $('#human-log'); return e ? e.children.length : 0; };
const starLogCount = () => { const e = $('#star-log'); return e ? e.children.length : 0; };

// 采集运行过程中出现过的文本（面板会被覆盖，必须边跑边采样）
const SELECTORS = [
  '#human-state', '#human-time', '#human-place', '#star-state', '#star-time', '#star-store',
  '#human-log', '#star-log', '#world-panel', '#dialogue', '#future-store',
  '#arch-mode-name', '#arch-note', '#arch-disclaimer', '#ui-modecmp', '#ui-controls', '#decision',
];
let snaps = [];
let lastSnap = '';
function collect() {
  let t = '';
  for (const s of SELECTORS) t += (txt(s) || '') + '\n';
  if (t !== lastSnap) { snaps.push(t); lastSnap = t; }
}
const collector = setInterval(collect, 2);
let startIdx = 0;
const resetSnap = () => { collect(); startIdx = snaps.length; };
const allText = () => snaps.slice(startIdx).join('\n');
const hasText = (needle, label) => ok(allText().includes(needle), label);

async function waitFor(pred, label, timeout = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (pred()) return true;
    await sleep(4);
  }
  errors.push('TIMEOUT: ' + label);
  return false;
}
function click(elOrSel) {
  const el = typeof elOrSel === 'string' ? $(elOrSel) : elOrSel;
  if (!el) { errors.push('click: element not found ' + elOrSel); return; }
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
}
function setNumber(sel, v) {
  const el = $(sel);
  if (!el) { errors.push('setNumber: ' + sel + ' not found'); return; }
  el.value = String(v);
  el.dispatchEvent(new w.Event('change', { bubbles: true }));
}
function setCheck(sel, v) {
  const el = $(sel);
  if (!el) { errors.push('setCheck: ' + sel + ' not found'); return; }
  el.checked = v;
  el.dispatchEvent(new w.Event('change', { bubbles: true }));
}

// ---------- 启动应用 ----------
await import('file://' + ROOT + '/src/main.js');
await sleep(30);

const btnStart = $('#btn-start');
const btnPause = $('#btn-pause');
const btnReplay = $('#btn-replay');

// 选中某实验并运行到「汇合」
async function runExperiment(expBtnId, mode) {
  if (mode === 'p2p') click('#mode-p2p');
  else click('#mode-platform');
  await sleep(20);
  click(expBtnId); // 选中实验 + resetScene
  await sleep(30);
  resetSnap();
  click(btnStart);
  await waitFor(() => starState().includes('任务完成'), expBtnId + ' 双世界跑完');
  await sleep(30);
  collect();
}

// =========================================================
group('1. 架构面板 · 初始（统一平台模式）与双世界布局');
ok(txt('#arch-mode-name').includes('统一平台模式'), '模式名为「统一平台模式」', txt('#arch-mode-name'));
ok(!txt('#arch-mode-name').includes('中心'), '不再使用旧名「中心模式」');
ok($('#arch-diagram [data-key="hub"]') !== null, '架构图含平台网关节点 hub');
ok(
  $('#arch-diagram [data-key="store-robot"]') !== null &&
    $('#arch-diagram [data-key="store-digital"]') !== null &&
    $('#arch-diagram [data-key="store-life"]') !== null,
  '架构图含三家商店节点'
);
ok(txt('#ui-modecmp').includes('统一平台') && txt('#ui-modecmp').includes('独立站点'), '模式说明面板列出两种模式对比');
ok(
  txt('#ui-modecmp').includes('真正执行的程序逻辑') && txt('#ui-modecmp').includes('仅架构模拟'),
  '模式说明区分「真实执行」与「架构模拟」'
);
// 双世界布局：左线下街区 + 右线上世界
ok($('#street') !== null && $('#world') !== null, '页面同时存在线下街区(#street)与线上世界(#world)两个世界');
ok(w.document.querySelector('#street-human') !== null, '线下街区有「人类顾客」角色（非机器人具身）');
// 免责声明：架构概念模拟（本地程序 / 预设规则，不代表真实网络通信）
ok(
  txt('#ui-disclaimer').includes('架构概念模拟') &&
    txt('#ui-disclaimer').includes('本地程序') &&
    txt('#ui-disclaimer').includes('不代表真实网络通信'),
  '说明与免责：架构概念模拟（本地程序运行，不代表真实网络通信）', txt('#ui-disclaimer')
);
ok(txt('#future-store').includes('实验A') || txt('#future-store').includes('比价'), '初始默认选中实验A并显示说明');

// =========================================================
group('2. 实验A · 比价：双世界并行、同店双界面、不同耗时、汇合');
await runExperiment('#exp-a', 'platform');
ok(humanLogCount() > 0, '左侧人类顾客有行动记录（线下的人）', String(humanLogCount()));
ok(starLogCount() > 0, '右侧小星有行动记录（线上的 AI）', String(starLogCount()));
ok(humanLogCount() > 0 && starLogCount() > 0, '两个世界并行各自产生记录（非单一世界）');
ok(txt('#future-store').includes('面向人类') && txt('#future-store').includes('面向 AI 智能体'), '未来商店观察：同一门店展示「面向人类 / 面向 AI 智能体」双列');
// 不同耗时：线下用「分钟」，线上用「秒」，两者数值不同
const hMin = parseInt(txt('#human-time'), 10);
const sSec = parseInt(txt('#star-time'), 10);
ok(!Number.isNaN(hMin) && hMin > 0, '线下模拟用时为「分钟」且 > 0', txt('#human-time'));
ok(!Number.isNaN(sSec) && sSec > 0, '线上模拟用时为「秒」且 > 0', txt('#star-time'));
ok(hMin !== sSec, '线下(分钟)与线上(秒)耗时表示不同（双计时器）', hMin + ' vs ' + sSec);
ok(!$('#decision').classList.contains('hidden') && txt('#decision').includes('双世界汇合'), '双世界汇合区出现主人决策界面');
hasText('线上比价结果', '（实验A为比价）面板含线上比价结果（可解释评分）');

// =========================================================
group('3. 实验B · 发现新品');
await runExperiment('#exp-b', 'platform');
ok(humanLogCount() > 0 && starLogCount() > 0, '实验B 双世界并行跑完');
hasText('当前上架新品', '实验B 线上小星列出「当前上架新品」');
hasText('自上次访问后新增', '实验B 区分「自上次访问后新增」语义');

// =========================================================
group('4. 实验C · 采购与体验决策 + 线下反馈影响判断');
await runExperiment('#exp-c', 'platform');
ok(!$('#decision').classList.contains('hidden'), '实验C 汇合决策区出现');
hasText('授权校验', '实验C 线上小星完成采购授权校验');
// 点击「把线下体验反馈给小星」
const fbBtn = $('#dec-feedback');
ok(fbBtn !== null, '实验C 汇合区提供「把线下体验反馈给小星」按钮');
if (fbBtn) {
  click(fbBtn);
  await sleep(20);
  ok(txt('#dec-fb-result').includes('重新计算') || txt('#dec-fb-result').includes('变为'), '线下反馈后小星重新计算（推荐变化）', txt('#dec-fb-result').slice(0, 60));
}
// 主人最终决定：继续调查（与 masterDecision 一致）
const contBtn = w.document.querySelector('#decision .dec-btn[data-choice="继续调查"]');
ok(contBtn !== null, '汇合区提供主人最终决定按钮（购买/预约/继续调查/放弃）');
if (contBtn) {
  click(contBtn);
  await sleep(20);
  ok(txt('#dec-final').includes('继续调查'), '主人决定「继续调查」并记录', txt('#dec-final'));
}

// =========================================================
group('5. 架构模式切换 · 只影响右侧线上');
// 记录切换前的左侧状态（模式不应改变线下）
const humanBefore = humanState();
click('#mode-p2p');
await sleep(30);
ok(txt('#arch-mode-name').includes('独立站点模式'), '模式切换为「独立站点模式」', txt('#arch-mode-name'));
ok(!txt('#arch-mode-name').includes('去中心'), '不再使用旧名「去中心模式」');
ok($('#arch-diagram [data-key="hub"]') === null, '独立站点模式架构图没有平台网关节点');
ok(humanState() === humanBefore, '切换模式不影响左侧线下（人类顾客状态保持不变）', humanState());
click('#mode-platform');
await sleep(30);
ok($('#arch-diagram [data-key="hub"]') !== null, '切回统一平台模式架构图恢复 hub 节点');

// =========================================================
group('6. 暂停 / 继续');
click('#exp-a');
await sleep(20);
click(btnStart);
await waitFor(() => starLogCount() > 2, '演示已启动');
click(btnPause);
await sleep(20);
const pauseLabel = txt('#btn-pause');
const timeAtPause = parseInt(txt('#star-time'), 10);
await sleep(500);
const timeAfterWait = parseInt(txt('#star-time'), 10);
ok(pauseLabel.includes('继续'), '暂停后按钮变为「继续」', pauseLabel);
ok(timeAfterWait === timeAtPause, '暂停期间模拟用时不再推进', timeAtPause + ' -> ' + timeAfterWait);
click(btnPause);
await sleep(20);
await waitFor(() => parseInt(txt('#star-time'), 10) > timeAtPause, '继续后模拟用时恢复推进');
ok(parseInt(txt('#star-time'), 10) > timeAtPause, '继续后流程恢复推进');
click(btnReplay);
await sleep(20);
await waitFor(() => starState().includes('任务完成'), '重播：双世界再次跑完');
ok(starState().includes('任务完成'), '重播后同样走到「任务完成」');

// =========================================================
group('7. 运行时错误');
ok(errors.length === 0, '整个过程无运行时错误 / 未捕获异常', errors.slice(0, 3).join(' | '));

clearInterval(collector);

console.log(lines.join('\n'));
console.log('');
console.log('结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项。');
if (errors.length) {
  console.log('错误明细：');
  for (const e of errors.slice(0, 10)) console.log('  - ' + e);
}
process.exit(fail ? 1 : 0);
