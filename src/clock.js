// src/clock.js
// 全局时钟：控制“暂停 / 继续”。所有动画与等待都通过该时钟判断是否被暂停，
// 从而保证暂停时数字分身的运动与定时步骤同时冻结，继续后从原处恢复。

export const clock = {
  paused: false,
};

// 暂停感知的等待：返回 Promise，在累计未暂停时间达到 ms 后 resolve。
export function wait(ms) {
  return new Promise((resolve) => {
    if (ms <= 0) return resolve();
    let remaining = ms;
    let last = performance.now();
    function tick() {
      const now = performance.now();
      if (!clock.paused) {
        remaining -= now - last;
      }
      last = now;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}
