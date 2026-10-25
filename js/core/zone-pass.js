/* ======================================================================
   CORE: quét vùng (dùng chung cho Order Block và FVG)
   Theo dõi vùng đang sống, chạm lần đầu, vô hiệu khi đóng cửa thủng vùng, và đánh dấu nến đang nằm trong vùng.
   ====================================================================== */
'use strict';
function zonePass(n, o, h, l, c, ind, create, type, pts, txtFn, add, vArr, list) {
  const act = [];
  for (let i = 1; i < n; i++) {
    const atr = ind.atr[i];
    for (const z of act) {
      if (z.dead) continue;
      const buy = z.side === 'buy';
      if (i - z.i0 > 150) { z.dead = true; z.end = z.end == null ? i : z.end; continue; }
      if (buy ? c[i] < z.lo : c[i] > z.hi) { z.dead = true; z.end = i; continue; }
      if (!z.touched && i > z.i0 && (buy ? l[i] <= z.hi : h[i] >= z.lo)) {
        z.touched = true; z.end = i;
        const hold = buy ? (c[i] > z.mid && c[i] > o[i]) : (c[i] < z.mid && c[i] < o[i]);
        if (hold && isN(atr)) add(i, z.side, type, pts, txtFn(z));
      }
    }
    if (isN(atr)) for (const z of create(i, atr)) {
      if (act.some(a => a.k === z.k && a.side === z.side)) continue;
      z.i0 = i; z.touched = false; z.dead = false; z.end = null; z.mid = (z.lo + z.hi) / 2;
      act.push(z); list.push(z);
    }
    let b = 0;
    for (const z of act) {
      if (z.dead || (z.touched && z.end !== i)) continue;
      if (z.side === 'buy' && l[i] <= z.hi && c[i] >= z.lo) b += 1;
      else if (z.side === 'sell' && h[i] >= z.lo && c[i] <= z.hi) b -= 1;
    }
    vArr[i] = b > 0 ? 1 : b < 0 ? -1 : 0;
  }
}
