/* ======================================================================
   ENGINE: dữ liệu mô phỏng khi không gọi được Binance
   ====================================================================== */
'use strict';
/* ---------- Dữ liệu mô phỏng khi không gọi được Binance ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function genDemo(sym, tfMs, n) {
  n = n || 1000;
  let seed = 7;
  for (const ch of sym) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = mulberry32(seed);
  const gauss = () => { let u = 0, w = 0; while (!u) u = rnd(); while (!w) w = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w); };
  let p = Math.exp(0.5 + rnd() * 8);
  const sigma = 0.006 * Math.sqrt(tfMs / 3600000);
  const base = Math.floor(Date.now() / tfMs) * tfMs;
  let drift = 0, left = 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    if (left <= 0) { drift = (rnd() - 0.5) * sigma * 0.5; left = 40 + Math.floor(rnd() * 80); }
    left--;
    const o = p;
    const cc = o * Math.exp(drift + sigma * gauss());
    const hh = Math.max(o, cc) * (1 + Math.abs(gauss()) * sigma * 0.4);
    const ll = Math.min(o, cc) * (1 - Math.abs(gauss()) * sigma * 0.4);
    const v = 1000 * (1 + Math.abs(gauss())) * (rnd() < 0.06 ? 3 : 1);
    out.push({ t: base - (n - i) * tfMs, o, h: hh, l: ll, c: cc, v });
    p = cc;
  }
  return out;
}
