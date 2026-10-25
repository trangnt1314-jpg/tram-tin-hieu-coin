/* ======================================================================
   ENGINE: dùng chung với bot: trọng số khung, kết luận đa khung, máy tính vị thế, kiểm tra tín hiệu
   ====================================================================== */
'use strict';
/* ---------- Dùng chung với bot: trọng số khung, quy tắc kết luận đa khung, máy tính vị thế ---------- */
const MTF_W = { '1d': 0.4, '4h': 0.3, '1h': 0.2, '15m': 0.1 };
const dirSg = d => d === 'buy' ? 1 : d === 'sell' ? -1 : 0;
const mtfReady = (v, fut) => fut ? !!v.side && /^(LONG|SHORT)( MẠNH)?$/.test(v.txt) : v.side === 'buy' && /^MUA( MẠNH)?$/.test(v.txt);
function mtfVerdict(R,no15,fut){
  const g=tf=>R[tf]?dirSg(R[tf].dir):0;
  const D1=g('1d'),H4=g('4h'),H1=g('1h'),M15=no15?0:g('15m');
  const tfs=Object.keys(R).filter(tf=>!(no15&&tf==='15m')),score=tfs.reduce((a,tf)=>a+MTF_W[tf]*R[tf].norm,0)/tfs.reduce((a,tf)=>a+MTF_W[tf],0);
  if(D1*H4===-1) return {cls:'wait',side:null,score,txt:'CHỜ',why:'Khung 1 ngày và 4h đang ngược nhau nên chưa có hướng chắc. Đứng ngoài đến khi hai khung này cùng chiều.'};
  const ctx=D1+H4>0?1:D1+H4<0?-1:0;
  if(ctx===0) return {cls:'wait',side:null,score,txt:'CHỜ',why:'Cả 1 ngày và 4h đều chưa cho xu hướng rõ ràng.'};
  const side=ctx>0?'buy':'sell',nm=ctx>0?'tăng':'giảm';
  if(H1!==ctx) return {cls:'wait',side:null,score,txt:'CHỜ',why:`Xu hướng lớn nghiêng ${nm} nhưng khung 1h chưa xác nhận cùng chiều. Chờ 1h quay theo.`};
  if(Math.abs(score)<0.25) return {cls:'wait',side:null,score,txt:'CHỜ',why:'Các khung cùng chiều nhưng độ nghiêng tổng còn yếu.'};
  if(side==='sell'&&!fut) return {cls:'sell',side,score,txt:'TRÁNH MUA',why:`1 ngày, 4h và 1h cùng nghiêng giảm${M15===ctx?', 15m cũng giảm':''}. Không bắt đáy lúc này.`};
  const nmw=fut?(side==='buy'?'LONG':'SHORT'):'MUA';
  if(!no15&&M15!==ctx) return {cls:side,side,score,txt:nmw+', chờ điểm vào',why:`1 ngày/4h/1h đã cùng nghiêng ${nm}. 15m chưa xác nhận, nên chờ 15m quay ${ctx>0?'lên':'xuống'} rồi mới vào để cắt lỗ gần hơn.`};
  const strong=D1===ctx&&H4===ctx&&Math.abs(score)>=0.5;
  return {cls:side,side,score,txt:strong?nmw+' MẠNH':nmw,why:strong?`Cả 4 khung cùng nghiêng ${nm}, độ nghiêng cao.`:`Đủ điều kiện: xu hướng lớn, 1h và 15m cùng nghiêng ${nm}.`};
}

