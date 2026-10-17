#!/usr/bin/env node
'use strict';
/*
 * Bot quét tín hiệu cho Trạm tín hiệu.
 * - Dùng đúng bộ phân tích và quy tắc đa khung nằm trong index.html (không viết lại, tránh lệch kết quả).
 * - Mỗi lần chạy: cập nhật kết quả các tín hiệu đang mở, kiểm tra tín hiệu MUA mới, nhắn Telegram,
 *   ghi data/signals.json (để tab "Kết quả thật" đọc) và data/state.json.
 * - Cần Node 18 trở lên. Không cần cài thêm thư viện.
 * Biến môi trường: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (không bắt buộc, thiếu thì chỉ ghi dữ liệu).
 * Công cụ phân tích, không phải lời khuyên đầu tư.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const DATA = process.env.BOT_DATA_DIR || path.join(ROOT, 'data');
const HTML = process.env.BOT_HTML || path.join(ROOT, 'index.html');
const CFG = process.env.BOT_CONFIG || path.join(__dirname, 'config.json');

const STEP = { '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5 };
const IVB = { '15m': '15', '1h': '60', '4h': '240', '1d': 'D' };
const SLATR = 1.5, RR = 2;            // giống mặc định trong app: cắt lỗ 1,5 ATR(1h), chốt lời 2R
const ALL4 = ['1d', '4h', '1h', '15m'];
const MK = {
  coin:   { name: 'Coin',         hosts: ['https://data-api.binance.vision', 'https://api.binance.com'], path: '/api/v3/klines', fee: 0.002,  tfs: ALL4, minRaw: 250 },
  stock:  { name: 'Cổ phiếu',     hosts: ['https://fapi.binance.com'], path: '/fapi/v1/klines', fee: 0.001,  tfs: ALL4, minRaw: 60 },
  bstock: { name: 'Bybit TradFi', hosts: ['https://api.bybit.com', 'https://api.bytick.com'], bybit: true, fee: 0.0012, tfs: ALL4, minRaw: 100 },
  fx:     { name: 'Forex',        hosts: ['https://api.bybit.com', 'https://api.bytick.com'], bybit: true, fee: 0.0006, tfs: ['4h', '1h', '15m'], minRaw: 100 },
};

/* ---------- nạp bộ phân tích từ index.html (script đầu tiên) ---------- */
function loadEngine() {
  const html = fs.readFileSync(HTML, 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Không tìm thấy bộ phân tích trong index.html');
  const sb = { module: { exports: {} }, console: { log() {}, error() {}, warn() {} } };
  vm.createContext(sb);
  vm.runInContext(m[1], sb, { timeout: 20000 });
  const E = sb.module.exports;
  if (!E.analyze || !E.mtfVerdict) throw new Error('index.html thiếu hàm phân tích, hãy dùng bản index.html mới nhất');
  E.setFee = f => vm.runInContext('globalThis.__fee=' + f, sb);
  return E;
}

/* ---------- dữ liệu nến ---------- */
async function getJSON(url) {
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    return await r.json();
  } finally { clearTimeout(to); }
}
async function hostsTry(M, q) {
  let last;
  for (const h of M.hosts) {
    try { return await getJSON(h + q); } catch (e) { last = e; if (e.status === 400) throw e; }
  }
  throw last;
}
const kPath = (M, sym, tf, limit) => M.bybit
  ? `/v5/market/kline?category=linear&symbol=${sym}&interval=${IVB[tf]}&limit=${limit}`
  : `${M.path}?symbol=${sym}&interval=${tf}&limit=${limit}`;
function kParse(M, raw, tf) {
  if (M.bybit) {
    if (!raw || raw.retCode !== 0) throw new Error((raw && raw.retMsg) || 'lỗi Bybit');
    return raw.result.list.map(k => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5], ct: +k[0] + STEP[tf] - 1 })).sort((a, b) => a.t - b.t);
  }
  if (!Array.isArray(raw)) throw new Error('dữ liệu không hợp lệ');
  return raw.map(k => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5], ct: k[6] }));
}
async function klines(mk, sym, tf, limit = 1000) {
  const M = MK[mk];
  return kParse(M, await hostsTry(M, kPath(M, sym, tf, limit)), tf);
}

