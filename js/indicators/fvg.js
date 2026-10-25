/* ======================================================================
   Fair Value Gap (FVG)
   Khoảng trống giá do 3 nến, nến giữa là nến đẩy mạnh (>= 0,8 ATR, khoảng trống >= 0,5 ATR).
   Cung cấp: A.ext.fvgs (danh sách vùng), A.ext.fvgV (giá đang trong FVG tăng/giảm tại từng nến).
   ====================================================================== */
'use strict';
(function () {

  Indicators.register({
    id: 'fvg', label: 'FVG', maxVote: 0.7,
    order: { all: 50, vote: 100, over: 40 },
    toggle: { key: 'fvg', label: 'FVG', on: 1, order: 50 },
    drawWhere: 'over',

    init(X, n) { X.fvgs = []; X.fvgV = new Array(n).fill(0); },

    signalAll(ctx, add) {
      const { o, h, l, c, n, ind, FT, X } = ctx;
      if (FT.fvg) {
        const create = (i, atr) => {
          const out = [];
          if (i < 2) return out;
          if (l[i] > h[i - 2] && c[i - 1] > o[i - 1] && c[i - 1] - o[i - 1] >= 0.8 * atr && l[i] - h[i - 2] >= 0.5 * atr) out.push({ side: 'buy', lo: h[i - 2], hi: l[i], k: i });
          else if (h[i] < l[i - 2] && c[i - 1] < o[i - 1] && o[i - 1] - c[i - 1] >= 0.8 * atr && l[i - 2] - h[i] >= 0.5 * atr) out.push({ side: 'sell', lo: h[i], hi: l[i - 2], k: i });
          return out;
        };
        zonePass(n, o, h, l, c, ind, create, 'fvg', 1.2, z => z.side === 'buy'
          ? `FVG tăng ${fmt(z.lo)}–${fmt(z.hi)}: giá quay lại lấp khoảng trống chưa được khớp (lần chạm đầu tiên) và giữ được bằng nến xanh: vùng mất cân bằng cung cầu đang đỡ giá`
          : `FVG giảm ${fmt(z.lo)}–${fmt(z.hi)}: giá quay lại lấp khoảng trống chưa được khớp (lần chạm đầu tiên) và bị từ chối bằng nến đỏ: vùng mất cân bằng cung cầu đang chặn giá`,
          add, X.fvgV, X.fvgs);
      }
    },

    vote(ctx, i, vote) {
      const { FT, X } = ctx;
      if (FT.fvg && X.fvgV[i] !== 0) vote('fvg', X.fvgV[i] * 0.7, `Giá đang nằm trong FVG ${X.fvgV[i] > 0 ? 'tăng' : 'giảm'} chưa bị lấp`);
    },

    draw(R) {
      const { g, x, py, i0, i1, bw, plotW, priceH, hi, lo, n, C, A, ind, S, V, COL, zr } = R;
      const ex = A.ext;
      if (!ex) return;
      if(S.ft.fvg) for(const z of ex.fvgs) zr(z,z.i0-2,'FVG');
    }
  });
})();