/* Máy tính vị thế. fee là tổng phí cả hai chiều (tỉ lệ), mmr là tỉ lệ ký quỹ duy trì giả định. Ký quỹ cô lập, bỏ qua funding. */
function calcPos(p) {
  const sg = p.side === 'sell' ? -1 : 1, entry = +p.entry, sl = +p.sl, tp = +p.tp, cap = +p.cap, rp = +p.riskPct, lev = +p.lev || 1;
  const fee = p.fee == null ? 0.001 : +p.fee, mmr = p.mmr == null ? 0.005 : +p.mmr;
  if (!(cap > 0 && rp > 0 && entry > 0 && sl > 0)) return { ok: false, err: 'Nhập vốn, % rủi ro, giá vào và giá cắt lỗ.' };
  if (sg * (entry - sl) <= 0) return { ok: false, err: sg > 0 ? 'Lệnh mua: giá cắt lỗ phải thấp hơn giá vào.' : 'Lệnh bán: giá cắt lỗ phải cao hơn giá vào.' };
  const dist = Math.abs(entry - sl), distPct = dist / entry, riskAmt = cap * rp / 100;
  let qty = riskAmt / (dist + entry * fee), capped = false;
  const qtyMax = cap * lev / entry;
  if (qty > qtyMax) { qty = qtyMax; capped = true; }
  const notional = qty * entry, margin = notional / lev, feeAmt = notional * fee;
  const lossAtSL = qty * dist + feeAmt;
  const liqDistPct = 1 / lev - mmr, liq = entry * (1 - sg * liqDistPct);
  const slOk = liqDistPct > 0 && distPct <= liqDistPct * 0.8;
  const maxSafeLev = Math.max(1, Math.floor(1 / (distPct / 0.8 + mmr)));
  const hasTp = tp > 0 && sg * (tp - entry) > 0;
  const profitAtTP = hasTp ? qty * Math.abs(tp - entry) - feeAmt : null;
  const rr = hasTp ? Math.abs(tp - entry) / dist : null;
  return { ok: true, riskAmt, qty, notional, margin, lev, feeAmt, lossAtSL, liq, liqDistPct, distPct, slOk, maxSafeLev, profitAtTP, rr, capped, realRiskPct: lossAtSL / cap * 100 };
}

/* ---------- Hiệu lực tín hiệu MUA (dùng chung với bot) ----------
 * Tín hiệu hình thành ở nến 15m đầu tiên mà kết luận đa khung chuyển sang MUA / MUA MẠNH (điểm vào E0 = giá đóng nến đó).
 * Cắt lỗ = E0 - 1,5 ATR(1h), chốt lời = E0 + 2 lần rủi ro. Giá hiện tại P cho biết còn vào được hay đã trễ. */
