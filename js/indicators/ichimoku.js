/* ======================================================================
   Ichimoku (9, 26, 52)
   Cung cấp: ind.tenkan, ind.kijun, ind.spanA, ind.spanB (mây tại nến i lấy từ 26 nến trước, không nhìn trước tương lai).
   Tín hiệu: giá vượt / thủng mây, Tenkan cắt Kijun. Phiếu: vị trí so với mây + Tenkan/Kijun + Chikou.
   ====================================================================== */
'use strict';
(function () {

  Indicators.register({
    id: 'ichi', label: 'Ichimoku', maxVote: 1,
    order: { calc: 50, bar: 50, vote: 10, under: 50 },
    layer: { key: 'ichi', label: 'Ichimoku', on: 1, order: 10 },
    drawWhere: 'under',

    calc({ h, l, n }) {
      const mid = (p, i) => { let a = -Infinity, b = Infinity; for (let j = i - p + 1; j <= i; j++) { if (h[j] > a) a = h[j]; if (l[j] < b) b = l[j]; } return (a + b) / 2; };
      const tenkan = NaNs(n), kijun = NaNs(n), spanA = NaNs(n + 26), spanB = NaNs(n + 26);
      for (let i = 0; i < n; i++) {
        if (i >= 8) tenkan[i] = mid(9, i);
        if (i >= 25) { kijun[i] = mid(26, i); spanA[i + 26] = (tenkan[i] + kijun[i]) / 2; }
        if (i >= 51) spanB[i + 26] = mid(52, i);
      }
      return { tenkan, kijun, spanA, spanB };
    },

    signalAt(ctx, i, add) {
      const { o, c, ind } = ctx;
      {
        const sa = ind.spanA[i], sb = ind.spanB[i], tk = ind.tenkan[i], kj = ind.kijun[i], tkp = ind.tenkan[i - 1], kjp = ind.kijun[i - 1];
        if (isN(sa) && isN(sb) && isN(tk) && isN(kj) && isN(tkp) && isN(kjp)) {
          const top = Math.max(sa, sb), bot = Math.min(sa, sb);
          const pt = Math.max(ind.spanA[i - 1], ind.spanB[i - 1]), pb = Math.min(ind.spanA[i - 1], ind.spanB[i - 1]);
          if (isN(pt) && c[i - 1] <= pt && c[i] > top && c[i] > o[i])
            add(i, 'buy', 'ichi', 1.2, `Ichimoku: giá đóng cửa vượt lên trên đám mây (${fmt(bot)}–${fmt(top)}): xu hướng có thể chuyển sang tăng`);
          else if (isN(pb) && c[i - 1] >= pb && c[i] < bot && c[i] < o[i])
            add(i, 'sell', 'ichi', 1.2, `Ichimoku: giá đóng cửa thủng xuống dưới đám mây (${fmt(bot)}–${fmt(top)}): xu hướng có thể chuyển sang giảm`);
          else if (tkp <= kjp && tk > kj)
            add(i, 'buy', 'ichi', c[i] > top ? 1.5 : c[i] >= bot ? 0.5 : 0.2, c[i] > top ? 'Ichimoku: Tenkan cắt lên Kijun khi giá trên mây: tín hiệu tăng mạnh theo xu hướng' : c[i] >= bot ? 'Ichimoku: Tenkan cắt lên Kijun nhưng giá còn trong mây: tín hiệu yếu' : 'Ichimoku: Tenkan cắt lên Kijun nhưng giá còn dưới mây: chỉ là nhịp hồi, chưa đổi xu hướng');
          else if (tkp >= kjp && tk < kj)
            add(i, 'sell', 'ichi', c[i] < bot ? 1.5 : c[i] <= top ? 0.5 : 0.2, c[i] < bot ? 'Ichimoku: Tenkan cắt xuống Kijun khi giá dưới mây: tín hiệu giảm mạnh theo xu hướng' : c[i] <= top ? 'Ichimoku: Tenkan cắt xuống Kijun nhưng giá còn trong mây: tín hiệu yếu' : 'Ichimoku: Tenkan cắt xuống Kijun nhưng giá còn trên mây: chỉ là nhịp điều chỉnh');
        }
      }
    },

    vote(ctx, i, vote) {
      const { c, ind } = ctx;
      const a = ind.spanA[i], b = ind.spanB[i], tk = ind.tenkan[i], kj = ind.kijun[i];
      if (isN(a) && isN(b) && isN(tk) && isN(kj)) {
        const tp = Math.max(a, b), bt = Math.min(a, b);
        const pos = c[i] > tp ? 1 : c[i] < bt ? -1 : 0, cr = tk > kj ? 1 : -1, ch = i >= 26 ? (c[i] > c[i - 26] ? 1 : -1) : 0;
        vote('ichi', pos * 0.6 + cr * 0.25 + ch * 0.15, `Giá ${pos > 0 ? 'nằm trên' : pos < 0 ? 'nằm dưới' : 'đang ở trong'} mây (${fmt(bt)}–${fmt(tp)}), Tenkan ${cr > 0 ? 'trên' : 'dưới'} Kijun, Chikou ${ch > 0 ? 'trên' : 'dưới'} giá 26 nến trước` + (pos === 0 ? ': vùng giằng co, chưa rõ hướng' : ''));
      }
    },

    draw(R) {
      const { g, x, py, i0, i1, bw, plotW, priceH, hi, lo, n, C, A, ind, S, V, COL, zr } = R;
      if(S.L.ichi){
        const iE=Math.min(n+25,Math.ceil(V.end)),A_=ind.spanA,B_=ind.spanB;
        for(let i=Math.max(0,i0);i<iE;i++){
          if(!isFinite(A_[i])||!isFinite(B_[i])||!isFinite(A_[i+1])||!isFinite(B_[i+1])) continue;
          g.fillStyle=A_[i]>=B_[i]?'rgba(14,138,109,.13)':'rgba(201,58,82,.13)';
          g.beginPath();g.moveTo(x(i),py(A_[i]));g.lineTo(x(i+1),py(A_[i+1]));g.lineTo(x(i+1),py(B_[i+1]));g.lineTo(x(i),py(B_[i]));g.closePath();g.fill();
        }
        for(const [arr,col,lw,e] of [[A_,'rgba(14,138,109,.55)',1,iE],[B_,'rgba(201,58,82,.55)',1,iE],[ind.tenkan,COL.blue,1.3,i1],[ind.kijun,COL.orange,1.3,i1]]){
          g.strokeStyle=col;g.lineWidth=lw;g.beginPath();let st=false;
          for(let i=Math.max(0,i0);i<=e;i++){const v=arr[i];if(!isFinite(v)){st=false;continue;}if(!st){g.moveTo(x(i),py(v));st=true;}else g.lineTo(x(i),py(v));}
          g.stroke();
        }
      }
    }
  });
})();
