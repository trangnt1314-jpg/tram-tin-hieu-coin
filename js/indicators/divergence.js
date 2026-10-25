/* ======================================================================
   Phân kỳ RSI / MACD
   Đỉnh đáy fractal 3 nến, xác nhận sau 3 nến. Cần ind.rsi (stochrsi.js) và ind.macd (macd.js).
   Cung cấp: A.ext.divs (đoạn phân kỳ để vẽ), A.ext.divAt (phân kỳ tại từng nến, app dùng cho cảnh báo vị thế).
   ====================================================================== */
'use strict';
(function () {

  Indicators.register({
    id: 'div', label: 'Phân kỳ', maxVote: 1,
    order: { all: 30, vote: 80, over: 50 },
    toggle: { key: 'div', label: 'Phân kỳ RSI/MACD', on: 1, order: 30 },
    drawWhere: 'over',

    init(X, n) { X.divs = []; X.divAt = new Array(n).fill(null); },

    signalAll(ctx, add) {
      const { h, l, n, ind, FT, X } = ctx;
      const F = x => x.toFixed(0);
      if (FT.div) {
        const K = 3, lo = [], hi = [];
        for (let i = 2 * K; i < n; i++) {
          const j = i - K;
          let isL = true, isH = true;
          for (let k = 1; k <= K; k++) {
            if (!(l[j] < l[j - k]) || !(l[j] <= l[j + k])) isL = false;
            if (!(h[j] > h[j - k]) || !(h[j] >= h[j + k])) isH = false;
          }
          if (isL) {
            const p = lo[lo.length - 1];
            if (p !== undefined && j - p >= 5 && j - p <= 60 && l[j] < l[p]) {
              const r = isN(ind.rsi[j]) && isN(ind.rsi[p]) && ind.rsi[j] > ind.rsi[p] && ind.rsi[p] < 50;
              const m = isN(ind.macd[j]) && isN(ind.macd[p]) && ind.macd[j] > ind.macd[p] && ind.macd[p] < 0;
              if (r || m) {
                const pts = r && m ? 1.8 : 1.2;
                add(i, 'buy', 'div', pts, `Phân kỳ tăng ${r && m ? 'RSI và MACD' : r ? 'RSI' : 'MACD'}: giá tạo đáy thấp hơn (${fmt(l[p])} → ${fmt(l[j])}) nhưng ${r ? `RSI đáy cao hơn (${F(ind.rsi[p])} → ${F(ind.rsi[j])})` : ''}${r && m ? ' và ' : ''}${m ? 'MACD đáy cao hơn' : ''}: lực bán yếu dần, nguy cơ đảo chiều lên`);
                X.divs.push({ side: 'buy', j1: p, j2: j, p1: l[p], p2: l[j], i, rsi: r, macd: m }); X.divAt[i] = { side: 'buy', pts };
              }
            }
            lo.push(j);
          }
          if (isH) {
            const p = hi[hi.length - 1];
            if (p !== undefined && j - p >= 5 && j - p <= 60 && h[j] > h[p]) {
              const r = isN(ind.rsi[j]) && isN(ind.rsi[p]) && ind.rsi[j] < ind.rsi[p] && ind.rsi[p] > 50;
              const m = isN(ind.macd[j]) && isN(ind.macd[p]) && ind.macd[j] < ind.macd[p] && ind.macd[p] > 0;
              if (r || m) {
                const pts = r && m ? 1.8 : 1.2;
                add(i, 'sell', 'div', pts, `Phân kỳ giảm ${r && m ? 'RSI và MACD' : r ? 'RSI' : 'MACD'}: giá tạo đỉnh cao hơn (${fmt(h[p])} → ${fmt(h[j])}) nhưng ${r ? `RSI đỉnh thấp hơn (${F(ind.rsi[p])} → ${F(ind.rsi[j])})` : ''}${r && m ? ' và ' : ''}${m ? 'MACD đỉnh thấp hơn' : ''}: lực mua yếu dần, nguy cơ đảo chiều xuống`);
                X.divs.push({ side: 'sell', j1: p, j2: j, p1: h[p], p2: h[j], i, rsi: r, macd: m }); X.divAt[i] = { side: 'sell', pts };
              }
            }
            hi.push(j);
          }
        }
      }
    },

    vote(ctx, i, vote) {
      const { FT, X } = ctx;
      if (FT.div) for (let k = 0; k <= 8 && i - k >= 0; k++) { const d = X.divAt[i - k]; if (d) { vote('div', d.side === 'buy' ? 1 : -1, `Có phân kỳ ${d.side === 'buy' ? 'tăng' : 'giảm'} RSI/MACD xuất hiện ${k === 0 ? 'ở nến vừa đóng' : 'cách ' + k + ' nến'}`); break; } }
    },

    draw(R) {
      const { g, x, py, i0, i1, bw, plotW, priceH, hi, lo, n, C, A, ind, S, V, COL, zr } = R;
      const ex = A.ext;
      if (!ex) return;
      if(S.ft.div) for(const d of ex.divs){if(d.i<i0||d.j1>i1) continue;
        g.strokeStyle=d.side==='buy'?COL.buy:COL.sell;g.lineWidth=1.6;g.setLineDash([4,3]);g.beginPath();g.moveTo(x(d.j1),py(d.p1));g.lineTo(x(d.j2),py(d.p2));g.stroke();g.setLineDash([]);}
    }
  });
})();