const SIG_SLATR = 1.5, SIG_RR = 2;
function sigValidity(E, sl, tp, P, side, minRR) {
  const sg = side === 'sell' ? -1 : 1;
  const r = sg * (E - sl), m = sg * (P - E) / r;
  const rrT = sg * (tp - E) / r;                                        // R:R lúc tín hiệu hình thành
  const need = Math.min(minRR || +globalThis.__minRR || 1.5, rrT);      // R:R còn lại tối thiểu để chấp nhận vào lệnh
  const rrLeft = sg * (P - sl) > 0 ? sg * (tp - P) / (sg * (P - sl)) : 0;
  const lim = k => (tp + k * sl) / (1 + k);                             // giá vào để R:R còn lại đúng bằng k (giữ nguyên cắt lỗ và chốt lời)
  const limitPx = lim(need), noChase = lim(1);
  let st, txt;
  if (sg * (P - sl) <= 0) { st = 'sl'; txt = 'Hết hiệu lực: giá đã chạm cắt lỗ'; }
  else if (sg * (P - tp) >= 0) { st = 'tp'; txt = 'Hết hiệu lực: giá đã chạm chốt lời'; }
  else if (rrLeft >= need - 1e-9) { st = 'ok'; txt = `Còn hiệu lực: R:R còn lại 1:${rrLeft.toFixed(2)}, đạt mức tối thiểu 1:${need}`; }
  else if (rrLeft >= 1) { st = 'late'; txt = `Giá đã chạy ${m.toFixed(2)}R: R:R còn lại chỉ 1:${rrLeft.toFixed(2)}, thấp hơn mức tối thiểu 1:${need}. Đặt lệnh chờ quanh ${fmt(limitPx)} thay vì vào ngay`; }
  else { st = 'chase'; txt = 'Đã trễ: R:R còn lại dưới 1:1, đừng đuổi giá; chờ giá hồi về vùng đặt chờ hoặc chờ tín hiệu mới'; }
  return { st, txt, m, rrLeft, risk: r, maxEntry: limitPx, noChase, limitPx, need, rrT, side: sg > 0 ? 'buy' : 'sell' };
}
function sigStatus(a, P) {
  const q = sigValidity(a.E0, a.sl, a.tp, P, a.side);
  if (a.touched === 'sl') { q.st = 'sl'; q.txt = 'Hết hiệu lực: giá đã chạm cắt lỗ sau khi tín hiệu hình thành'; }
  else if (a.touched === 'tp') { q.st = 'tp'; q.txt = 'Hết hiệu lực: giá đã chạm chốt lời sau khi tín hiệu hình thành'; }
  return q;
}
// ents: { tf: { C: nến đã đóng, A: kết quả analyze } }. side: 'buy' (mặc định) hoặc 'sell' (chỉ có nghĩa khi fut = true, tức Futures).
// Trả về null nếu hiện không có tín hiệu đang chạy theo hướng đó.
function mtfAnchor(ord, ents, maxBack, force, side, fut) {
  side = side === 'sell' ? 'sell' : 'buy';
  const sg = side === 'sell' ? -1 : 1;
  const e15 = ents['15m'], e1 = ents['1h'];
  if (!e15 || !e1 || !e15.C.length) return null;
  const C15 = e15.C, n15 = C15.length;
  const idxAt = (C, ct) => { let lo = 0, hi = C.length - 1, r = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (C[mid].ct <= ct) { r = mid; lo = mid + 1; } else hi = mid - 1; } return r; };
  const readyAt = j => {
    const ct = C15[j].ct, R = {};
    for (const tf of ord) {
      const e = ents[tf]; if (!e) return false;
      const ix = tf === '15m' ? j : idxAt(e.C, ct);
      if (ix < 30) return false;
      const f = e.A.fcAt(ix);
      R[tf] = { dir: f.dir, pct: f.pct, norm: f.norm };
    }
    const v = mtfVerdict(R, false, fut);
    return v.side === side && mtfReady(v, fut);
  };
  let j = n15 - 1;
  const lim = Math.max(0, n15 - 1 - (maxBack || 192));
  if (readyAt(j)) { while (j > lim && readyAt(j - 1)) j--; }
  else if (!force) return null;
  const ct = C15[j].ct, ix1 = idxAt(e1.C, ct), atr = e1.A.ind.atr[ix1];
  if (!(atr > 0)) return null;
  const rrT = +globalThis.__rrT || SIG_RR, E0 = C15[j].c, risk = SIG_SLATR * atr, sl = E0 - sg * risk, tp = E0 + sg * rrT * risk;
  let touched = null;
  for (let k = j + 1; k < n15; k++) {
    if (sg > 0 ? C15[k].l <= sl : C15[k].h >= sl) { touched = 'sl'; break; }
    if (sg > 0 ? C15[k].h >= tp : C15[k].l <= tp) { touched = 'tp'; break; }
  }
  return { E0, sl, tp, risk, rr: rrT, ct, side, bars: n15 - 1 - j, capped: j === lim && lim > 0, touched };
}

if (typeof module !== 'undefined') module.exports = { analyze, genDemo, fmt, sma, ema, rsiW, atrW, calcInd, zigzag, checkImpulse, TYPE_LABEL, mtfVerdict, mtfReady, MTF_W, dirSg, calcPos, calcStats, sigValidity, sigStatus, mtfAnchor, SIG_SLATR, SIG_RR };
