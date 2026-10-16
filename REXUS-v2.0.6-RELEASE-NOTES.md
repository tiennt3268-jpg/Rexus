# REXUS v2.0.6 — REXUS Document Drive + Pageless Editor

**Trạng thái:** Bản triển khai thử nghiệm (release candidate). Chưa kiểm thử trực tiếp database, auth và Netlify Blobs production. **Không tuyên bố đạt toàn bộ 20 tiêu chí nghiệm thu.**

## Phạm vi và tương thích

- Nâng cấp **REXUS Document**, không phải GAAP; vẫn dùng chung session, API và database hiện tại, giữ nguyên REXUS Work Management v2.0.5 (Project/Task/Subtask/Worklog/Calendar/KPI/Payroll).
- Duy trì Liquid Glass, launcher 2 app và theme xanh navy/ocean/cyan. Giao diện tiếng Anh.
- Các bảng cũ, ID, body, version history, blob key và Task/Subtask document links được giữ nguyên. **Không có migration chuyển đổi/xóa dữ liệu cũ.**
- Các trang hiện có vốn là bản ghi `rexus_documents.kind=page` độc lập; v2.0.6 tiếp tục sử dụng trực tiếp mô hình này. Folder là `kind=folder`. File cũ được gắn với page; file mới có thể nằm trực tiếp trong folder.

## Tính năng triển khai

1. Pageless editor/reader không khung A4, không footer, font mặc định **16px** cho văn bản chưa định dạng (không sửa các font-size đã lưu); hỗ trợ font family và size, heading 1–6, format cơ bản, bảng, checklist, link, callout, code.
2. Tách metadata ra sidebar Details; label chỉnh sửa riêng, phiên bản và chia sẻ trong sidebar.
3. Toolbar sticky, Insert menu, table picker 8×8, thao tác bảng cơ bản (thêm/xóa hàng/cột, merge ngang/split), tìm kiếm title/content/labels/files.
4. Sanitized HTML insert + preview; không thực thi JavaScript tùy ý.
5. Mermaid input/edit stored as source code, live *basic flowchart preview*; các loại sequence/gantt/class giữ mã nguồn và chỉ hiển thị dạng code (không có engine Mermaid đầy đủ).
6. Table of Contents tạo và refresh từ H1–H6, link đến heading trong trang.
7. Space > Folder > Document/uploaded files; table List View mặc định, sort/filter, breadcrumb thực, rename/move/copy/delete, folder comments/replies/update/delete-own, PDF/image browser preview.
8. Autosave idle ~2.5 s, optimistic version checks với expected_version, local draft recovery, version history với preview/restore; lưu mới revision mỗi khi thực sự có thay đổi.
9. Export `.docx` dưới dạng ZIP WordprocessingML có thể mở trong Word/LibreOffice (đã thử render 1 file mẫu), hỗ trợ text, headings, bảng, inline formatting, external links, PNG/JPEG. **Chưa hoàn thiện mục lục Word và xuất Mermaid thành ảnh**.
10. Export PDF qua **browser Print → Save as PDF** trên khổ A4; chưa có nút tải file PDF trực tiếp, xuất Mermaid ở dạng source.

## Triển khai Netlify

1. **Backup database và Netlify Blobs** trước khi thao tác.
2. Đảm bảo các migration trước đó đến `027_rexus_audit` đã chạy.
3. **Áp dụng migration `netlify/database/migrations/028_rexus_document_drive/migration.sql` trước deploy**. Migration thêm `folder_id` nullable vào `rexus_doc_files`, bỏ NOT NULL tại `document_id` để file có thể nằm trực tiếp trong Folder, bổ sung bảng `rexus_folder_comments`. Không DROP bảng/cột cũ. Constraint được thêm NOT VALID để tránh đột ngột chặn dữ liệu legacy bất thường.
4. Deploy `REXUS-v2.0.6-LITE-Netlify.zip` theo cách triển khai đang dùng hoặc build source từ FULL. Cần `@netlify/blobs`, `@netlify/database`, `@netlify/functions` giống trước. Cấu hình `netlify.toml` không đổi.
5. Hard refresh trình duyệt (Ctrl+Shift+R). Kiểm tra Document Home → Space → Folder → upload file → truy cập file → mở page → autosave, view history → export DOCX → print PDF → folder comment → link vào task.
6. Sau khi xác nhận không có dữ liệu legacy bất thường, chạy tùy chọn: `ALTER TABLE rexus_doc_files VALIDATE CONSTRAINT rexus_doc_file_parent_check;`.

**Rollback:** Có thể quay lại gói v2.0.5 mà không xóa dữ liệu. Tuy nhiên file tạo trực tiếp trong Folder bằng v2.0.6 sẽ không hiển thị ở UI v2.0.5. Không rollback database schema một cách máy móc vì có thể làm hỏng dữ liệu folder-file mới; phục hồi từ bản backup đã kiểm tra nếu cần.

## Bảng nghiệm thu (1–20)

| STT | Trạng thái | Diễn giải |
|---|---|---|
| 1 | Đạt qua DOM mô phỏng | Folder mặc định List View |
| 2 | Đã lập trình, chưa kiểm DB thật | Subfolder, file trực tiếp, document page |
| 3 | Đạt qua DOM | Trang độc lập và URL `#document/{id}` |
| 4 | Đạt qua DOM | Pageless |
| 5 | Đạt qua DOM | Metadata ở sidebar |
| 6 | Đạt CSS | Default 16px (văn bản chưa có font riêng) |
| 7 | Một phần | Toolbar mở rộng; vài chức năng cần test thêm trong trình duyệt production |
| 8 | Đạt DOM | Table picker + thao tác bảng cơ bản |
| 9 | Đạt DOM whitelist | Insert HTML sanitize, cần đánh giá bảo mật production bổ sung |
| 10 | **Một phần** | Mermaid flowchart preview đơn giản, chưa đủ engine sơ đồ |
| 11 | Đạt DOM | TOC Heading1–6 + điều hướng + refresh |
| 12 | Đạt DOM | Breadcrumb theo ancestor; URL deep link |
| 13 | Đạt thử DOCX mẫu | DOCX valid, render qua LibreOffice; Mermaid/TOC nâng cao chưa đầy đủ |
| 14 | **Một phần** | Print/Save PDF qua browser, chưa direct-download PDF |
| 15 | Đã lập trình, chưa kiểm DB thật | Folder comments/replies/edit/delete-own |
| 16 | Đạt qua mock, chưa kiểm DB thật | Optimistic autosave, version history, local draft |
| 17 | Chưa kiểm prod | Migration additive, giữ dữ liệu cũ theo thiết kế |
| 18 | Đối chiếu source | Không chỉnh API/logic Project/Task/Worklog/Payroll |
| 19 | Đạt syntax+mock | Chưa kiểm toàn bộ Netlify APIs với DB/Blobs thật |
| 20 | Đạt mock, chưa kiểm prod | Refresh, reopen, auth có test mô phỏng |

**Kết luận:** Đây là bản **2.0.6 release candidate** có thể triển khai staging, **chưa đủ cơ sở để tuyên bố đã nghiệm thu hoàn toàn**. Những điểm ưu tiên cần hoàn thiện trước production: Mermaid đầy đủ, direct PDF, export Mermaid/TOC, kiểm thử API/DB/Blobs/permissions với tài khoản thật, và hồi quy trên dữ liệu thực tế.
