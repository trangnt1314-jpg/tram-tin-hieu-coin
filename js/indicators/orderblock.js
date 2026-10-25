/* ======================================================================
   Order Block
   Nến ngược chiều cuối cùng trước cú đẩy mạnh phá cấu trúc (thân nến > 1,5 ATR, vượt đỉnh/đáy 10 nến).
   Cung cấp: A.ext.obs (danh sách vùng), A.ext.obV (giá đang trong OB tăng/giảm tại từng nến).
   ====================================================================== */
'use strict';
(function () {

  Indicators.register({
    id: 'ob', label: 'Order Block', maxVote: 0.7,
    order: { all: 40, vote: 90, over: 30 },
    toggle: { key: 'ob', label: 'Order Block', on: 1, order: 40 },
    drawWhere: 'over',

    init(X, n) { X.obs = []; X.obV = new Array(n).fill(0); },

    signalAll(ctx, add) {
      const { o, h, l, c, n, ind, FT, X } = ctx;
      if (FT.ob) {
        const create = (i, atr) => {
          const out = [];
          if (i < 12) return out;
          let mx = -Infinity, mn = Infinity;
          for (let j = i - 10; j < i; j++) { if (h[j] > mx) mx = h[j]; if (l[j] < mn) mn = l[j]; }
          if (c[i] - o[i] > 1.5 * atr && c[i] > mx) {
            for (let k = i - 1; k >= i - 6; k--) if (c[k] < o[k]) { if (h[k] - l[k] <= 3 * atr) out.push({ side: 'buy', lo: l[k], hi: h[k], k }); break; }
          } else if (o[i] - c[i] > 1.5 * atr && c[i] < mn) {
            for (let k = i - 1; k >= i - 6; k--) if (c[k] > o[k]) { if (h[k] - l[k] <= 3 * atr) out.push({ side: 'sell', lo: l[k], hi: h[k], k }); break; }
          }
          return out;
        };
        zonePass(n, o, h, l, c, ind, create, 'ob', 1.5, z => z.side === 'buy'
          ? `Order Block tăng ${fmt(z.lo)}–${fmt(z.hi)}: giá quay lại vùng nến giảm cuối cùng trước cú đẩy lên mạnh (lần chạm đầu tiên) rồi bật lên bằng nến xanh: lực mua lớn còn bảo vệ vùng này`
          : `Order Block giảm ${fmt(z.lo)}–${fmt(z.hi)}: giá quay lại vùng nến tăng cuối cùng trước cú đạp xuống mạnh (lần chạm đầu tiên) rồi bị đẩy xuống bằng nến đỏ: lực bán lớn còn bảo vệ vùng này`,
          add, X.obV, X.obs);
      }
    },

    vote(ctx, i, vote) {
      const { FT, X } = ctx;
      if (FT.ob && X.obV[i] !== 0) vote('ob', X.obV[i] * 0.7, `Giá đang nằm trong Order Block ${X.obV[i] > 0 ? 'tăng (vùng cầu)' : 'giảm (vùng cung)'} chưa bị lấp`);
    },

    draw(R) {
      const { g, x, py, i0, i1, bw, plotW, priceH, hi, lo, n, C, A, ind, S, V, COL, zr } = R;
      const ex = A.ext;
      if (!ex) return;
      if(S.ft.ob) for(const z of ex.obs) zr(z,z.k,'OB');
    }
  });
})();
