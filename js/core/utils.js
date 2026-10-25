/* ======================================================================
   CORE: hàm tiện ích dùng chung (không phải chỉ báo)
   NaNs, isN, fmt, sma, ema, rsiW, atrW. Sửa file này sẽ ảnh hưởng mọi chỉ báo.
   ====================================================================== */
'use strict';
const NaNs = n => new Array(n).fill(NaN);
const isN = v => typeof v === 'number' && !isNaN(v);

function fmt(p) {
  if (!isFinite(p)) return '–';
  const a = Math.abs(p);
  const d = a >= 1000 ? 2 : a >= 100 ? 3 : a >= 1 ? (globalThis.__fx ? 5 : 4) : a >= 0.1 ? 5 : a >= 0.01 ? 6 : 8;
  return p.toFixed(d);
}

function sma(a, n) {
  const o = NaNs(a.length);
  for (let i = n - 1; i < a.length; i++) {
    let s = 0, ok = true;
    for (let j = i - n + 1; j <= i; j++) {
      const v = a[j];
      if (!isN(v)) { ok = false; break; }
      s += v;
    }
    if (ok) o[i] = s / n;
  }
  return o;
}

function ema(a, n) {
  const out = NaNs(a.length), k = 2 / (n + 1);
  let cnt = 0, sum = 0, prev = NaN;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (!isN(v)) continue;
    if (!isN(prev)) {
      cnt++; sum += v;
      if (cnt === n) { prev = sum / n; out[i] = prev; }
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

function rsiW(c, n) {
  const out = NaNs(c.length);
  if (c.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) {
    const d = c[i] - c[i - 1];
    g += Math.max(d, 0); l += Math.max(-d, 0);
  }
  g /= n; l /= n;
  out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

function atrW(h, l, c, n) {
  const o = NaNs(h.length);
  if (h.length <= n) return o;
  const tr = [0];
  for (let i = 1; i < h.length; i++) {
    tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
  }
  let s = 0;
  for (let i = 1; i <= n; i++) s += tr[i];
  let a = s / n; o[n] = a;
  for (let i = n + 1; i < h.length; i++) { a = (a * (n - 1) + tr[i]) / n; o[i] = a; }
  return o;
}
