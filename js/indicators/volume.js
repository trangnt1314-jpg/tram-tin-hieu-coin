/* ======================================================================
   Volume xác nhận
   Dùng ind.volSma (SMA volume 20, tính ở js/core/calc.js). Không có phiếu dự báo, không vẽ.
   Tín hiệu "xác nhận" (confirm): chỉ cộng điểm, không tính vào số chỉ báo độc lập.
   ====================================================================== */
'use strict';
(function () {

  Indicators.register({
    id: 'vol', label: 'Volume',
    order: { bar: 70 },

    signalAt(ctx, i, add) {
      const { o, c, v, ind } = ctx;
      if (isN(ind.volSma[i]) && v[i] > 1.8 * ind.volSma[i]) {
        const x = (v[i] / ind.volSma[i]).toFixed(1);
        if (c[i] > o[i]) add(i, 'buy', 'vol', 0.5, `Volume gấp ${x} lần trung bình 20 nến trên nến xanh: dòng tiền mua xác nhận`, true);
        else if (c[i] < o[i]) add(i, 'sell', 'vol', 0.5, `Volume gấp ${x} lần trung bình 20 nến trên nến đỏ: dòng tiền bán xác nhận`, true);
      }
    }
  });
})();
