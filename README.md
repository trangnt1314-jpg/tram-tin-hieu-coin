# Trạm tín hiệu — bản tách chỉ báo

Mở `index.html` như cũ (cả thư mục phải đi cùng nhau). Cần đưa lên host 1 file: chạy `python3 tools/bundle.py` → `dist/index-single.html`.

## Mỗi chỉ báo = 1 file trong `js/indicators/`

| File | Chỉ báo | Cung cấp (các trường app đọc) |
|---|---|---|
| `macd.js` | MACD 12·26·9 + khung MACD | `ind.macd, ind.sig, ind.hist` |
| `stochrsi.js` | StochRSI + RSI 14 + khung | `ind.rsi, ind.sk, ind.sd` |
| `kdj.js` | KDJ (chưa có nút bật) | `ind.K, ind.D, ind.J` |
| `bollinger.js` | Bollinger 20·2 | `ind.bbMid/bbUp/bbLo/bbBw` |
| `ichimoku.js` | Ichimoku 9·26·52 | `ind.tenkan/kijun/spanA/spanB` |
| `kalman.js` | Kalman Trend Levels | `ind.kalS/kalL/kal` |
| `ema-trend.js` | EMA 50/200, cộng trừ điểm theo xu hướng | `ind.ema50, ind.ema200` |
| `vwap.js` | VWAP | `A.ext.vwap` |
| `divergence.js` | Phân kỳ RSI/MACD | `A.ext.divs, A.ext.divAt` |
| `orderblock.js` | Order Block | `A.ext.obs, A.ext.obV` |
| `fvg.js` | Fair Value Gap | `A.ext.fvgs, A.ext.fvgV` |
| `fibonacci.js` | Fibonacci | `A.fib` |
| `sr-zones.js` | Vùng hỗ trợ/kháng cự | `A.zonesNow` |
| `volume.js` | Volume xác nhận | (dùng `ind.volSma`) |
| `elliott.js` | Sóng Elliott (chưa có nút bật) | `A.ew, A.ewLast` |
| `frvp.js` | FRVP (chỉ để xem) | `A.frvp` |

Trong mỗi file có đủ 4 phần: **calc** (tính), **signalAt/signalAll** (tín hiệu + điểm + lý do), **vote** (phiếu cho Dự báo), **draw/pane** (vẽ). Đầu file ghi rõ chỉ báo cung cấp gì.

## Sửa gì ở đâu

- Đổi tham số, ngưỡng, điểm, lý do hiển thị, màu vẽ của 1 chỉ báo → chỉ sửa file của nó.
- Ngưỡng vào lệnh (≥3 điểm, ≥2 chỉ báo độc lập, cửa sổ 3 nến, cách tính Dự báo) → `js/engine/analyze.js`.
- Backtest (`simulate`, `calcStats`) → `js/engine/backtest.js`.
- ATR14 và SMA volume 20 (nhiều chỉ báo dùng chung) → `js/core/calc.js`. ZigZag, fractal → `js/core/swings.js`.
- Giao diện, tải dữ liệu, vị thế, bộ quét → `js/app/app.js`.

## Thêm chỉ báo mới

Copy `js/indicators/_TEMPLATE.js.txt` thành `ten.js`, thêm 1 dòng `<script>` vào `index.html`. Nút bật/tắt, nhãn lý do, phiếu Dự báo tự có, không phải sửa chỗ khác.

## Lưu ý

- **Đừng xoá file chỉ báo** để tắt nó: `app.js` vẫn đọc trực tiếp một số trường (`ind.hist`, `ind.sk/sd`, `A.ext.divAt/obV`, `A.zonesNow`, `A.fib`, `A.frvp`, `A.ewLast`...) cho cảnh báo vị thế và bộ quét. Muốn tắt thì dùng nút trên giao diện, hoặc bỏ `signalAt` / `vote` trong file đó.
- Phụ thuộc: `divergence.js` cần `macd.js` + `stochrsi.js`; `bollinger.js`, `sr-zones.js`, `volume.js` cần `ind.volSma`.
- Số `order` trong mỗi chỉ báo chỉ quyết định thứ tự hiển thị lý do và thứ tự vẽ chồng lớp (giữ đúng như bản cũ).
