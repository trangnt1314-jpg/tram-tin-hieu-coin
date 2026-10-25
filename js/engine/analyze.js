/* ======================================================================
   ENGINE: analyze(), chấm điểm tín hiệu, Dự báo, backtest
   File này KHÔNG chứa logic của từng chỉ báo. Nó chỉ gọi các chỉ báo đã đăng ký trong js/indicators/.
   Muốn đổi cách chấm điểm (ngưỡng 3 điểm, 2 chỉ báo độc lập, cửa sổ 3 nến, R:R...) thì sửa file này.
   ====================================================================== */
'use strict';
const TYPE_LABEL = Indicators.labels();

function analyze(C, opts) {
  opts = opts || {};
  const FT = Object.assign({}, globalThis.__ft || {}, opts.ft || {});
  const RR = opts.rr || +globalThis.__rrT || 2, SLATR = opts.slAtr || 1.5, MAXB = opts.maxBars || 60;
  const n = C.length;
  const o = C.map(x => x.o), h = C.map(x => x.h), l = C.map(x => x.l), c = C.map(x => x.c), v = C.map(x => x.v);
  const ind = calcInd(o, h, l, c, v);  const piv = fractals(h, l, 5);
  const zz = zigzag(h, l, ind.atr, 2.5);

  // ctx: mọi thứ 1 chỉ báo có thể cần. X là kết quả "ext" (VWAP, OB, FVG, phân kỳ ...).
  const ctx = { C, o, h, l, c, v, n, ind, FT, piv, zz, X: { on: FT } };
  Indicators.hooks('prepare').forEach(p => p.prepare(ctx));
  Indicators.hooks('init').forEach(p => p.init(ctx.X, n));
  const X = ctx.X;

  const trig = Array.from({ length: n }, () => []);
  const add = (i, side, type, pts, txt, confirm) => trig[i].push({ side, type, pts, txt, confirm: !!confirm });
  // Quét cả chuỗi (VWAP, Kalman, phân kỳ, OB, FVG)
  for (const p of Indicators.hooks('signalAll')) p.signalAll(ctx, add);

  // Quét từng nến (MACD, StochRSI, Vùng giá, Bollinger, Ichimoku, Fibonacci, Volume)
  const START = 40;
  const barHooks = Indicators.hooks('signalAt');
  for (let i = START; i < n; i++) {
    for (const p of barHooks) p.signalAt(ctx, i, add);
  }

  const WIN = 3;
  const adjHooks = Indicators.hooks('scoreAdjust');
  function scoreAt(i) {
    const best = { buy: {}, sell: {} };
    for (let j = Math.max(0, i - WIN + 1); j <= i; j++) {
      for (const t of trig[j]) {
        const cur = best[t.side][t.type];
        if (!cur || t.pts > cur.pts || (t.pts === cur.pts && j > cur.j)) best[t.side][t.type] = Object.assign({ j }, t);
      }
    }
    const out = {};
    for (const side of ['buy', 'sell']) {
      const items = Object.values(best[side]).sort((a, b) => b.pts - a.pts);
      let s = items.reduce((a, x) => a + x.pts, 0);
      const distinct = items.filter(x => !x.confirm).length;
      let adj = 0;
      if (items.length) {
        for (const p of adjHooks) {
          const it = p.scoreAdjust(ctx, i, side);
          if (it) { adj += it.pts; items.push(it); }
        }
      }
      s = Math.max(0, s + adj);
      out[side] = { score: s, items, distinct, atBar: trig[i].some(t => t.side === side) };
    }
    return out;
  }

  // Sinh tín hiệu
  const signals = [];
  const lastAt = { buy: -99, sell: -99 };
  for (let i = START; i < n; i++) {
    const sc = scoreAt(i);
    const side = sc.buy.score >= sc.sell.score ? 'buy' : 'sell';
    const s = sc[side];
    if (s.score < 3 || s.distinct < 2 || !s.atBar) continue;
    if (i - lastAt[side] < 6) continue;
    const atr = ind.atr[i];
    if (!isN(atr)) continue;
    const risk = SLATR * atr, entry = c[i];
    const sig = {
      i, side, score: s.score, strength: Math.round(Math.min(100, s.score / 8 * 100)),
      entry, atr, risk, rr: RR,
      sl: side === 'buy' ? entry - risk : entry + risk,
      tp: side === 'buy' ? entry + RR * risk : entry - RR * risk,
      items: s.items, t: C[i].t
    };
    sig.res = simulate(sig, h, l, c, n, MAXB);
    signals.push(sig);
    lastAt[side] = i;
  }

  const closed = signals.filter(s => s.res.status !== 'open').map(s => ({ i: s.i, side: s.side, R: s.res.R }));
  const cut = Math.floor(n * 0.7);
  const stats = {
    all: calcStats(closed),
    buy: calcStats(closed.filter(t => t.side === 'buy')),
    sell: calcStats(closed.filter(t => t.side === 'sell')),
    oos: calcStats(closed.filter(t => t.i >= cut))
  };

  // Trạng thái hiện tại (nến đóng gần nhất)
  const sc = scoreAt(n - 1);
  const side = sc.buy.score >= sc.sell.score ? 'buy' : 'sell';
  const top = sc[side];
  const ok = top.score >= 3 && top.distinct >= 2;
  const now = {
    side, ok, strong: ok && top.score >= 5, score: top.score, items: top.items,
    strength: Math.round(Math.min(100, top.score / 8 * 100)), scores: { buy: sc.buy.score, sell: sc.sell.score }
  };
  // Kết quả riêng của từng chỉ báo (zonesNow, ew, ewLast, fib, frvp ...)
  const res = {};
  Indicators.hooks('result').forEach(p => p.result(ctx, res));
  const fsNow = res.fib;

  // ---- Dự báo cho các nến sắp tới: mỗi chỉ báo bỏ một phiếu theo trạng thái hiện tại ----
  const voteHooks = Indicators.hooks('vote');
  const votesAt = i => {
    const votes = [], vote = (type, v, txt) => votes.push({ type, v, txt });
    for (const p of voteHooks) p.vote(ctx, i, vote);
    return votes;
  };
  const votes = votesAt(n - 1);
  const MAXV = Indicators.maxVotes();
  const bias = votes.reduce((a, x) => a + x.v, 0), maxB = votes.reduce((a, x) => a + MAXV[x.type], 0) || 1;
  const dir = bias >= 0.25 * maxB ? 'buy' : bias <= -0.25 * maxB ? 'sell' : 'wait';
  const pct = Math.round(Math.min(100, Math.abs(bias) / maxB * 100));
  const fc = { dir, bias, max: maxB, pct, votes, horizon: MAXB, confirmed: now.ok && now.side === dir, strong: dir !== 'wait' && pct >= 55 && now.ok && now.side === dir };
  const atrN = ind.atr[n - 1];
  if (dir !== 'wait' && isN(atrN)) {
    const sg = dir === 'buy' ? 1 : -1, risk = SLATR * atrN, e = c[n - 1];
    fc.entry = e; fc.zoneLo = e - 0.3 * atrN; fc.zoneHi = e + 0.3 * atrN;
    fc.sl = e - sg * risk; fc.tp1 = e + sg * RR * risk; fc.rr = RR; fc.slPct = risk / e * 100;
    const r2 = Math.max(3, RR + 1); fc.tp2 = e + sg * r2 * risk; fc.tp2Src = 'R:R 1:' + r2;
    if (fsNow && fsNow.up === (dir === 'buy')) { const x = fsNow.ex(1.618); if (sg * (x - fc.tp1) > 0) { fc.tp2 = x; fc.tp2Src = 'Fib mở rộng 161,8%'; } }
  } else if (dir !== 'wait') fc.dir = 'wait';

  const fcAt = i => { const vs = votesAt(i); const b = vs.reduce((a, x) => a + x.v, 0), m = vs.reduce((a, x) => a + MAXV[x.type], 0) || 1, nr = b / m; return { dir: nr >= 0.25 ? 'buy' : nr <= -0.25 ? 'sell' : 'wait', norm: nr, pct: Math.round(Math.min(100, Math.abs(nr) * 100)) }; };
  return Object.assign({ C, ind, signals, stats, now, zz, n, fc, fcAt, ext: X }, res);
}
