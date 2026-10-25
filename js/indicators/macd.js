/* ======================================================================
   MACD (12, 26, 9)
   Cung cấp: ind.macd, ind.sig, ind.hist (app và DiaCheck khác đọc các trường này).
   Tín hiệu: MACD cắt đường tín hiệu. Phiếu dự báo: dấu và chiều của histogram.
   ====================================================================== */
'use strict';
(function () {

  Indicators.register({
    id: 'macd', label: 'MACD', maxVote: 1,
    order: { calc: 10, bar: 10, vote: 20, pane: 10 },
    layer: { key: 'macd', label: 'MACD', on: 1, order: 80 },

    // 1) Tính giá trị
    calc({ c }) {
      const e12 = ema(c, 12), e26 = ema(c, 26);
      const macd = e12.map((x, i) => x - e26[i]);
      const sig = ema(macd, 9);
      const hist = macd.map((x, i) => x - sig[i]);
      return { macd, sig, hist };
    },

    // 2) Tín hiệu mua/bán tại nến i
    signalAt(ctx, i, add) {
      const { ind } = ctx;
      if (isN(ind.hist[i]) && isN(ind.hist[i - 1])) {
        if (ind.hist[i - 1] <= 0 && ind.hist[i] > 0) {
          const below = ind.macd[i] < 0;
          add(i, 'buy', 'macd', below ? 1.5 : 1.0, below
            ? 'MACD cắt lên đường tín hiệu khi vẫn dưới vạch 0: lực giảm đã suy yếu, động lượng bắt đầu quay đầu tăng'
            : 'MACD cắt lên đường tín hiệu và nằm trên vạch 0: động lượng tăng được củng cố');
        } else if (ind.hist[i - 1] >= 0 && ind.hist[i] < 0) {
          const above = ind.macd[i] > 0;
          add(i, 'sell', 'macd', above ? 1.5 : 1.0, above
            ? 'MACD cắt xuống đường tín hiệu khi còn trên vạch 0: đà tăng đang cạn, động lượng quay đầu giảm'
            : 'MACD cắt xuống đường tín hiệu và nằm dưới vạch 0: động lượng giảm được củng cố');
        }
      }
    },

    // 3) Phiếu cho phần Dự báo
    vote(ctx, i, vote) {
      const { ind } = ctx;
      const hh = ind.hist[i], hp = ind.hist[i - 1];
      if (isN(hh) && isN(hp)) vote('macd', (hh > 0 ? 0.5 : -0.5) + (hh > hp ? 0.5 : -0.5), `Histogram MACD ${hh > 0 ? 'dương' : 'âm'} và ${hh > hp ? 'đang tăng dần' : 'đang giảm dần'}: động lượng ${(hh > 0) === (hh > hp) ? 'đang được củng cố' : 'đang suy yếu'}`);
    },

    // 4) Khung MACD phía dưới biểu đồ
    pane(R, P) {
      const { g, x, bw, plotW, i0, i1, ind, COL } = R;
      const { yy, line, sf, sb } = P;
      let title = '', vals = '';
      let m=0;for(let i=i0;i<=i1;i++)for(const a of [ind.macd[i],ind.sig[i],ind.hist[i]])if(isFinite(a))m=Math.max(m,Math.abs(a));
      m=m||1;const a=-m*1.1,b=m*1.1;
      g.strokeStyle='#B8C3CD';g.beginPath();g.moveTo(0,yy(0,a,b));g.lineTo(plotW,yy(0,a,b));g.stroke();
      for(let i=i0;i<=i1;i++){const h=ind.hist[i];if(!isFinite(h))continue;
        g.fillStyle=h>=0?'rgba(14,138,109,.55)':'rgba(201,58,82,.55)';
        const y0=yy(0,a,b),y1=yy(h,a,b);g.fillRect(x(i)-bw*0.3,Math.min(y0,y1),Math.max(1,bw*0.6),Math.abs(y1-y0));}
      line(ind.macd,COL.blue,a,b);line(ind.sig,COL.orange,a,b);
      title='MACD 12·26·9';vals=`MACD ${sf(ind.macd[sb])}   Tín hiệu ${sf(ind.sig[sb])}   Hist ${sf(ind.hist[sb])}`;
      return { title, vals };
    }
  });
})();
