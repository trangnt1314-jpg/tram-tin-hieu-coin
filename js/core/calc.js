/* ======================================================================
   CORE: calcInd, gom kết quả calc() của mọi chỉ báo vào object ind
   ind.atr (ATR14) và ind.volSma (SMA volume 20) là hạ tầng, nhiều chỉ báo dùng nên để ở đây.
   ====================================================================== */
'use strict';
function calcInd(o, h, l, c, v) {
  const n = c.length;
  const ind = { atr: atrW(h, l, c, 14), volSma: sma(v, 20) };
  const ctx = { o, h, l, c, v, n, ind };
  for (const p of Indicators.hooks('calc')) Object.assign(ind, p.calc(ctx));
  return ind;
}
