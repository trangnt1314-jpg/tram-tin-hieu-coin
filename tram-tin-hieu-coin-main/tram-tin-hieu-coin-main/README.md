# Trạm tín hiệu coin

Mở `index.html` bằng trình duyệt (Chrome hoặc Safari qua đường link, không mở trực tiếp từ ứng dụng ghi chú). Toàn bộ app nằm trong **một file `index.html`**: mỗi chỉ báo là một khối `<script>` riêng, đầu khối có chú thích ghi chỉ báo cung cấp gì và tín hiệu ra sao.

## Thư mục

| Đường dẫn | Việc |
|---|---|
| `index.html` | App (giao diện, engine chấm điểm, backtest, các chỉ báo) |
| `bot/run.js` | Bot quét tín hiệu, nhắn Telegram, ghi `data/` (nạp lại engine từ `index.html`, không viết lại) |
| `bot/config.json` | Danh sách mã, chế độ spot/futures, bộ lọc bổ trợ, cảnh báo đổi hướng |
| `data/signals.json`, `data/state.json` | Kết quả tín hiệu thật do bot ghi (tab "Kết quả thật" đọc file này) |
| `.github/workflows/signals.yml` | Chạy bot mỗi 15 phút trên GitHub Actions |
| `tools/bundle.py` | Chỉ cần khi quay lại bản tách `js/*.js`: gộp thành một file. Với `index.html` hiện tại (đã gộp sẵn) thì không cần |

## Chỉ báo hiện có

| Mã | Chỉ báo | Nhóm | Nút "Bổ trợ" mặc định |
|---|---|---|---|
| `macd` | MACD 12·26·9 | Động lượng | luôn tính |
| `srsi` | StochRSI + RSI 14 | Động lượng | luôn tính |
| `div` | Phân kỳ RSI/MACD | Động lượng | bật |
| `st` | Supertrend (ATR 10, ×3) | Xu hướng | tắt |
| `hull` | Hull Suite (HMA 55) | Xu hướng | tắt |
| `struct` | Cấu trúc giá BOS/CHoCH | Xu hướng | bật |
| `fvgob` | FVG Order Blocks [BigBeluga] | Vùng cung cầu | bật |
| `wyk` | Wyckoff (Spring, Upthrust, SOS, SOW) | Vùng cung cầu | tắt |
| `obv` | OBV | Dòng tiền | bật |
| `bb` | Bollinger 20·2 | Biến động | luôn tính |
| `vol` | Volume xác nhận | (không tính nhóm) | luôn tính |
| `reg` | ADX 14: "Lọc đi ngang" (ADX dưới 20 thì bỏ phiếu và tín hiệu của nhóm Xu hướng) | bộ lọc | tắt |
| `grp` | "Gom nhóm chỉ báo" (xem dưới) | cách chấm điểm | bật |

Đã bỏ: Fibonacci, FRVP, Ichimoku, Kalman, KDJ, Elliott, EMA 50/200, VWAP, Vùng giá (hỗ trợ/kháng cự).

## Cách chấm điểm

- Mỗi tín hiệu cần từ 3 điểm và từ 2 chỉ báo độc lập, trong cửa sổ 3 nến.
- **Gom nhóm chỉ báo (`grp`, mặc định bật):** các chỉ báo cùng nhóm chỉ được tính một lần (lấy cái mạnh nhất), và "độc lập" nghĩa là thuộc các nhóm khác nhau. Phần Dự báo cũng vậy: mỗi nhóm đóng góp tối đa một phiếu. Tắt nút này để về cách cũ (mỗi chỉ báo cộng điểm riêng) và so sánh kết quả.
- **Backtest:** khớp tại giá đóng cửa nến tín hiệu, có phí theo thị trường, chạm cả SL và TP trong một nến thì tính thua. Hiển thị tỷ lệ thắng, kỳ vọng (R), profit factor, sụt giảm tối đa, Sharpe và Sortino theo lệnh, MAE/MFE, kết quả theo chế độ thị trường (ADX), 30% dữ liệu mới nhất, và so với mua và giữ.

## Cảnh báo tương quan

Khi bộ quét có từ 3 mã trở lên cùng chiều, app hiện cảnh báo kèm tương quan lợi suất 1h trung bình giữa các mã đó (từ 0,6 trở lên thì coi là gần như một cược). Bot cũng nhắn cảnh báo tương tự khi một lần quét có từ `corrMin` (mặc định 3) tín hiệu mới cùng chiều.

## Lưu dữ liệu nến

Nút "⬇ Lưu nến" (thanh trên cùng) tải nến đang xem ra file CSV, tên file có mã, khung, thị trường, nguồn và thời điểm tải. Dữ liệu được lấy từ sàn tại lúc chạy nên chạy lại backtest sau này có thể ra kết quả khác; lưu file này để chạy lại đúng trên dữ liệu cũ.

## Thêm hoặc sửa chỉ báo

Mỗi chỉ báo tự đăng ký bằng `Indicators.register({...})` (xem chú thích ở khối "CORE: sổ đăng ký chỉ báo" trong `index.html`). Khai báo `group` để chỉ báo thuộc một nhóm khi gom nhóm. Nút bật/tắt, nhãn lý do và phiếu Dự báo có sẵn từ khai báo đó. Muốn đổi ngưỡng vào lệnh, cách gom nhóm hay cách tính Dự báo thì sửa khối "ENGINE: analyze()"; backtest nằm ở khối "ENGINE: backtest".
