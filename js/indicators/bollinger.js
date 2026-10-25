/* ======================================================================
   Bollinger Bands (20, 2)
   Cung cấp: ind.bbMid, ind.bbUp, ind.bbLo, ind.bbBw.
   Tín hiệu: squeeze + volume bung dải, hoặc đâm thủng dải rồi đóng cửa trở lại. Phiếu: vị trí giá so với dải.
   ====================================================================== */
'use strict';
(function () {

  Indicators.register({
    id: 'bb', label: 'Bollinger', maxVote: 0.5,
    order: { calc: 40, bar: 40, vote: 40, under: 20 },
    layer: { key: 'bb', label: 'Bollinger', on: 1, order: 40 },
    drawWhere: 'under',

    calc({ c, n }) {
      const bbMid = sma(c, 20), bbUp = NaNs(n), bbLo = NaNs(n), bbBw = NaNs(n);
      for (let i = 19; i < n; i++) {
        let s = 0;
        for (let j = i - 19; j <= i; j++) s += (c[j] - bbMid[i]) * (c[j] - bbMid[i]);
        const sd = Math.sqrt(s / 20);
        bbUp[i] = bbMid[i] + 2 * sd; bbLo[i] = bbMid[i] - 2 * sd;
        bbBw[i] = bbMid[i] ? (bbUp[i] - bbLo[i]) / bbMid[i] : NaN;
      }
      return { bbMid, bbUp, bbLo, bbBw };
    },

    signalAt(ctx, i, add) {
      const { o, h, l, c, v, ind } = ctx;
      if (isN(ind.bbLo[i]) && isN(ind.bbLo[i - 1])) {
        const lo = ind.bbLo[i], up = ind.bbUp[i], mid = ind.bbMid[i];
        let minBw = Infinity;
        for (let j = Math.max(20, i - 100); j < i; j++) if (isN(ind.bbBw[j]) && ind.bbBw[j] < minBw) minBw = ind.bbBw[j];
        const squeeze = isFinite(minBw) && ind.bbBw[i - 1] <= minBw * 1.15;
        const spikeB = isN(ind.volSma[i]) && v[i] > 1.5 * ind.volSma[i];
        let bb = null;
        if (squeeze && spikeB && c[i] > up && c[i - 1] <= ind.bbUp[i - 1] && c[i] > o[i])
          bb = { side: 'buy', pts: 1.5, txt: `Bollinger: dải co hẹp (squeeze) rồi giá đóng cửa vượt dải trên (${fmt(up)}) kèm volume lớn: biến động đang bung ra theo hướng tăng` };
        else if (squeeze && spikeB && c[i] < lo && c[i - 1] >= ind.bbLo[i - 1] && c[i] < o[i])
          bb = { side: 'sell', pts: 1.5, txt: `Bollinger: dải co hẹp (squeeze) rồi giá đóng cửa thủng dải dưới (${fmt(lo)}) kèm volume lớn: biến động đang bung ra theo hướng giảm` };
        else if (l[i] <= lo && c[i] > lo && c[i] > o[i])
          bb = { side: 'buy', pts: 1.0, txt: `Bollinger: giá đâm thủng dải dưới (${fmt(lo)}) rồi đóng cửa trở lại trong dải bằng nến xanh: bán quá đà, giá có xu hướng hồi về đường giữa ${fmt(mid)}` };
        else if (h[i] >= up && c[i] < up && c[i] < o[i])
          bb = { side: 'sell', pts: 1.0, txt: `Bollinger: giá vọt lên dải trên (${fmt(up)}) rồi đóng cửa trở lại trong dải bằng nến đỏ: mua quá đà, giá có xu hướng lùi về đường giữa ${fmt(mid)}` };
        if (bb) add(i, bb.side, 'bb', bb.pts, bb.txt);
      }
    },

    vote(ctx, i, vote) {
      const { c, ind } = ctx;
      const bm = ind.bbMid[i], bu = ind.bbUp[i], bl = ind.bbLo[i];
      if (isN(bm) && isN(bu)) vote('bb', c[i] > bu ? -0.5 : c[i] < bl ? 0.5 : c[i] > bm ? 0.4 : -0.4, c[i] > bu ? 'Giá vượt dải trên Bollinger: mua quá đà, dễ lùi về đường giữa' : c[i] < bl ? 'Giá dưới dải dưới Bollinger: bán quá đà, dễ hồi về đường giữa' : `Giá ${c[i] > bm ? 'trên' : 'dưới'} đường giữa Bollinger (${fmt(bm)})`);
    },

    draw(R) {
      const { g, x, py, i0, i1, bw, plotW, priceH, hi, lo, n, C, A, ind, S, V, COL, zr } = R;
      if(S.L.bb){
        const ok=[];for(let i=i0;i<=i1;i++)if(isFinite(ind.bbUp[i]))ok.push(i);
        if(ok.length>1){
          g.fillStyle='rgba(47,125,190,0.08)';g.beginPath();
          ok.forEach((i,k)=>{k?g.lineTo(x(i),py(ind.bbUp[i])):g.moveTo(x(i),py(ind.bbUp[i]));});
          for(let k=ok.length-1;k>=0;k--)g.lineTo(x(ok[k]),py(ind.bbLo[ok[k]]));
          g.closePath();g.fill();
          for(const [arr,col,dash] of [[ind.bbUp,'rgba(47,125,190,0.85)',[]],[ind.bbLo,'rgba(47,125,190,0.85)',[]],[ind.bbMid,'rgba(90,107,122,0.7)',[4,4]]]){
            g.strokeStyle=col;g.lineWidth=1.2;g.setLineDash(dash);g.beginPath();
            ok.forEach((i,k)=>{k?g.lineTo(x(i),py(arr[i])):g.moveTo(x(i),py(arr[i]));});g.stroke();
          }
          g.setLineDash([]);
        }
      }
    }
  });
})();
