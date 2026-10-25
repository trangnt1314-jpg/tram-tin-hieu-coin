/* ======================================================================
   Kalman Trend Levels (theo Pine của BigBeluga)
   Cung cấp: ind.kalS (Kalman 50), ind.kalL (Kalman 150), ind.kal {boxes, flips}.
   Layer "Kalman" trên chart chỉ bật/tắt hình vẽ; toggle "Kalman" ở thanh Bổ trợ bật/tắt việc tính vào điểm.
   ====================================================================== */
'use strict';
/* ---------- Kalman Trend Levels (theo Pine của BigBeluga): bộ lọc Kalman 50 và 150 trên giá đóng cửa ---------- */
function kalmanF(src, len) {
  const n = src.length, out = NaNs(n), R = 0.01, Q = 0.1, em = R * len;
  let est = NaN, ee = 1.0;
  for (let i = 0; i < n; i++) {
    if (isNaN(est) && i >= 1) est = src[i - 1];
    const pred = est, gain = ee / (ee + em);
    est = pred + gain * (src[i] - pred);
    ee = (1 - gain) * ee + Q / len;
    out[i] = est;
  }
  return out;
}
// Mỗi lần Kalman 50 cắt Kalman 150 là một đổi xu hướng. Cắt lên: hộp xanh từ đáy nến tới đáy + 0,5 ATR(200). Cắt xuống: hộp đỏ từ đỉnh nến trở xuống 0,5 ATR(200).
// Hộp kéo dài sang phải cho tới lần đổi cùng loại kế tiếp, nên là vùng hỗ trợ (xanh) và kháng cự (đỏ) theo xu hướng.
function kalmanLevels(ks, kl, h, l, atrA) {
  const n = ks.length, boxes = [], flips = [];
  let prev = null;
  for (let i = 0; i < n; i++) {
    if (!isFinite(ks[i]) || !isFinite(kl[i])) continue;
    const tu = ks[i] > kl[i];
    if (prev !== null && tu !== prev) {
      const a = isFinite(atrA[i]) ? atrA[i] : 0;
      flips.push({ i, up: tu });
      boxes.push(tu ? { i0: i, i1: n - 1, top: l[i] + a, bot: l[i], up: true } : { i0: i, i1: n - 1, top: h[i], bot: h[i] - a, up: false });
    }
    prev = tu;
  }
  for (const up of [true, false]) {
    const b = boxes.filter(x => x.up === up);
    for (let k = 0; k + 1 < b.length; k++) b[k].i1 = b[k + 1].i0 - 1;
  }
  return { boxes, flips };
}

