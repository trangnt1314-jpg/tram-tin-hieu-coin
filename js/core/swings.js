/* ======================================================================
   CORE: đỉnh đáy fractal và ZigZag (nền cho Vùng giá, Elliott, Fibonacci)
   Không phải chỉ báo riêng, nhiều chỉ báo cùng dùng.
   ====================================================================== */
'use strict';
/* ---------- Vùng hỗ trợ / kháng cự từ đỉnh đáy fractal ---------- */
function fractals(h, l, n = 5) {
  const out = [];
  for (let j = n; j < h.length - n; j++) {
    let isH = true, isL = true;
    for (let k = 1; k <= n; k++) {
      if (h[j] <= h[j - k] || h[j] < h[j + k]) isH = false;
      if (l[j] >= l[j - k] || l[j] > l[j + k]) isL = false;
      if (!isH && !isL) break;
    }
    if (isH) out.push({ j, p: h[j], conf: j + n, t: 'H' });
    if (isL) out.push({ j, p: l[j], conf: j + n, t: 'L' });
  }
  return out;
}

/* ---------- ZigZag theo ATR (nền cho Elliott) ---------- */
function zigzag(h, l, atr, k) {
  const piv = [];
  let dir = 0, hi = NaN, hiI = -1, lo = NaN, loI = -1;
  for (let i = 0; i < h.length; i++) {
    if (!isN(atr[i])) continue;
    if (hiI < 0) { hi = h[i]; hiI = i; lo = l[i]; loI = i; continue; }
    const th = k * atr[i];
    if (dir === 0) {
      if (h[i] > hi) { hi = h[i]; hiI = i; }
      if (l[i] < lo) { lo = l[i]; loI = i; }
      if (h[i] - lo >= th && loI < i) {
        piv.push({ j: loI, p: lo, t: 'L', conf: i }); dir = 1; hi = h[i]; hiI = i;
      } else if (hi - l[i] >= th && hiI < i) {
        piv.push({ j: hiI, p: hi, t: 'H', conf: i }); dir = -1; lo = l[i]; loI = i;
      }
    } else if (dir === 1) {
      if (h[i] > hi) { hi = h[i]; hiI = i; }
      else if (hi - l[i] >= th) {
        piv.push({ j: hiI, p: hi, t: 'H', conf: i }); dir = -1; lo = l[i]; loI = i;
      }
    } else {
      if (l[i] < lo) { lo = l[i]; loI = i; }
      else if (h[i] - lo >= th) {
        piv.push({ j: loI, p: lo, t: 'L', conf: i }); dir = 1; hi = h[i]; hiI = i;
      }
    }
  }
  const tent = dir === 1 ? { j: hiI, p: hi, t: 'H' } : dir === -1 ? { j: loI, p: lo, t: 'L' } : null;
  return { piv, tent };
}
