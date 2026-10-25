/* ======================================================================
   CORE: sổ đăng ký chỉ báo (Indicators)
   Mỗi file trong js/indicators/ tự đăng ký 1 chỉ báo bằng Indicators.register({...}).
   Engine (js/engine/analyze.js) và giao diện (js/app/app.js) chỉ gọi qua đây,
   nên thêm / sửa / bỏ 1 chỉ báo không phải đụng vào chúng.

   Các "móc" (hook) mà 1 chỉ báo có thể khai báo (cái nào không cần thì bỏ):
     calc(ctx)               tính giá trị, trả về object gộp vào ind (ind.macd, ind.hist ...)
     prepare(ctx)            tạo dữ liệu dùng chung vào ctx trước khi quét tín hiệu
     init(X, n)              khởi tạo trường trong ctx.X (kết quả ext của analyze)
     signalAll(ctx, add)     quét cả chuỗi 1 lần rồi add(...) tín hiệu (VWAP, OB, FVG, ...)
     signalAt(ctx, i, add)   tín hiệu tại từng nến i
     vote(ctx, i, vote)      phiếu cho phần "Dự báo" (vote(type, giá_trị, lý_do))
     scoreAdjust(ctx,i,side) cộng/trừ điểm (EMA xu hướng dùng cái này)
     result(ctx, res)        thêm trường vào kết quả analyze (zonesNow, fib, frvp ...)
     draw(R)                 vẽ lên biểu đồ giá, drawWhere: 'under' (dưới nến) hoặc 'over' (trên nến)
     pane(R, P)              vẽ khung chỉ báo phía dưới (MACD, KDJ, StochRSI)
   Thuộc tính:
     id, label, maxVote      mã loại tín hiệu, nhãn hiển thị, điểm phiếu tối đa
     layer {key,label,on,order}   nút bật/tắt lớp vẽ trên chart
     toggle{key,label,on,order}   nút "Bổ trợ" (bật/tắt tính vào điểm)
     order {calc,prepare,all,bar,vote,adjust,result,under,over,pane}
                              số nhỏ chạy / vẽ trước; chỉ ảnh hưởng thứ tự hiển thị và thứ tự vẽ chồng
   ====================================================================== */
'use strict';
const Indicators = (function () {
  const list = [];
  const KEY = { calc: 'calc', prepare: 'prepare', signalAll: 'all', signalAt: 'bar', vote: 'vote', scoreAdjust: 'adjust', result: 'result', init: 'init' };
  const ord = (p, k) => (p.order && p.order[k] != null) ? p.order[k] : 1000;
  const sorted = (arr, k) => arr.slice().sort((a, b) => ord(a, k) - ord(b, k));
  return {
    register(p) {
      if (!p || !p.id) throw new Error('Chỉ báo thiếu id');
      if (list.some(q => q.id === p.id)) throw new Error('Trùng id chỉ báo: ' + p.id);
      list.push(p);
    },
    list: () => list.slice(),
    get: id => list.find(p => p.id === id),
    hooks: name => sorted(list.filter(p => typeof p[name] === 'function'), KEY[name] || name),
    drawers: where => sorted(list.filter(p => typeof p.draw === 'function' && (p.drawWhere || 'over') === where), where),
    panes: () => sorted(list.filter(p => typeof p.pane === 'function'), 'pane'),
    layers: () => list.filter(p => p.layer).sort((a, b) => (a.layer.order || 0) - (b.layer.order || 0)).map(p => [p.layer.key, p.layer.label]),
    layerDefaults: () => { const o = {}; for (const p of list) if (p.layer) o[p.layer.key] = p.layer.on ? 1 : 0; return o; },
    toggles: () => list.filter(p => p.toggle).sort((a, b) => (a.toggle.order || 0) - (b.toggle.order || 0)).map(p => [p.toggle.key, p.toggle.label]),
    toggleDefaults: () => { const o = {}; for (const p of list) if (p.toggle) o[p.toggle.key] = p.toggle.on ? 1 : 0; return o; },
    labels: () => { const o = {}; for (const p of list) o[p.id] = p.label || p.id; return o; },
    maxVotes: () => { const o = {}; for (const p of list) if (p.maxVote != null) o[p.id] = p.maxVote; return o; }
  };
})();
