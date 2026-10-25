/* ======================================================================
   Sóng Elliott (nhận diện sóng đẩy 5 sóng theo các quy tắc cứng)
   Dùng ZigZag (js/core/swings.js). Kết quả: A.ew (danh sách sự kiện), A.ewLast (sự kiện gần nhất), A.zz.
   Chưa có nút bật trên chart nên hiện chỉ tính, chưa vẽ. Muốn vẽ: thêm layer: { key: "ew", label: "Elliott", on: 0, order: 95 }.
   ====================================================================== */
'use strict';
/* ---------- Elliott: nhận diện sóng đẩy 5 sóng theo các quy tắc cứng ---------- */
function checkImpulse(pts, full) {
  const sign = pts[0].t === 'L' ? 1 : -1;
  const x = pts.map(q => q.p * sign);
  const w1 = x[1] - x[0], w3 = x[3] - x[2];
  const w2r = (x[1] - x[2]) / w1, w4r = (x[3] - x[4]) / w3;
  if (!(w1 > 0 && x[2] > x[0] && x[2] < x[1] && w2r >= 0.2 &&
        x[3] > x[1] && x[4] > x[1] && x[4] < x[3] && w4r >= 0.15 && w4r <= 0.786)) return null;
  if (full) {
    if (!(x[5] > x[4])) return null;
    const w5 = x[5] - x[4];
    if (w3 < w1 && w3 < w5) return null;
    return { sign, w1, w3, w5, w2r, w4r, full: true };
  }
  if (w3 < w1) return null;
  return { sign, w1, w3, w2r, w4r, full: false, target: (x[4] + w1) * sign };
}

function ewText(ev) {
  const r = ev.r, up = r.sign > 0, dir = up ? 'tăng' : 'giảm';
  if (ev.kind === 'w5') {
    return `Elliott: cấu trúc sóng 1-2-3-4 ${dir} hợp lệ. Sóng 2 hồi ${Math.round(r.w2r * 100)}% sóng 1, ` +
      `sóng 3 dài ${(r.w3 / r.w1).toFixed(2)} lần sóng 1, sóng 4 hồi ${Math.round(r.w4r * 100)}% sóng 3 ` +
      `và không chồng lên sóng 1. Kỳ vọng sóng 5 ${dir}, mục tiêu tham khảo ~${fmt(ev.target)}`;
  }
  return `Elliott: 5 sóng ${dir} có vẻ đã hoàn tất (sóng 3 không phải sóng ngắn nhất, sóng 4 không chồng sóng 1). ` +
    `Sau đó thường có nhịp điều chỉnh A-B-C ngược chiều, nên ${ev.side === 'buy' ? 'canh mua đảo chiều' : 'chốt lời hoặc canh bán'}`;
}

function elliottEvents(piv) {
  const ev = [];
  for (let k = 4; k < piv.length; k++) {
    if (k >= 5) {
      const pts = piv.slice(k - 5, k + 1);
      const r = checkImpulse(pts, true);
      if (r) ev.push({ kind: 'done', i: piv[k].conf, pts, r, side: r.sign > 0 ? 'sell' : 'buy' });
    }
    const p5 = piv.slice(k - 4, k + 1);
    const r5 = checkImpulse(p5, false);
    if (r5) ev.push({ kind: 'w5', i: piv[k].conf, pts: p5, r: r5, side: r5.sign > 0 ? 'buy' : 'sell', target: r5.target });
  }
  ev.forEach(e => { e.text = ewText(e); });
  return ev;
}

(function () {


  Indicators.register({
    id: 'ew', label: 'Elliott',
    order: { prepare: 10, result: 20, over: 60 },
    // layer: { key: 'ew', label: 'Elliott', on: 0, order: 95 },
    drawWhere: 'over',

    prepare(ctx) { ctx.ew = elliottEvents(ctx.zz.piv); },

    result(ctx, res) {
      res.ew = ctx.ew;
      res.ewLast = ctx.ew.length ? ctx.ew[ctx.ew.length - 1] : null;
    },

    draw(R) {
      const { g, x, py, i0, i1, bw, plotW, priceH, hi, lo, n, C, A, ind, S, V, COL, zr } = R;
      if(S.L.ew){
        g.strokeStyle='rgba(75,70,184,0.28)';g.lineWidth=1;g.setLineDash([3,4]);g.beginPath();
        A.zz.piv.forEach((q,k)=>{const xx=x(q.j),yy=py(q.p);k?g.lineTo(xx,yy):g.moveTo(xx,yy);});
        if(A.zz.tent) g.lineTo(x(A.zz.tent.j),py(A.zz.tent.p));
        g.stroke();g.setLineDash([]);
        const ev=S.selEw||A.ewLast;
        if(ev){
          g.strokeStyle=COL.wave;g.lineWidth=2.2;g.beginPath();
          ev.pts.forEach((q,k)=>{const xx=x(q.j),yy=py(q.p);k?g.lineTo(xx,yy):g.moveTo(xx,yy);});g.stroke();
          g.textAlign='center';g.font='bold 12px "Be Vietnam Pro",system-ui,sans-serif';
          ev.pts.forEach((q,k)=>{
            const xx=x(q.j),isH=q.t==='H',yy=py(q.p)+(isH?-13:13);
            g.fillStyle='#fff';g.strokeStyle=COL.wave;g.lineWidth=1.5;g.beginPath();g.arc(xx,yy,9,0,7);g.fill();g.stroke();
            g.fillStyle=COL.wave;g.textBaseline='middle';g.fillText(String(k),xx,yy+0.5);
          });
          g.font='12px "Be Vietnam Pro",system-ui,sans-serif';
          if(ev.kind==='w5'&&isFinite(ev.target)){
            const yT=py(ev.target),lp=ev.pts[ev.pts.length-1];
            g.strokeStyle=COL.wave;g.setLineDash([2,4]);g.lineWidth=1.4;g.beginPath();g.moveTo(x(lp.j),yT);g.lineTo(plotW,yT);g.stroke();g.setLineDash([]);
            g.fillStyle=COL.wave;g.textAlign='right';g.textBaseline='bottom';g.fillText('Mục tiêu sóng 5 ~'+fmt(ev.target),plotW-6,yT-2);
          }
        }
      }
    }
  });
})();
