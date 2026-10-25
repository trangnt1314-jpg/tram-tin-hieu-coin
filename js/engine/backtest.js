/* ======================================================================
   ENGINE: backtest 1 tín hiệu và thống kê
   simulate(): khớp tại giá đóng cửa nến tín hiệu, nếu 1 nến chạm cả SL và TP thì tính thua. calcStats(): winrate, kỳ vọng, PF, drawdown.
   ====================================================================== */
'use strict';
/* ---------- Backtest ---------- */
function simulate(sig, h, l, c, n, MAXB) {
  const e = sig.entry, sl = sig.sl, tp = sig.tp, risk = Math.abs(e - sl), buy = sig.side === 'buy';
  const fee = (e * (globalThis.__fee == null ? 0.002 : globalThis.__fee)) / risk; // phí quy ra R, theo từng thị trường
  const end = Math.min(n - 1, sig.i + MAXB);
  for (let j = sig.i + 1; j <= end; j++) {
    const hitSL = buy ? l[j] <= sl : h[j] >= sl;
    const hitTP = buy ? h[j] >= tp : l[j] <= tp;
    if (hitSL) return { R: -1 - fee, status: 'sl', exit: j, bars: j - sig.i };
    if (hitTP) return { R: sig.rr - fee, status: 'tp', exit: j, bars: j - sig.i };
  }
  if (sig.i + MAXB <= n - 1) {
    const j = sig.i + MAXB;
    const R = (buy ? c[j] - e : e - c[j]) / risk - fee;
    return { R, status: 'time', exit: j, bars: MAXB };
  }
  return { R: null, status: 'open', exit: null, bars: n - 1 - sig.i };
}

function calcStats(trades) {
  const n = trades.length;
  if (!n) return { n: 0, wr: 0, exp: 0, pf: 0, dd: 0, total: 0 };
  let gw = 0, gl = 0, cum = 0, peak = 0, dd = 0, wins = 0;
  for (const t of trades) {
    if (t.R > 0) { gw += t.R; wins++; } else gl += -t.R;
    cum += t.R; if (cum > peak) peak = cum;
    if (peak - cum > dd) dd = peak - cum;
  }
  return { n, wr: wins / n, exp: cum / n, pf: gl > 0 ? gw / gl : (gw > 0 ? Infinity : 0), dd, total: cum };
}
