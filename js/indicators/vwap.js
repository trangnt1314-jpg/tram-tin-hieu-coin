/* ======================================================================
   VWAP
   Khung 15m/1h reset mỗi ngày UTC, khung 4h/1d reset mỗi tuần. Cung cấp: A.ext.vwap.
   Bật/tắt bằng nút "Bổ trợ" (toggle vwap). Tín hiệu: vượt / thủng VWAP, hồi test VWAP. Phiếu: giá trên hay dưới VWAP.
   ====================================================================== */
'use strict';
(function () {

  Indicators.register({
    id: 'vwap', label: 'VWAP', maxVote: 0.6,
    order: { all: 10, vote: 60, over: 20 },
    toggle: { key: 'vwap', label: 'VWAP', on: 1, order: 10 },
    drawWhere: 'over',

    init(X, n) { X.vwap = NaNs(n); },

    signalAll(ctx, add) {
      const { C, o, h, l, c, v, n, ind, FT, X } = ctx;
      if (FT.vwap && n > 3) {
        const step = C[1].t - C[0].t, weekly = step >= 144e5;
        let key = null, pv = 0, vv = 0, cnt = 0;
        for (let i = 0; i < n; i++) {
          const k = weekly ? Math.floor((C[i].t - 4 * 864e5) / (7 * 864e5)) : Math.floor(C[i].t / 864e5);
          if (k !== key) { key = k; pv = 0; vv = 0; cnt = 0; }
          pv += (h[i] + l[i] + c[i]) / 3 * v[i]; vv += v[i]; cnt++;
          if (vv > 0 && cnt >= 3) X.vwap[i] = pv / vv;
        }
        for (let i = 4; i < n; i++) {
          const w = X.vwap[i], pw = X.vwap[i - 1], atr = ind.atr[i];
          if (!isN(w) || !isN(pw) || !isN(atr)) continue;
          const above3 = [1, 2, 3].every(k => isN(X.vwap[i - k]) && c[i - k] > X.vwap[i - k]);
          const below3 = [1, 2, 3].every(k => isN(X.vwap[i - k]) && c[i - k] < X.vwap[i - k]);
          if (c[i - 1] <= pw && c[i] > w && c[i] > o[i]) add(i, 'buy', 'vwap', 1.0, `Giá đóng cửa vượt lên trên VWAP (${fmt(w)}): phe mua giành lại giá vốn trung bình có trọng số volume`);
          else if (c[i - 1] >= pw && c[i] < w && c[i] < o[i]) add(i, 'sell', 'vwap', 1.0, `Giá đóng cửa rơi xuống dưới VWAP (${fmt(w)}): phe bán chiếm lại giá vốn trung bình có trọng số volume`);
          else if (above3 && l[i] <= w + 0.1 * atr && c[i] > w && c[i] > o[i]) add(i, 'buy', 'vwap', 1.2, `Giá hồi về chạm VWAP (${fmt(w)}) từ phía trên rồi bật lên bằng nến xanh: VWAP đang làm hỗ trợ`);
          else if (below3 && h[i] >= w - 0.1 * atr && c[i] < w && c[i] < o[i]) add(i, 'sell', 'vwap', 1.2, `Giá hồi lên chạm VWAP (${fmt(w)}) từ phía dưới rồi bị đẩy xuống bằng nến đỏ: VWAP đang làm kháng cự`);
        }
      }
    },

    vote(ctx, i, vote) {
      const { c, FT, X } = ctx;
      if (FT.vwap && isN(X.vwap[i])) vote('vwap', c[i] > X.vwap[i] ? 0.6 : -0.6, `Giá ${c[i] > X.vwap[i] ? 'trên' : 'dưới'} VWAP (${fmt(X.vwap[i])}): ${c[i] > X.vwap[i] ? 'phe mua đang kiểm soát giá vốn trung bình' : 'phe bán đang kiểm soát giá vốn trung bình'}`);
    },

    draw(R) {
      const { g, x, py, i0, i1, bw, plotW, priceH, hi, lo, n, C, A, ind, S, V, COL, zr } = R;
      const ex = A.ext;
      if (!ex) return;
      if(S.ft.vwap){g.strokeStyle='#6C4AB6';g.lineWidth=1.4;g.setLineDash([5,3]);g.beginPath();let st=false;
        for(let i=i0;i<=i1;i++){const v=ex.vwap[i];if(!isFinite(v)){st=false;continue;}if(!st){g.moveTo(x(i),py(v));st=true;}else g.lineTo(x(i),py(v));}
        g.stroke();g.setLineDash([]);}
    }
  });
})();