/* ---------- đánh giá một mã ---------- */
async function evaluate(E, mk, sym, now) {
  const M = MK[mk];
  E.setFee(M.fee);
  const raw = await Promise.all(M.tfs.map(tf => klines(mk, sym, tf)));
  const C = {}, A = {}, R = {};
  M.tfs.forEach((tf, i) => {
    const cs = raw[i];
    if (cs.length && cs[cs.length - 1].ct > now) cs.pop();     // bỏ nến đang chạy
    if (cs.length < M.minRaw) throw new Error('ít dữ liệu khung ' + tf);
    C[tf] = cs; A[tf] = E.analyze(cs);
    const fc = A[tf].fc;
    R[tf] = { dir: fc.dir, pct: fc.pct, norm: fc.bias / fc.max };
  });
  return { v: E.mtfVerdict(R), R, C, A };
}

/* ---------- kết quả tín hiệu đang mở ---------- */
function fin(s, status, price, ts) {
  s.status = status; s.exit = price; s.closedAt = ts;
  s.R = (price - s.entry) / s.risk - s.entry * s.fee / s.risk;
  return true;
}
async function updateOpen(s, now, expireMs) {
  const cs = await klines(s.mk, s.sym, '15m', 1000);         // gồm cả nến đang chạy
  for (const c of cs) {
    if (c.t < s.from) continue;
    if (c.l <= s.sl) return fin(s, 'loss', s.sl, Math.min(c.ct, now));     // chạm cả hai mức trong một nến thì tính thua
    if (c.h >= s.tp) return fin(s, 'win', s.tp, Math.min(c.ct, now));
  }
  if (now - s.t >= expireMs) {
    const closed = cs.filter(c => c.ct <= now);
    const last = closed.length ? closed[closed.length - 1] : cs[cs.length - 1];
    return fin(s, 'expired', last.c, now);
  }
  return false;
}

/* ---------- Telegram ---------- */
async function tg(text) {
  const tok = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!tok || !chat || process.env.BOT_DRY) { console.log('[telegram]', text.replace(/\n/g, ' | ')); return false; }
  try {
    const r = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    });
    if (!r.ok) console.error('Telegram lỗi HTTP', r.status);
    return r.ok;
  } catch (e) { console.error('Telegram lỗi:', e.message); return false; }
}

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const baseOf = sym => sym.replace(/USDT$/, '');
const arrow = d => d === 'buy' ? '▲' : d === 'sell' ? '▼' : '–';

