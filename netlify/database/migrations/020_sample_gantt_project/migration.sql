-- Sample project with Gantt enabled, so a freshly-deployed instance has
-- something to look at right away: a realistic rollout plan with 7 tasks
-- chained by predecessors (including a parallel dev branch and a final
-- milestone), owned by the System Admin and staffed from the seeded team
-- accounts (migration 019). A couple of work-log entries are included so
-- the Work Log / Finance cost views aren't empty either.

INSERT INTO projects (
  user_id, owner_id, name, deadline, start_date, description, status, owner, members,
  gantt_enabled, gantt_auto_schedule, budget
) VALUES (
  'ADMIN_TIENNT', 'ADMIN_TIENNT',
  'Triển khai Hệ thống Quản lý Công việc',
  '2026-10-31', '2026-09-28',
  'Kế hoạch triển khai hệ thống Work Management cho UEH Nexus Campus Nha Trang: thu thập yêu cầu, thiết kế, phát triển, kiểm thử, đào tạo và go-live.',
  'Active', 'Ngô Trọng Tiến',
  '["Ngô Trọng Tiến","Nguyễn Cao Trà Mi","Lê Nhã Trân","Dương Thị Kim Yến","Phạm Nhật Trường","Nguyễn Hoàng Anh Vy","Trần Anh Toàn","Tạ Thị Thanh Dung","Đỗ Thị Thuỷ"]',
  true, true, 50000000
)
ON CONFLICT (user_id, name) DO NOTHING;

INSERT INTO project_members (owner_user_id, project, user_id, role) VALUES
  ('ADMIN_TIENNT', 'Triển khai Hệ thống Quản lý Công việc', 'U_MINCT', 'Manager'),
  ('ADMIN_TIENNT', 'Triển khai Hệ thống Quản lý Công việc', 'U_TRANLN', 'Manager'),
  ('ADMIN_TIENNT', 'Triển khai Hệ thống Quản lý Công việc', 'U_YENDTK', 'Manager'),
  ('ADMIN_TIENNT', 'Triển khai Hệ thống Quản lý Công việc', 'U_TRUONGPN', 'Member'),
  ('ADMIN_TIENNT', 'Triển khai Hệ thống Quản lý Công việc', 'U_VYNHA', 'Member'),
  ('ADMIN_TIENNT', 'Triển khai Hệ thống Quản lý Công việc', 'U_TOANTA', 'Member'),
  ('ADMIN_TIENNT', 'Triển khai Hệ thống Quản lý Công việc', 'U_DUNGTTT', 'Member'),
  ('ADMIN_TIENNT', 'Triển khai Hệ thống Quản lý Công việc', 'U_THUYDT', 'Member')
ON CONFLICT (owner_user_id, project, user_id) DO NOTHING;

