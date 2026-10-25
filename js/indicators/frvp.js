/* ======================================================================
   FRVP (Fixed Range Volume Profile)
   Chỉ để XEM: không tính vào điểm, tín hiệu hay backtest. Kết quả: A.frvp (POC, VAH, VAL, histogram).
   ====================================================================== */
'use strict';
/* ---------- FRVP (Fixed Range Volume Profile): chỉ để XEM, không tính vào điểm, tín hiệu hay backtest ----------
   Profile của nhịp xu hướng hiện tại trên từng khung: xu hướng tăng (đáy sau cao hơn đáy trước) thì lấy từ đáy đầu chuỗi đáy nâng dần tới đỉnh cao nhất đã đạt;
   xu hướng giảm thì từ đỉnh đầu chuỗi đỉnh hạ dần tới đáy thấp nhất đã đạt. Đi ngang hoặc nhịp nhỏ hơn 3 ATR / ngắn hơn 15 nến thì không có profile.
   Rải khối lượng mỗi nến đều lên các mức giá nó chạm (40 mức). POC = mức nhiều khối lượng nhất, VAL..VAH = dải quanh POC chứa 70% khối lượng. */
function frvpCalc(a, i, h, l, v) {
  const NB = 40;
  let hi = -Infinity, lo = Infinity;
  for (let k = a; k <= i; k++) { if (h[k] > hi) hi = h[k]; if (l[k] < lo) lo = l[k]; }
  if (!(hi > lo)) return null;
  const bs = (hi - lo) / NB, vol = new Array(NB).fill(0);
  for (let k = a; k <= i; k++) {
    const lb = Math.min(NB - 1, Math.floor((l[k] - lo) / bs)), hb = Math.min(NB - 1, Math.floor((h[k] - lo) / bs));
    const per = (v[k] || 0) / (hb - lb + 1);
    for (let b = lb; b <= hb; b++) vol[b] += per;
  }
  let pb = 0, tot = 0;
  for (let b = 0; b < NB; b++) { tot += vol[b]; if (vol[b] > vol[pb]) pb = b; }
  if (!(tot > 0)) return null;
  let acc = vol[pb], lb = pb, hb = pb;
  while (acc < 0.7 * tot && (lb > 0 || hb < NB - 1)) {
    const dn = lb > 0 ? vol[lb - 1] : -1, up = hb < NB - 1 ? vol[hb + 1] : -1;
    if (up >= dn) { hb++; acc += vol[hb]; } else { lb--; acc += vol[lb]; }
  }
  return { a, i, lo, hi, bs, NB, vol, pocB: pb, poc: lo + (pb + 0.5) * bs, vah: lo + (hb + 1) * bs, val: lo + lb * bs, tot };
}
function frvpTrend(zzp, h, l, v, atrA, n) {
  const i = n - 1;
  if (!zzp || n < 60 || !isFinite(atrA[i])) return null;
  let pi = -1;
  while (pi + 1 < zzp.length && zzp[pi + 1].conf <= i) pi++;
  const prevSame = k => { for (let m = k - 1; m >= 0; m--) if (zzp[m].t === zzp[k].t) return m; return -1; };
  let L1 = -1, H1 = -1;
  for (let k = pi; k >= 0 && (L1 < 0 || H1 < 0); k--) { if (zzp[k].t === 'L' && L1 < 0) L1 = k; if (zzp[k].t === 'H' && H1 < 0) H1 = k; }
  const L2 = L1 >= 0 ? prevSame(L1) : -1, H2 = H1 >= 0 ? prevSame(H1) : -1;
  const hl = L2 >= 0 && zzp[L1].p > zzp[L2].p, lh = H2 >= 0 && zzp[H1].p < zzp[H2].p;
  if (hl === lh) return null;
  let k = hl ? L1 : H1;
  while (prevSame(k) >= 0 && (hl ? zzp[prevSame(k)].p < zzp[k].p : zzp[prevSame(k)].p > zzp[k].p)) k = prevSame(k);
  const a = Math.max(zzp[k].j, i - 400);
  let e = a;
  for (let q = a; q <= i; q++) if (hl ? h[q] > h[e] : l[q] < l[e]) e = q;
  if (e - a + 1 < 15) return null;
  const P = frvpCalc(a, e, h, l, v);
  if (!P || !(P.hi - P.lo >= 3 * atrA[i])) return null;
  P.tr = hl ? 1 : -1; P.e = e;
  return P;
}

(function () {


  Indicators.register({
    id: 'frvp', label: 'FRVP',
    order: { result: 30, under: 40 },
    layer: { key: 'frvp', label: 'FRVP', on: 1, order: 60 },
    drawWhere: 'under',

    result(ctx, res) {
      const { h, l, v, n, ind, zz } = ctx;
      res.frvp = frvpTrend(zz.piv, h, l, v, ind.atr, n);
    },

    draw(R) {
      const { g, x, py, i0, i1, bw, plotW, priceH, hi, lo, n, C, A, ind, S, V, COL, zr } = R;
      if(S.L.frvp&&A.frvp){
        const fr=A.frvp,mx=Math.max.apply(null,fr.vol)||1,xa=Math.max(0,x(fr.a)),mw=Math.min(130,plotW*0.25);
        g.save();
        for(let b=0;b<fr.NB;b++){
          const e1=fr.lo+(b+1)*fr.bs,e0=fr.lo+b*fr.bs,y1=py(e1),y2=py(e0);if(y2<0||y1>priceH) continue;
          g.fillStyle=b===fr.pocB?'rgba(217,130,43,.45)':(e1>fr.val+1e-9&&e0<fr.vah-1e-9)?'rgba(75,70,184,.22)':'rgba(91,107,122,.16)';
          g.fillRect(xa,y1,fr.vol[b]/mx*mw,Math.max(1,y2-y1-1));
        }
        g.font='11px sans-serif';g.textBaseline='bottom';g.textAlign='right';
        for(const [p,lab,col,dash] of [[fr.poc,'POC','#D9822B',false],[fr.vah,'VAH','#4B46B8',true],[fr.val,'VAL','#4B46B8',true]]){
          const y=py(p);g.strokeStyle=col;g.lineWidth=lab==='POC'?1.6:1.2;g.setLineDash(dash?[6,3]:[]);g.beginPath();g.moveTo(xa,y);g.lineTo(plotW,y);g.stroke();g.setLineDash([]);
          g.fillStyle=col;g.fillText(lab+' '+fmt(p),plotW-4,y-2);
        }
        g.fillStyle='#4B46B8';g.textAlign='left';g.textBaseline='top';g.fillText('FRVP '+(fr.tr>0?'nhịp tăng':'nhịp giảm'),xa+4,4);
        g.restore();
      }
    }
  });
})();