async function main() {
  const E = loadEngine();
  const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
  fs.mkdirSync(DATA, { recursive: true });
  const sigFile = path.join(DATA, 'signals.json'), stFile = path.join(DATA, 'state.json');
  const log = readJSON(sigFile, { lastRun: 0, signals: [] }), state = readJSON(stFile, { v: {} });
  if (!Array.isArray(log.signals)) log.signals = [];
  if (!state.v) state.v = {};
  const before = JSON.stringify(log.signals) + JSON.stringify(state);
  const now = Date.now(), cool = (cfg.cooldownHours || 6) * 36e5, expire = (cfg.expireHours || 60) * 36e5;
  const msgs = [];
  let ok = 0, bad = 0, lastErr = '';

  // 1) cập nhật tín hiệu đang mở
  for (const s of log.signals.filter(x => x.status === 'open')) {
    try {
      if (await updateOpen(s, now, expire)) {
        const r = (s.R >= 0 ? '+' : '') + s.R.toFixed(2) + 'R';
        const icon = s.status === 'win' ? '✅ Chạm chốt lời' : s.status === 'loss' ? '❌ Chạm cắt lỗ' : '⏱ Hết hạn theo dõi';
        msgs.push(`${icon}: ${baseOf(s.sym)} (${MK[s.mk].name})\nGiá vào ${E.fmt(s.entry)}, giá thoát ${E.fmt(s.exit)}, kết quả ${r} (đã trừ phí giả định).`);
      }
      ok++;
    } catch (e) { bad++; lastErr = e.message; console.error('Cập nhật lệnh lỗi', s.sym, e.message); }
  }

  // 2) kiểm tra tín hiệu mới
  for (const it of cfg.symbols || []) {
    if (!MK[it.mk]) { console.error('Thị trường không hợp lệ:', it.mk); continue; }
    const key = it.mk + ':' + it.sym;
    try {
      const r = await evaluate(E, it.mk, it.sym, now);
      ok++;
      const v = r.v, ready = v.side === 'buy' && /^MUA( MẠNH)?$/.test(v.txt);
      const prev = state.v[key], M = MK[it.mk];
      let last = prev ? prev.last || 0 : 0;
      if (prev && ready && !prev.ready && now - last >= cool) {
        const e1 = r.A['1h'], atr = e1.ind.atr[e1.n - 1], c15 = r.C['15m'] || r.C['1h'], lc = c15[c15.length - 1];
        if (Number.isFinite(atr) && atr > 0) {
          const entry = lc.c, risk = SLATR * atr, sl = entry - risk, tp = entry + RR * risk;
          const dirs = {}; M.tfs.forEach(tf => { dirs[tf] = r.R[tf].dir; });
          log.signals.push({ id: key + ':' + now, mk: it.mk, sym: it.sym, t: now, from: lc.ct + 1, side: 'buy', entry, sl, tp, risk, rr: RR, fee: M.fee,
            verdict: v.txt, score: Math.round(v.score * 100), dirs, status: 'open', R: null });
          last = now;
          const sc = Math.round(v.score * 100);
          msgs.push(`🟢 ${v.txt} ${baseOf(it.sym)} (${M.name})\nGiá hiện tại: ${E.fmt(entry)}\nCắt lỗ: ${E.fmt(sl)} (−${(risk / entry * 100).toFixed(2)}%)\nChốt lời: ${E.fmt(tp)} (+${(RR * risk / entry * 100).toFixed(2)}%, lãi/lỗ 1:${RR})\nKhung: ${M.tfs.map(tf => tf + ' ' + arrow(r.R[tf].dir)).join(' · ')}, điểm ${sc > 0 ? '+' : ''}${sc}\nKết luận chốt theo nến đã đóng, giá có thể đã chạy xa. Hãy kiểm tra lại giá và tự tính khối lượng theo mức rủi ro của bạn trước khi vào lệnh. Chỉ là công cụ phân tích, không phải lời khuyên đầu tư.`);
        }
      }
      state.v[key] = { txt: v.txt, ready, last };
    } catch (e) { bad++; lastErr = e.message; console.error('Lỗi', key, e.message); }
  }

  // 3) báo lỗi nếu không tải được gì (tối đa 12 giờ một lần)
  if (!ok && bad && now - (state.errTs || 0) > 12 * 36e5) {
    state.errTs = now;
    msgs.push(`⚠️ Bot không tải được dữ liệu từ sàn (${lastErr}). Nếu chạy trên GitHub Actions, có thể sàn chặn địa chỉ máy chủ của GitHub. Xem README-bot.md để chạy bot trên máy hoặc máy chủ khác.`);
  }

  for (const m of msgs) await tg(m);

  // 4) lưu dữ liệu (chỉ ghi khi có thay đổi để tránh tạo commit liên tục)
  if (log.signals.length > 500) {
    const open = log.signals.filter(x => x.status === 'open'), closed = log.signals.filter(x => x.status !== 'open').sort((a, b) => a.t - b.t);
    log.signals = open.concat(closed.slice(-(500 - open.length))).sort((a, b) => a.t - b.t);
  }
  const changed = JSON.stringify(log.signals) + JSON.stringify(state) !== before;
  if (changed || now - (log.lastRun || 0) > 6 * 36e5) {
    log.lastRun = now;
    fs.writeFileSync(sigFile, JSON.stringify(log, null, 1));
  }
  if (changed) fs.writeFileSync(stFile, JSON.stringify(state, null, 1));
  console.log(`Xong: ${ok} thành công, ${bad} lỗi, ${msgs.length} tin nhắn, ${log.signals.filter(x => x.status === 'open').length} tín hiệu đang mở.`);
  return { log, state, msgs };
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { main, loadEngine, MK };
