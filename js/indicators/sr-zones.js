/* ======================================================================
   Vùng hỗ trợ / kháng cự (từ đỉnh đáy fractal)
   Cung cấp: ctx.piv (fractal 5 nến) và kết quả A.zonesNow.
   Tín hiệu: chạm vùng rồi bật lại, hoặc phá vùng kèm volume lớn.
   ====================================================================== */
'use strict';
function zonesAt(piv, i, atrI, maxBack = 300) {
  if (!isN(atrI)) return [];
  const ps = [];
  for (const q of piv) {
    if (q.conf > i) break;
    if (q.j >= i - maxBack) ps.push(q);
  }
  ps.sort((a, b) => a.p - b.p);
  const tol = 0.7 * atrI;
  const zs = [];
  let cur = null;
  for (const q of ps) {
    if (cur && q.p - cur.max <= tol && q.p - cur.min <= 3 * tol) {
      cur.max = q.p; cur.n++; cur.sum += q.p;
    } else {
      if (cur) zs.push(cur);
      cur = { min: q.p, max: q.p, n: 1, sum: q.p };
    }
  }
  if (cur) zs.push(cur);
  return zs.filter(z => z.n >= 2).map(z => ({
    lo: z.min - 0.1 * atrI, hi: z.max + 0.1 * atrI, mid: z.sum / z.n, touches: z.n
  }));
}

(function () {


  Indicators.register({
    id: 'sr', label: 'Vùng giá',
    order: { bar: 30, under: 10 },
    layer: { key: 'zones', label: 'Vùng giá', on: 1, order: 30 },
    drawWhere: 'under',

    signalAt(ctx, i, add) {
      const { o, h, l, c, v, ind, piv } = ctx;
      const atr = ind.atr[i];
      if (isN(atr)) {
        const zs = zonesAt(piv, i, atr);
        const spike = isN(ind.volSma[i]) && v[i] > 1.5 * ind.volSma[i];
        let bestBuy = null, bestSell = null;
        for (const z of zs) {
          const rng = `${fmt(z.lo)}–${fmt(z.hi)}`;
          if (z.mid < c[i] && l[i] <= z.hi + 0.1 * atr && l[i] >= z.lo - 0.6 * atr && c[i] > z.hi && c[i] > o[i]) {
            if (!bestBuy || z.touches > bestBuy.touches)
              bestBuy = { touches: z.touches, txt: `Giá chạm vùng hỗ trợ ${rng} (đã phản ứng ${z.touches} lần) rồi đóng cửa trên vùng bằng nến xanh: lực mua đang bảo vệ vùng này` };
          }
          if (z.mid > c[i] && h[i] >= z.lo - 0.1 * atr && h[i] <= z.hi + 0.6 * atr && c[i] < z.lo && c[i] < o[i]) {
            if (!bestSell || z.touches > bestSell.touches)
              bestSell = { touches: z.touches, txt: `Giá chạm vùng kháng cự ${rng} (đã bị từ chối ${z.touches} lần) rồi đóng cửa dưới vùng bằng nến đỏ: phe bán đang chặn giá` };
          }
          if (spike && c[i] > z.hi && c[i - 1] <= z.hi && c[i] > o[i]) {
            if (!bestBuy || z.touches > bestBuy.touches)
              bestBuy = { touches: z.touches, txt: `Phá vỡ kháng cự ${rng} với volume gấp ${(v[i] / ind.volSma[i]).toFixed(1)} lần trung bình: kháng cự cũ có thể chuyển thành hỗ trợ` };
          }
          if (spike && c[i] < z.lo && c[i - 1] >= z.lo && c[i] < o[i]) {
            if (!bestSell || z.touches > bestSell.touches)
              bestSell = { touches: z.touches, txt: `Thủng hỗ trợ ${rng} với volume gấp ${(v[i] / ind.volSma[i]).toFixed(1)} lần trung bình: hỗ trợ cũ có thể chuyển thành kháng cự` };
          }
        }
        if (bestBuy) add(i, 'buy', 'sr', 1.5, bestBuy.txt);
        if (bestSell) add(i, 'sell', 'sr', 1.5, bestSell.txt);
      }
    },

    result(ctx, res) {
      const { n, ind, piv } = ctx;
      res.zonesNow = zonesAt(piv, n - 1, ind.atr[n - 1]);
    },

    draw(R) {
      const { g, x, py, i0, i1, bw, plotW, priceH, hi, lo, n, C, A, ind, S, V, COL, zr } = R;
      if(S.L.zones){
        const last=C[n-1].c;
        for(const z of A.zonesNow){
          if(z.hi<lo||z.lo>hi) continue;
          const y1=py(Math.min(z.hi,hi)),y2=py(Math.max(z.lo,lo));
          g.fillStyle='rgba(201,138,11,0.13)';g.fillRect(0,y1,plotW,Math.max(2,y2-y1));
          g.strokeStyle='rgba(201,138,11,0.55)';g.setLineDash([5,4]);
          g.beginPath();g.moveTo(0,y1);g.lineTo(plotW,y1);g.moveTo(0,y2);g.lineTo(plotW,y2);g.stroke();g.setLineDash([]);
          g.fillStyle='#8A5D00';g.textBaseline='bottom';
          g.fillText(`${z.mid>last?'Kháng cự':'Hỗ trợ'} ×${z.touches}`,8,y1-2);
        }
      }
    }
  });
})();