(function () {


  Indicators.register({
    id: 'kal', label: 'Kalman', maxVote: 1,
    order: { calc: 60, all: 20, vote: 70, under: 30 },
    layer: { key: 'kal', label: 'Kalman', on: 0, order: 50 },
    toggle: { key: 'kal', label: 'Kalman', on: 1, order: 20 },
    drawWhere: 'under',

    calc({ h, l, c }) {
      const kS = kalmanF(c, 50), kL = kalmanF(c, 150), a14 = atrW(h, l, c, 14), a200 = atrW(h, l, c, 200);
      const kAtr = a200.map((x, i) => (isFinite(x) ? x : a14[i]) * 0.5);
      return { kalS: kS, kalL: kL, kal: kalmanLevels(kS, kL, h, l, kAtr) };
    },

    signalAll(ctx, add) {
      const { h, l, n, ind, FT } = ctx;
      if (FT.kal && ind.kal && n > 60) {
        const fl = new Map(ind.kal.flips.map(f => [f.i, f]));
        const lowB = ind.kal.boxes.filter(b => b.up), upB = ind.kal.boxes.filter(b => !b.up);
        let li = -1, ui = -1;
        for (let i = 2; i < n; i++) {
          while (li + 1 < lowB.length && lowB[li + 1].i0 <= i) li++;
          while (ui + 1 < upB.length && upB[ui + 1].i0 <= i) ui++;
          const ks = ind.kalS[i], kl = ind.kalL[i];
          if (!isN(ks) || !isN(kl)) continue;
          const f = fl.get(i);
          if (f) add(i, f.up ? 'buy' : 'sell', 'kal', 1.2, f.up
            ? `Kalman 50 cắt lên trên Kalman 150: xu hướng đổi sang tăng, hộp hỗ trợ ${fmt(l[i])}–${fmt(lowB[li].top)}`
            : `Kalman 50 cắt xuống dưới Kalman 150: xu hướng đổi sang giảm, hộp kháng cự ${fmt(upB[ui].bot)}–${fmt(h[i])}`);
          else if (ks > kl && li >= 0 && l[i] > lowB[li].top && l[i - 1] <= lowB[li].top)
            add(i, 'buy', 'kal', 1.0, `Giá hồi về chạm hộp hỗ trợ Kalman (${fmt(lowB[li].bot)}–${fmt(lowB[li].top)}) rồi bật lên trong xu hướng tăng`);
          else if (ks < kl && ui >= 0 && h[i] < upB[ui].bot && h[i - 1] >= upB[ui].bot)
            add(i, 'sell', 'kal', 1.0, `Giá hồi lên chạm hộp kháng cự Kalman (${fmt(upB[ui].bot)}–${fmt(upB[ui].top)}) rồi bị đẩy xuống trong xu hướng giảm`);
        }
      }
    },

    vote(ctx, i, vote) {
      const { ind, FT } = ctx;
      if (FT.kal && i >= 2 && isN(ind.kalS[i]) && isN(ind.kalL[i]) && isN(ind.kalS[i - 2])) {
        const ks = ind.kalS[i], kl = ind.kalL[i], up = ks > kl, rising = ks > ind.kalS[i - 2];
        vote('kal', (up ? 1 : -1) * (up === rising ? 1 : 0.3),
          `Kalman 50 ${up ? 'trên' : 'dưới'} Kalman 150 (${fmt(ks)} / ${fmt(kl)}): xu hướng ${up ? 'tăng' : 'giảm'}, đường 50 đang ${rising ? 'dốc lên' : 'dốc xuống'}${up === rising ? '' : ' (ngược xu hướng nên chỉ tính nhẹ)'}`);
      }
    },

    draw(R) {
      const { g, x, py, i0, i1, bw, plotW, priceH, hi, lo, n, C, A, ind, S, V, COL, zr } = R;
      if(S.L.kal&&ind.kalS){
        const KS=ind.kalS,KL=ind.kalL,UP='#13bd6e',DN='#af0d4b',ok=i=>isFinite(KS[i])&&isFinite(KL[i]);
        for(const b of ind.kal.boxes){
          if(b.i1<i0||b.i0>i1) continue;
          const xa=x(b.i0)-bw/2,xb=x(b.i1)+bw/2;
          g.fillStyle=b.up?'rgba(19,189,110,.26)':'rgba(175,13,75,.26)';
          g.fillRect(xa,py(b.top),xb-xa,Math.max(1,py(b.bot)-py(b.top)));
        }
        for(let i=Math.max(1,i0);i<=i1;i++){
          if(!ok(i)||!ok(i-1)) continue;
          g.fillStyle=KS[i]>KL[i]?'rgba(19,189,110,.16)':'rgba(175,13,75,.16)';
          g.beginPath();g.moveTo(x(i-1),py(KS[i-1]));g.lineTo(x(i),py(KS[i]));g.lineTo(x(i),py(KL[i]));g.lineTo(x(i-1),py(KL[i-1]));g.closePath();g.fill();
        }
        g.lineCap='round';
        for(const [arr,w,mode] of [[KL,2.6,'t'],[KS,1.6,'s']]){
          g.lineWidth=w;
          for(let i=Math.max(2,i0);i<=i1;i++){
            if(!ok(i)||!ok(i-1)||!isFinite(KS[i-2])) continue;
            g.strokeStyle=mode==='t'?(KS[i]>KL[i]?UP:DN):(KS[i]>KS[i-2]?UP:DN);
            g.beginPath();g.moveTo(x(i-1),py(arr[i-1]));g.lineTo(x(i),py(arr[i]));g.stroke();
          }
        }
        g.lineCap='butt';
        g.save();g.font='bold 11px sans-serif';g.textAlign='center';
        for(const f of ind.kal.flips){
          if(f.i<i0||f.i>i1) continue;
          const y=py(KS[f.i]);g.fillStyle=f.up?UP:DN;g.textBaseline=f.up?'top':'bottom';
          g.fillText((f.up?'▲ ':'▼ ')+fmt(C[f.i].c),x(f.i),f.up?y+7:y-7);
        }
        g.restore();
      }
    }
  });
})();
