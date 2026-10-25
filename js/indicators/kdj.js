/* ======================================================================
   KDJ (9, 3, 3)
   Cung cấp: ind.K, ind.D, ind.J. Hiện chỉ để vẽ khung (chưa có nút bật trên chart, chưa có tín hiệu / phiếu).
   Muốn hiện khung KDJ: thêm layer: { key: "kdj", label: "KDJ", on: 0, order: 85 } vào Indicators.register bên dưới.
   ====================================================================== */
'use strict';
(function () {

  Indicators.register({
    id: 'kdj', label: 'KDJ', maxVote: 1,
    order: { calc: 20, pane: 20 },
    // layer: { key: 'kdj', label: 'KDJ', on: 0, order: 85 },

    calc({ h, l, c, n }) {
      // KDJ (9,3,3)
      const K = NaNs(n), D = NaNs(n), J = NaNs(n);
      let pk = 50, pd = 50;
      for (let i = 8; i < n; i++) {
        let hh = -Infinity, ll = Infinity;
        for (let j = i - 8; j <= i; j++) { if (h[j] > hh) hh = h[j]; if (l[j] < ll) ll = l[j]; }
        const rsv = hh === ll ? 50 : (c[i] - ll) / (hh - ll) * 100;
        pk = pk * 2 / 3 + rsv / 3;
        pd = pd * 2 / 3 + pk / 3;
        K[i] = pk; D[i] = pd; J[i] = 3 * pk - 2 * pd;
      }
      return { K, D, J };
    },

    pane(R, P) {
      const { g, plotW, i0, i1, ind, COL } = R;
      const { yy, line, f1, sb } = P;
      let title = '', vals = '';
      const a = -15, b = 115;
      P.osc(a, b);
      line(ind.K, COL.orange, a, b); line(ind.D, COL.blue, a, b); line(ind.J, COL.purple, a, b);
      title = 'KDJ 9·3·3'; vals = `K ${f1(ind.K[sb])}   D ${f1(ind.D[sb])}   J ${f1(ind.J[sb])}`;
      return { title, vals };
    }
  });
})();
