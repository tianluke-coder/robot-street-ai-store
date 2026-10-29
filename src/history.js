// src/history.js
// 访问历史：记录上一次访问的时间与当时已见过的商品。
// 用途：把「新品」的两种语义区分开——
//   当前上架新品   —— 商品数据里标记为新品（isNew）的全部商品
//   自上次访问后新增 —— 这次看到、但上次访问时还没出现过的新品
// 两者语义不同，界面上分开显示，不混为一谈。

const KEY = 'xiaoxing.visit.history.v1';

function emptyHistory() {
  return { lastVisitAt: null, seenProductIds: [] };
}

export function loadHistory() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyHistory();
    const o = JSON.parse(raw);
    return {
      lastVisitAt: o && o.lastVisitAt ? o.lastVisitAt : null,
      seenProductIds: o && Array.isArray(o.seenProductIds) ? o.seenProductIds : [],
    };
  } catch (e) {
    return emptyHistory();
  }
}

export function saveVisit(seenProductIds, at) {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ lastVisitAt: at || new Date().toISOString(), seenProductIds })
    );
    return true;
  } catch (e) {
    return false;
  }
}

export function clearHistory() {
  try {
    window.localStorage.removeItem(KEY);
    return true;
  } catch (e) {
    return false;
  }
}

export function formatVisitTime(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
      d.getMinutes()
    )}`;
  } catch (e) {
    return null;
  }
}
