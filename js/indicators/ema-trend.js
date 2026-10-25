/* ======================================================================
   EMA 50 / EMA 200 (xu hướng chính)
   Cung cấp: ind.ema50, ind.ema200.
   Không tự sinh tín hiệu: cộng 0,5 điểm khi thuận xu hướng, trừ 0,5 khi ngược (scoreAdjust) và bỏ 1 phiếu xu hướng cho Dự báo.
   ====================================================================== */
'use strict';
(function () {

  // 1 = tăng (EMA50 > EMA200 và giá trên EMA50), -1 = giảm, 0 = chưa rõ
  const trendAt = (ctx, i) => {
    const { c, ind } = ctx;
    const a = ind.ema50[i], b = ind.ema200[i];
    if (!isN(a) || !isN(b)) return 0;
    if (a > b && c[i] > a) return 1;
    if (a < b && c[i] < a) return -1;
    return 0;
  };

  Indicators.register({
    id: 'trend', label: 'Xu hướng', maxVote: 1,
    order: { calc: 70, vote: 110, over: 10 },
    layer: { key: 'ema', label: 'EMA 50/200', on: 0, order: 70 },
    drawWhere: 'over',
    trendAt,

    calc({ c }) {
      return { ema50: ema(c, 50), ema200: ema(c, 200) };
    },

    // Cộng / trừ điểm theo xu hướng chính (chỉ khi đã có ít nhất 1 tín hiệu cùng phía)
    scoreAdjust(ctx, i, side) {
      const tr = trendAt(ctx, i);
      let adj = 0;
      const want = side === 'buy' ? 1 : -1;
      if (tr === want) adj = 0.5; else if (tr === -want) adj = -0.5;
      if (adj === 0) return null;
      const up = tr > 0;
      return {
        type: 'trend', side, pts: adj, j: i, confirm: true,
        txt: adj > 0
          ? `Thuận xu hướng chính: EMA50 ${up ? 'trên' : 'dưới'} EMA200 và giá ${up ? 'trên' : 'dưới'} EMA50`
          : `Ngược xu hướng chính (EMA50 ${up ? 'trên' : 'dưới'} EMA200, giá ${up ? 'trên' : 'dưới'} EMA50): rủi ro cao hơn nên bị trừ điểm`
      };
    },

    vote(ctx, i, vote) {
      const tr = trendAt(ctx, i);
      vote('trend', tr, tr > 0 ? 'EMA50 trên EMA200 và giá trên EMA50: xu hướng chính tăng' : tr < 0 ? 'EMA50 dưới EMA200 và giá dưới EMA50: xu hướng chính giảm' : 'EMA50/EMA200 chưa cho xu hướng chính rõ ràng');
    },

    draw(R) {
      const { g, x, py, i0, i1, bw, plotW, priceH, hi, lo, n, C, A, ind, S, V, COL, zr } = R;
      if(S.L.ema){
        for(const [arr,col] of [[ind.ema50,COL.blue],[ind.ema200,COL.ema200]]){
          g.strokeStyle=col;g.lineWidth=1.6;g.beginPath();let st=false;
          for(let i=i0;i<=i1;i++){const v=arr[i];if(!isFinite(v)){st=false;continue;}if(!st){g.moveTo(x(i),py(v));st=true;}else g.lineTo(x(i),py(v));}
          g.stroke();
        }
      }
    }
  });
})();