INSERT INTO tasks (
  id, user_id, task, description, project, priority, status, progress,
  start_date, due_date, estimated_hours, actual_hours, notes,
  task_type, reporter, assignee_id, assignee_name, created_by, created_at, updated_at,
  predecessors, is_milestone
) VALUES
  ('T_REQ01', 'ADMIN_TIENNT', 'Thu thập yêu cầu', 'Làm việc với các phòng ban để chốt phạm vi tính năng.',
    'Triển khai Hệ thống Quản lý Công việc', 'High', 'In Progress', 60,
    '2026-09-28', '2026-10-02', 20, 7, '',
    'Task', '[{"type":"user","id":"ADMIN_TIENNT","name":"tiennt"}]', 'U_TRUONGPN', 'Phạm Nhật Trường',
    'tiennt', NOW(), NOW(), '[]', false),

  ('T_DES01', 'ADMIN_TIENNT', 'Thiết kế hệ thống', 'Thiết kế cơ sở dữ liệu, luồng nghiệp vụ và giao diện.',
    'Triển khai Hệ thống Quản lý Công việc', 'High', 'Not Started', 0,
    '2026-10-03', '2026-10-09', 30, 0, '',
    'Task', '[{"type":"user","id":"ADMIN_TIENNT","name":"tiennt"}]', 'U_VYNHA', 'Nguyễn Hoàng Anh Vy',
    'tiennt', NOW(), NOW(), '[{"id":"T_REQ01","type":"FS","lag_days":0}]', false),

  ('T_DEV01', 'ADMIN_TIENNT', 'Phát triển module Task & Project', 'Xây dựng các chức năng quản lý công việc và dự án.',
    'Triển khai Hệ thống Quản lý Công việc', 'High', 'Not Started', 0,
    '2026-10-10', '2026-10-19', 60, 0, '',
    'Task', '[{"type":"user","id":"ADMIN_TIENNT","name":"tiennt"}]', 'U_TOANTA', 'Trần Anh Toàn',
    'tiennt', NOW(), NOW(), '[{"id":"T_DES01","type":"FS","lag_days":0}]', false),

  ('T_DEV02', 'ADMIN_TIENNT', 'Phát triển module Work Log & Finance', 'Xây dựng chấm công, chi phí dự án và quản lý lương.',
    'Triển khai Hệ thống Quản lý Công việc', 'High', 'Not Started', 0,
    '2026-10-10', '2026-10-21', 50, 0, '',
    'Task', '[{"type":"user","id":"ADMIN_TIENNT","name":"tiennt"}]', 'U_DUNGTTT', 'Tạ Thị Thanh Dung',
    'tiennt', NOW(), NOW(), '[{"id":"T_DES01","type":"FS","lag_days":0}]', false),

  ('T_QA01', 'ADMIN_TIENNT', 'Kiểm thử tích hợp (QA)', 'Kiểm thử toàn bộ hệ thống trước khi bàn giao.',
    'Triển khai Hệ thống Quản lý Công việc', 'Medium', 'Not Started', 0,
    '2026-10-22', '2026-10-27', 30, 0, '',
    'Task', '[{"type":"user","id":"ADMIN_TIENNT","name":"tiennt"}]', 'U_THUYDT', 'Đỗ Thị Thuỷ',
    'tiennt', NOW(), NOW(), '[{"id":"T_DEV01","type":"FS","lag_days":0},{"id":"T_DEV02","type":"FS","lag_days":0}]', false),

  ('T_TRAIN01', 'ADMIN_TIENNT', 'Đào tạo người dùng', 'Hướng dẫn sử dụng hệ thống cho toàn bộ nhân viên.',
    'Triển khai Hệ thống Quản lý Công việc', 'Medium', 'Not Started', 0,
    '2026-10-28', '2026-10-30', 15, 0, '',
    'Task', '[{"type":"user","id":"ADMIN_TIENNT","name":"tiennt"}]', 'U_MINCT', 'Nguyễn Cao Trà Mi',
    'tiennt', NOW(), NOW(), '[{"id":"T_QA01","type":"FS","lag_days":0}]', false),

  ('T_LAUNCH01', 'ADMIN_TIENNT', 'Go-live: Triển khai chính thức', 'Chính thức đưa hệ thống vào sử dụng toàn trường.',
    'Triển khai Hệ thống Quản lý Công việc', 'High', 'Not Started', 0,
    '2026-10-31', '2026-10-31', 4, 0, '',
    'Task', '[{"type":"user","id":"ADMIN_TIENNT","name":"tiennt"}]', 'U_TRANLN', 'Lê Nhã Trân',
    'tiennt', NOW(), NOW(), '[{"id":"T_TRAIN01","type":"FS","lag_days":0}]', true)
ON CONFLICT (id) DO NOTHING;

-- A couple of work-log entries on the task already in progress, so the
-- Work Log tab and Finance/project-cost views have real data to show.
INSERT INTO worklogs (id, user_id, logged_by, task_id, date, start_time, end_time, description, hours, created_at)
VALUES
  ('L_REQ0928', 'ADMIN_TIENNT', 'U_TRUONGPN', 'T_REQ01', '2026-09-28', '08:00', '12:00', 'Khảo sát yêu cầu với các phòng ban', 4, NOW()),
  ('L_REQ0929', 'ADMIN_TIENNT', 'U_TRUONGPN', 'T_REQ01', '2026-09-29', '08:00', '11:00', 'Tổng hợp tài liệu yêu cầu', 3, NOW())
ON CONFLICT (id) DO NOTHING;
