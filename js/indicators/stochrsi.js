/* ======================================================================
   Stochastic RSI (14, 14, 3, 3)
   Cung cấp: ind.rsi (RSI 14), ind.sk (%K), ind.sd (%D). Phân kỳ RSI và app đọc ind.rsi / ind.sk / ind.sd.
   Tín hiệu: %K cắt %D, mạnh nhất khi từ vùng quá bán / quá mua.
   ====================================================================== */
'use strict';
(function () {

  const F0 = x => x.toFixed(0);
  Indicators.register({
    id: 'srsi', label: 'StochRSI', maxVote: 1,
    order: { calc: 30, bar: 20, vote: 30, pane: 30 },
    layer: { key: 'srsi', label: 'StochRSI', on: 1, order: 90 },

    calc({ c, n }) {
      const rsi = rsiW(c, 14);
      const st = NaNs(n);
      for (let i = 27; i < n; i++) {
        let mn = Infinity, mx = -Infinity, ok = true;
        for (let j = i - 13; j <= i; j++) {
          if (!isN(rsi[j])) { ok = false; break; }
          if (rsi[j] < mn) mn = rsi[j];
          if (rsi[j] > mx) mx = rsi[j];
        }
        if (ok) st[i] = mx === mn ? 50 : (rsi[i] - mn) / (mx - mn) * 100;
      }
      const sk = sma(st, 3), sd = sma(sk, 3);
      return { rsi, sk, sd };
    },

    signalAt(ctx, i, add) {
      const { ind } = ctx;
      if (isN(ind.sk[i - 1]) && isN(ind.sd[i - 1]) && isN(ind.sk[i]) && isN(ind.sd[i])) {
        const K = ind.sk[i], D = ind.sd[i];
        if (ind.sk[i - 1] <= ind.sd[i - 1] && K > D) {
          const pts = K < 20 ? 1.2 : K < 50 ? 0.5 : 0.2;
          add(i, 'buy', 'srsi', pts, `StochRSI: %K (${F0(K)}) cắt lên %D (${F0(D)}) ` +
            (K < 20 ? 'từ vùng quá bán (<20): RSI vừa chạm đáy chu kỳ và hồi lên' :
             K < 50 ? 'ở nửa dưới: RSI đang hồi phục' : 'ở vùng cao: tín hiệu yếu'));
        } else if (ind.sk[i - 1] >= ind.sd[i - 1] && K < D) {
          const pts = K > 80 ? 1.2 : K > 50 ? 0.5 : 0.2;
          add(i, 'sell', 'srsi', pts, `StochRSI: %K (${F0(K)}) cắt xuống %D (${F0(D)}) ` +
            (K > 80 ? 'từ vùng quá mua (>80): RSI vừa chạm đỉnh chu kỳ và quay xuống' :
             K > 50 ? 'ở nửa trên: RSI bắt đầu suy yếu' : 'ở vùng thấp: tín hiệu yếu'));
        }
      }
    },

    vote(ctx, i, vote) {
      const { ind } = ctx;
      const sk = ind.sk[i], sd = ind.sd[i];
      if (isN(sk) && isN(sd)) vote('srsi', (sk > sd ? 0.5 : -0.5) + (sk < 20 ? 0.5 : sk > 80 ? -0.5 : 0), `StochRSI: %K ${F0(sk)} ${sk > sd ? 'trên' : 'dưới'} %D ${F0(sd)}` + (sk < 20 ? ', vùng quá bán, dễ hồi' : sk > 80 ? ', vùng quá mua, dễ điều chỉnh' : ''));
    },

    pane(R, P) {
      const { g, plotW, i0, i1, ind, COL } = R;
      const { yy, line, f1, sb } = P;
      let title = '', vals = '';
      const a = -15, b = 115;
      P.osc(a, b);
      line(ind.sk, COL.orange, a, b); line(ind.sd, COL.blue, a, b);
      title = 'StochRSI 14·14·3·3'; vals = `%K ${f1(ind.sk[sb])}   %D ${f1(ind.sd[sb])}`;
      return { title, vals };
    }
  });
})();
