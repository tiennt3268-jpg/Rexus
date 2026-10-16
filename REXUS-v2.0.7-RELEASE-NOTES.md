# REXUS v2.0.7 — 2D White-Line Glass Icons + Compact App Switch + Header Document Search

## Phạm vi

Cập nhật giao diện trên nền **REXUS v2.0.6**, không thay đổi dữ liệu, schemas, Netlify Functions, logic công việc, phiên bản tài liệu, file upload hoặc cơ chế authentication.

### Thay đổi chính

1. Thay biểu tượng emoji trong các thành phần giao diện REXUS & REXUS Document bằng **SVG 2D nét vẽ trắng** trên tile **Liquid Glass** xanh dương: sidebar, Home, Spaces, Folder/File, trình soạn thảo (các nút có biểu tượng), app launcher, thông báo và audit. Các ký tự định dạng mang ý nghĩa chữ như **B/I/U**, kích cỡ và tên mục vẫn được giữ để dễ đọc.
2. **Nút App Switch nhỏ 25–27px, đặt ngay bên phải chữ REXUS / REXUS Document**, không có logo trước tên. Vẫn dùng menu 2 ứng dụng và đăng nhập chung.
3. **Document Search** đặt tại header chung, cùng vị trí thanh Search của REXUS Work Management; có bộ lọc All/Title/Content/Labels/Files, tìm trong nội dung tài liệu và file. Ô tìm kiếm cố định, không bị dựng lại sau mỗi ký tự. Ở màn hình mobile search có hàng riêng trên header. Trong lúc sửa Document, search bị khóa để tránh mất bản nháp.
4. Giao diện desktop/mobile có điều chỉnh spacing nhằm tránh tràn tiêu đề ở sidebar thu gọn.

### Test

- Kiểm tra cú pháp JS (Node): **PASS**.
- Browser simulation (Chromium với API giả lập, dữ liệu mẫu): **PASS** (desktop 1440px, mobile 390px). Mở launcher, chuyển sang Document, tìm Labels, Clear search, mở Folder, mở Editor, kiểm tra toolbar và trạng thái search disabled; không có lỗi JavaScript trong chuỗi thử này.
- Đây là kiểm thử UI. Chưa kết nối/kiểm thử Netlify database, Blobs và production.
- Các hạn chế đã nêu trong REXUS v2.0.6 vẫn còn (ví dụ Mermaid chỉ hỗ trợ preview cơ bản và PDF sử dụng Print/Save as PDF).

### Migrations / triển khai

- **Không có migration mới cho v2.0.7.** Nếu deploy từ phiên bản trước v2.0.6 thì phải áp dụng các migration đến `028_rexus_document_drive` trước.
- Source backend và các migrations **không thay đổi** so với bản v2.0.6.
- Sao lưu database và files trước khi cập nhật hệ thống production. Triển khai bản LITE thử trước và kiểm tra các nghiệp vụ quan trọng.

### Bàn giao

- `REXUS-v2.0.7-FULL-Source.zip` — full source, cấu hình, migration và tài liệu.
- `REXUS-v2.0.7-LITE-Netlify.zip` — deploy package (public, Netlify Functions/migrations, cấu hình, manifest dependencies) không có node_modules, tài liệu, source map hoặc test artifact.
