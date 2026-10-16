# REXUS v2.0.5 — Launcher, Liquid Glass Emoji Icons & User Audit

## Đã cập nhật

1. **Bộ chuyển ứng dụng dạng launcher**: nút grid nhỏ nằm trước chữ REXUS; bấm để mở danh sách REXUS / REXUS Document theo cảm hứng giao diện người dùng cung cấp. Chuyển hệ thống giữ chung phiên đăng nhập.
2. **Bỏ logo hình khối** trước tên REXUS trên header. Tên Document được phối màu xanh cyan sáng để phân biệt hệ thống, giữ Liquid Glass màu xanh navy/biển/dương, trắng, đen.
3. **Bộ emoji phong cách Liquid Glass** áp dụng cho điều hướng chính, nút chỉnh sửa/xóa/mở/quay lại, notification, search, file và các biểu tượng chính của REXUS Document, phần lớn thao tác chèn trên trình soạn thảo. Các ký tự B/I/U và một số ký hiệu có ý nghĩa định dạng văn bản vẫn được giữ để tránh gây nhầm lẫn.
4. **User audit trail**: migration mới `027_rexus_audit` cho bảng `rexus_audit_log`, index theo actor/thời gian/đối tượng. API `GET /api/rexus-audit`: người dùng xem hoạt động của bản thân, System Admin xem toàn bộ.
5. Ghi sự kiện tại **server sau thao tác**: đăng nhập/đăng xuất, Project/Task/Subtask/Worklog và các thao tác hiện ghi bằng `logActivity`, tạo/cập nhật/xóa Space & page, di chuyển trang, khôi phục phiên bản, tạo link chia sẻ nội bộ, upload/cập nhật/xóa file REXUS Document, upload/xóa file đính kèm ở Work Management. Log không chứa nội dung tài liệu, mật khẩu, token hoặc dữ liệu nhị phân file.
6. Truy cập qua **user menu → My Activity**, System Admin có thêm **Audit Log · All Users**. Có tìm kiếm trên các bản ghi đang hiển thị, phân trang 80 bản ghi, làm mới.

## Triển khai

- Khuyến nghị sao lưu database và Netlify Blobs trước khi cập nhật.
- Nếu chưa dùng REXUS Document, phải có migration `026_rexus_document`.
- **Bắt buộc áp dụng migration mới**: `netlify/database/migrations/027_rexus_audit/migration.sql`, trước khi triển khai mã nguồn 2.0.5 nếu muốn ghi log đầy đủ từ lần đăng nhập đầu.
- Dùng gói **LITE** triển khai lên Netlify theo quy trình hiện tại; bản **FULL** phục vụ lưu trữ và chỉnh sửa. Không thay đổi URL API cũ hay bảng dữ liệu Task/Subtask/Project.
- Sau deploy, hard refresh (Ctrl+Shift+R) để trình duyệt lấy script/CSS mới gắn `v=2.0.5`.
- Kiểm tra: mở app launcher, chuyển hai hệ thống, sửa tài liệu rồi lưu, upload 1 file, xem My Activity; dùng System Admin kiểm tra Audit Log toàn bộ.

## Các giới hạn và lưu ý kỹ thuật

- Lịch sử trong `rexus_audit_log` **bắt đầu từ khi bật v2.0.5**, không tự truy hồi tất cả sự kiện cũ. Bảng `activity_log` cũ được giữ nguyên.
- Audit là server-authored và endpoint mới **không cho client POST log**. Bản ghi được ghi theo cơ chế best-effort: hoạt động chính vẫn thành công ngay cả khi database log gặp sự cố; máy chủ sẽ ghi lỗi ra console. Theo dõi log triển khai để bảo đảm không thất thoát sự kiện.
- Chưa triển khai audit cấp độ từng ký tự, track changes trong văn bản, IP address, xác thực hai lớp, hay đồng chỉnh sửa thời gian thực.
- Icon emoji phụ thuộc bộ emoji của hệ điều hành; lớp kính/bóng/gradient được thiết kế bằng CSS. Một số ký hiệu đặc thù của trình soạn thảo còn dùng chữ B/I/U để người dùng hiểu chức năng.
- Đã kiểm tra cú pháp frontend và 40 file Netlify Functions; thử điều hướng desktop/mobile và drawer bằng DOM/bộ dữ liệu mô phỏng. **Chưa kiểm thử database/Netlify Blobs production hoặc migration chạy thật.**
