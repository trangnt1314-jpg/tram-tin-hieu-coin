/* ======================================================================
   Fibonacci retracement / extension
   Dùng ZigZag (js/core/swings.js) để lấy nhịp sóng gần nhất. Kết quả: A.fib.
   Tín hiệu: hồi về vùng vàng 50-61,8% rồi bật. Phiếu: giá đang hồi bao nhiêu % nhịp gần nhất. Mục tiêu TP2 của Dự báo cũng lấy từ A.fib.
   ====================================================================== */
'use strict';
/* ---------- Fibonacci: lấy nhịp sóng gần nhất đã xác nhận từ ZigZag ---------- */
function fibSwing(piv, i, atr) {
  let k = piv.length - 1;
  while (k >= 0 && piv[k].conf > i) k--;
  if (k < 1 || !isN(atr)) return null;
  const b = piv[k], a = piv[k - 1];
  if (Math.abs(b.p - a.p) < 3 * atr) return null;
  const up = b.t === 'H';
  const hi = up ? b.p : a.p, lo = up ? a.p : b.p, d = hi - lo;
  return { up, hi, lo, d, a, b, lv: r => up ? hi - r * d : lo + r * d, ex: r => up ? lo + r * d : hi - r * d };
}

(function () {


  Indicators.register({
    id: 'fib', label: 'Fibonacci', maxVote: 1,
    order: { bar: 60, vote: 50, result: 10, under: 60 },
    layer: { key: 'fib', label: 'Fibonacci', on: 1, order: 20 },
    drawWhere: 'under',

    signalAt(ctx, i, add) {
      const { o, h, l, c, ind, zz } = ctx;
      const atr = ind.atr[i];
      {
        const fs = fibSwing(zz.piv, i, atr);
        if (fs) {
          const L5 = fs.lv(0.5), L618 = fs.lv(0.618), L786 = fs.lv(0.786);
          if (fs.up && l[i] <= L5 && l[i] >= L786 - 0.3 * atr && c[i] > L618 && c[i] > o[i])
            add(i, 'buy', 'fib', 1.3, `Fibonacci: giá hồi về vùng vàng 50–61,8% (${fmt(L618)}–${fmt(L5)}) của nhịp tăng ${fmt(fs.lo)}→${fmt(fs.hi)} rồi bật lên bằng nến xanh: thường là nhịp hồi xong để đi tiếp, mục tiêu tham khảo ${fmt(fs.ex(1.272))}`);
          else if (!fs.up && h[i] >= L5 && h[i] <= L786 + 0.3 * atr && c[i] < L618 && c[i] < o[i])
            add(i, 'sell', 'fib', 1.3, `Fibonacci: giá hồi lên vùng vàng 50–61,8% (${fmt(L5)}–${fmt(L618)}) của nhịp giảm ${fmt(fs.hi)}→${fmt(fs.lo)} rồi bị đẩy xuống bằng nến đỏ: thường là nhịp hồi xong để giảm tiếp, mục tiêu tham khảo ${fmt(fs.ex(1.272))}`);
        }
      }
    },

    vote(ctx, i, vote) {
      const { c } = ctx;
      const fsNow = fibSwing(ctx.zz.piv, i, ctx.ind.atr[i]);
      if (fsNow) {
        const sg = fsNow.up ? 1 : -1, r = fsNow.up ? (fsNow.hi - c[i]) / fsNow.d : (c[i] - fsNow.lo) / fsNow.d, pc = (r * 100).toFixed(0);
        const nm = fsNow.up ? 'tăng' : 'giảm', sw = `${fmt(fsNow.lo)}–${fmt(fsNow.hi)}`;
        if (r < 0) vote('fib', sg * 0.5, `Giá đã vượt qua điểm cuối nhịp ${nm} gần nhất (${sw}): xu hướng ${nm} đang mở rộng`);
        else if (r < 0.382) vote('fib', sg * 0.3, `Giá mới hồi ${pc}% nhịp ${nm} (${sw}): nhịp hồi nông, xu hướng ${nm} còn mạnh`);
        else if (r <= 0.786) vote('fib', sg * 0.7, `Giá đang hồi ${pc}% nhịp ${nm} (${sw}), nằm trong vùng Fibonacci 38,2–78,6%: vùng thường có lực đỡ để đi tiếp theo hướng ${nm}`);
        else if (r <= 1) vote('fib', -sg * 0.5, `Giá hồi sâu ${pc}% nhịp ${nm} (${sw}): quá 78,6% nên nguy cơ đảo chiều tăng lên`);
        else vote('fib', -sg, `Giá đã đi ngược và phá hết nhịp ${nm} gần nhất (${sw}): cấu trúc ${nm} bị vô hiệu`);
      }
    },

    result(ctx, res) {
      res.fib = fibSwing(ctx.zz.piv, ctx.n - 1, ctx.ind.atr[ctx.n - 1]);
    },

    draw(R) {
      const { g, x, py, i0, i1, bw, plotW, priceH, hi, lo, n, C, A, ind, S, V, COL, zr } = R;
      if(S.L.fib&&A.fib){
        const fs=A.fib,xa=Math.max(4,x(fs.a.j)),lb=r=>'Fib '+(r*100).toFixed(1).replace('.0','')+'%';
        const y5=py(fs.lv(0.5)),y6=py(fs.lv(0.618));
        g.fillStyle='rgba(155,63,160,.10)';g.fillRect(xa,Math.min(y5,y6),plotW-xa,Math.abs(y6-y5));
        g.font='11px "Be Vietnam Pro",system-ui,sans-serif';g.textAlign='left';g.textBaseline='bottom';g.lineWidth=1;
        for(const r of [0,0.236,0.382,0.5,0.618,0.786,1,1.272,1.618]){
          const y=py(r>1?fs.ex(r):fs.lv(r));
          g.strokeStyle='rgba(155,63,160,.55)';g.setLineDash(r===0||r===1?[]:[3,3]);
          g.beginPath();g.moveTo(xa,y);g.lineTo(plotW,y);g.stroke();
          g.fillStyle='#7A2E80';g.fillText(lb(r)+(r>1?' (mục tiêu mở rộng)':''),xa+4,y-1);
        }
        g.setLineDash([]);g.font='12px "Be Vietnam Pro",system-ui,sans-serif';
      }
    }
  });
})();
