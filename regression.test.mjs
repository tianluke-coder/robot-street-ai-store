// regression.test.mjs
// 第二轮回归测试：在 jsdom 中真实跑完整套演示（统一平台模式 / 独立站点模式），
// 校验架构展示、三任务流程、预算与授权是否真实影响结果、暂停/继续/重播、无运行时错误。
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

// ---------- 虚拟时钟：把动画/等待压缩到毫秒级 ----------
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
  if (cond) { pass++; lines.push('  \u2713 ' + label); }
  else { fail++; lines.push('  \u2717 ' + label + (extra ? '  << ' + extra : '')); }
}
function group(name) { lines.push(''); lines.push('[' + name + ']'); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => w.document.querySelector(s);
const txt = (s) => { const e = $(s); return e ? e.textContent : ''; };
const stateText = () => txt('#ui-state');
const logCount = () => { const e = $('#ui-log'); return e ? e.children.length : 0; };

// 采集运行过程中出现过的文本（面板会被覆盖，必须边跑边采样）
const SELECTORS = ['#ui-state', '#ui-task', '#ui-store', '#ui-purchase', '#ui-log', '#world-panel', '#dialogue', '#ui-extra', '#arch-mode-name', '#arch-note', '#arch-disclaimer', '#ui-modecmp', '#ui-controls'];
let snaps = [];
let lastSnap = '';
function collect() {
  let t = '';
  for (const s of SELECTORS) t += (txt(s) || '') + '\n';
  if (t !== lastSnap) { snaps.push(t); lastSnap = t; }
}
const collector = setInterval(collect, 2);
let startIdx = 0;
// 采样时先记录一次“运行前”的界面，之后断言只看运行过程中新出现的文本，
// 避免上一轮残留内容（例如上一条订单号）混进本轮判断。
const resetSnap = () => { collect(); startIdx = snaps.length; };
const allText = () => snaps.slice(startIdx).join('\n');
const hasText = (needle, label) => ok(allText().includes(needle), label);

async function waitFor(pred, label, timeout = 90000) {
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
  if (!el) { errors.push('click: element not found'); return; }
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

async function runFull(mode) {
  click(mode === 'p2p' ? '#mode-p2p' : '#mode-platform');
  await sleep(20);
  resetSnap();
  click(btnStart);
  await waitFor(() => stateText().includes('任务完成'), mode + ' 模式：三任务跑完');
  await sleep(20);
  collect();
}

// =========================================================
group('1. 架构面板 · 初始（统一平台模式）');
ok(txt('#arch-mode-name').includes('统一平台模式'), '模式名为「统一平台模式」', txt('#arch-mode-name'));
ok(!txt('#arch-mode-name').includes('中心'), '不再使用旧名「中心模式」');
ok(txt('#arch-disclaimer').includes('架构概念模拟') && txt('#arch-disclaimer').includes('不代表真实网络通信'), '架构图已标注「概念模拟」免责说明');
ok($('#arch-diagram [data-key="hub"]') !== null, '架构图含平台网关节点 hub');
ok($('#arch-diagram [data-key="store-robot"]') !== null && $('#arch-diagram [data-key="store-digital"]') !== null && $('#arch-diagram [data-key="store-life"]') !== null, '架构图含三家商店节点');
ok(txt('#ui-modecmp').includes('统一平台') && txt('#ui-modecmp').includes('独立站点'), '模式说明面板列出两种模式对比');
ok(txt('#ui-modecmp').includes('真正执行的程序逻辑') && txt('#ui-modecmp').includes('仅架构模拟'), '模式说明区分「真实执行」与「架构模拟」');

// =========================================================
w.localStorage.clear(); // 清空访问历史，验证「首次访问」语义
group('2. 统一平台模式 · 三任务完整执行');
await runFull('platform');
hasText('DISCOVER_STORES', '平台模式执行了服务发现 DISCOVER_STORES');
hasText('STORE_DIRECTORY', '平台模式收到 STORE_DIRECTORY 商户目录');
hasText('PLATFORM_ISSUED', '下单授权由平台授权中心签发（PLATFORM_ISSUED）');
hasText('【任务 1/3】', '任务 1 已执行');
hasText('【任务 2/3】', '任务 2 已执行');
hasText('【任务 3/3】', '任务 3 已执行');
hasText('首次访问，暂无历史对照', '新品任务：首次访问明确声明无历史对照');
hasText('当前上架新品', '新品任务：显示「当前上架新品」语义');
ok(txt('#ui-purchase').includes('模拟完成'), '采购最终状态为「模拟完成」', txt('#ui-purchase').slice(0, 60));
ok(/ORD-\d{8}-\d{3}/.test(allText()), '生成了模拟订单号（非真实支付）');
hasText('授权归属：平台授权中心', '日志标明授权归属为平台授权中心');
hasText('按新偏好重算完成', '主人反馈后重新计算并输出结论');
ok(!allText().includes('未获批准'), '默认条件下采购未被误拒');

// =========================================================
group('3. 主人改条件后即时重算');
setNumber('#set-budget', 60);
await sleep(30);
hasText('条件已更新：硬性预算 ￥60', '改预算后面板即时记录并重算');
setCheck('#set-assembly', true);
await sleep(30);
hasText('动手组装', '勾选「动手组装」后写入优先条件');
setNumber('#set-budget', 100);
setCheck('#set-assembly', false);
await sleep(30);

// =========================================================
group('4. 硬性预算超限时不得推荐/下单');
resetSnap();
setNumber('#set-budget', 50); // 目标商品 ￥89 > 50
await runFull('platform');
ok(txt('#ui-purchase').includes('超出硬性预算'), '采购状态为「超出硬性预算 · 不作推荐」', txt('#ui-purchase').slice(0, 60));
ok(!/ORD-\d{8}-\d{3}/.test(allText()), '超预算时没有生成任何订单');
hasText('超出硬性预算 ￥50', '日志说明该商品超出硬性预算');
hasText('采购流程终止', '超预算后采购流程终止，不进入下单');

// =========================================================
group('5. 未授予下单权限时不得进入完成');
setNumber('#set-budget', 100);
await sleep(20);
click('#set-auth'); // 关闭授权
await sleep(30);
ok(txt('#set-auth').includes('未授予'), '授权开关已切换为「未授予」');
await runFull('platform');
ok(txt('#ui-purchase').includes('未批准'), '采购状态为「未批准 · 不进入下单」', txt('#ui-purchase').slice(0, 60));
ok(!/ORD-\d{8}-\d{3}/.test(allText()), '未获授权时没有生成订单');
hasText('未获批准', '日志说明未获批准，不进入下单');
click('#set-auth'); // 恢复授权
await sleep(30);
ok(txt('#set-auth').includes('已授予'), '授权已恢复为「已授予」');

// =========================================================
group('6. 暂停 / 继续 / 重播');
click('#mode-platform');
await sleep(20);
resetSnap();
click(btnStart);
await waitFor(() => allText().includes('接受任务') || logCount() > 2, '演示已启动');
click(btnPause);
await sleep(20);
const pausedCount = logCount();
const pauseLabel = txt('#btn-pause');
await sleep(500); // 真实等待 500ms
const stillCount = logCount();
ok(pauseLabel.includes('继续'), '暂停后按钮变为「继续」', pauseLabel);
ok(stillCount === pausedCount, '暂停期间不再推进（日志条数不变）', pausedCount + ' -> ' + stillCount);
click(btnPause);
await sleep(20);
await waitFor(() => logCount() > pausedCount, '继续后重新推进');
ok(logCount() > pausedCount, '继续后流程恢复推进');
click(btnReplay);
await sleep(20);
ok(logCount() <= 2, '重播清空了行动记录', String(logCount()));
await waitFor(() => stateText().includes('任务完成'), '重播：三任务再次跑完');
ok(stateText().includes('任务完成'), '重播后同样走到「任务完成」');

// =========================================================
group('7. 独立站点模式 · 三任务完整执行');
click('#mode-p2p');
await sleep(30);
ok(txt('#arch-mode-name').includes('独立站点模式'), '模式名为「独立站点模式」', txt('#arch-mode-name'));
ok(!txt('#arch-mode-name').includes('去中心'), '不再使用旧名「去中心模式」');
ok($('#arch-diagram [data-key="hub"]') === null, '独立站点模式架构图没有平台网关节点');
ok($('#arch-diagram [data-key="store-robot"]') !== null, '独立站点模式仍保留三家商店节点');
await runFull('p2p');
hasText('SELF_VERIFIED', '下单校验为分身自行校验（SELF_VERIFIED）');
ok(!allText().includes('DISCOVER_STORES'), '独立站点模式不做平台服务发现');
ok(!allText().includes('STORE_DIRECTORY'), '独立站点模式没有统一商户目录');
hasText('无统一平台', '日志说明按预设清单分别访问独立端点');
hasText('授权归属：数字分身自行校验', '日志标明授权归属为分身自行校验');
hasText('自上次访问后新增 0 件', '有历史时正确区分「自上次访问后新增」为 0 件');
ok(txt('#ui-purchase').includes('模拟完成'), '独立站点模式下相同条件同样完成采购');
ok(/ORD-\d{8}-\d{3}/.test(allText()), '独立站点模式生成模拟订单号');
hasText('【任务 3/3】', '独立站点模式同样执行了三个任务');

// =========================================================
group('8. 运行时错误');
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
