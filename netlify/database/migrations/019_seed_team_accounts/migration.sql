-- Seed team accounts for the shared team project (UEH Nexus Campus Nha
-- Trang collaborators). Each account gets its own default hourly rate;
-- department and position were assigned to a plausible spread since the
-- source list didn't specify them. Passwords are each person's student ID
-- (as given) -- they should change it after first login.
-- Ngo Trong Tien's System Admin account already exists (ADMIN_TIENNT) and
-- is intentionally not touched here.

INSERT INTO departments (name) VALUES
  ('Công nghệ thông tin'),
  ('Học vụ'),
  ('Nghiên cứu & Dữ liệu'),
  ('Truyền thông & Sự kiện'),
  ('Vận hành')
ON CONFLICT (name) DO NOTHING;

INSERT INTO users (id, email, username, full_name, password_hash, status, role, position, department, created_at, updated_at)
VALUES
  ('U_TRUONGPN', 'truongpham.22260038@st.ueh.edu.vn', 'truongpn', 'Phạm Nhật Trường', '5fb5647cf17ac1bdfcadab1c8f5536c4:68cf6655fbea45f8cc1578e3f0e4d5a49b21f8da9d67efe9e0c92af7a9f3b259d28d50f6c6b251808b639ff8f0646f2c3a2761b205df0422ebe44797bbc85247', 'Active', 'Member', 'Trợ giảng', 'Học vụ', NOW(), NOW()),
  ('U_MINCT', 'minguyen.22260017@st.ueh.edu.vn', 'minct', 'Nguyễn Cao Trà Mi', '81f8be830851fcb9c4117cd7ab6f05ff:5d8b70cd7e282a14b1cc0484b160f939a4483d8d041b0973a14f4c668750e01482f0e2d93664eb49b7c422a1bd291cbbfab49c32d6d6e5b10449d3635a19eae2', 'Active', 'Project Manager', 'Điều phối viên dự án', 'Truyền thông & Sự kiện', NOW(), NOW()),
  ('U_VYNHA', 'vynguyen.22260040@st.ueh.edu.vn', 'vynha', 'Nguyễn Hoàng Anh Vy', '094b89ae67c9a574fff44793b30562a3:ff28d38332efbe99bfee4c80d466a1d44c10a40e247fcb1d9eac0b175f5e395604e5b538f90a36a1ea8d9e652b5744b08a0cfad9453d5bff273ab7559e5d3328', 'Active', 'Member', 'Cộng tác viên', 'Công nghệ thông tin', NOW(), NOW()),
  ('U_TOANTA', 'toantran.22260033@st.ueh.edu.vn', 'toanta', 'Trần Anh Toàn', 'dd573cd056df35894b8dc16fca38ba14:a33b2b0a85879c284d30cc2fd8cf5605d4bd20e690ff5e12d4339c56db3f11788c0145bf9dd357fc47c4be07c4c71ab71664d0d06d3b8ca4346c0628730689ad', 'Active', 'Member', 'Trợ giảng', 'Vận hành', NOW(), NOW()),
  ('U_TRANLN', 'tranle.22260034@st.ueh.edu.vn', 'tranln', 'Lê Nhã Trân', '72d4ca4c15a6581a5098a734e2f3686f:3c1dbfd88e4f8e46e79a83ec009226d213ea1174b5b6472669c39281b3a5fde6fda66a5358012391412aef74ce971b867e5d72283a4730a812e4d449eacc6483', 'Active', 'Project Manager', 'Trưởng nhóm dự án', 'Nghiên cứu & Dữ liệu', NOW(), NOW()),
  ('U_DUNGTTT', 'dungta.22260048@st.ueh.edu.vn', 'dungttt', 'Tạ Thị Thanh Dung', '9c65fb525a9af3dae587c86f07abe8f7:695764dee5ebd9967905c89c497321ab9160cfa9024e9053369d352c77ee7ffed6cfde8755d905cfed0157669efb975e536e4a99f7bf2fc407734abacd540042', 'Active', 'Member', 'Cộng tác viên', 'Học vụ', NOW(), NOW()),
  ('U_TRANPB', 'tranphan.22260035@st.ueh.edu.vn', 'tranpb', 'Phan Bảo Trân', 'a31c9d8ecc71b557c27d9933f9115fe0:61477fb02ee231fc35f5741ad8d4d86f5c8c15d62f60600533b52ad8f67f8977e2c20603e92e24089c8020342f1e383850b17e4ce07d33a20f88259cfeae2243', 'Active', 'Member', 'Trợ giảng', 'Truyền thông & Sự kiện', NOW(), NOW()),
  ('U_TRANGTTH', 'trangtruong.22260036@st.ueh.edu.vn', 'trangtth', 'Trương Thị Hà Trang', '071bd8fef1c6c3574278e6286638629b:8d070fe1570037299498abde9c4077c41e0f5a06170c834e26677edf77f124edaf6e0f8a00af9cb0b855c65ff170d69ec3fc34898aa6b178cf5d04762da88cfa', 'Active', 'Member', 'Nhân viên', 'Công nghệ thông tin', NOW(), NOW()),
  ('U_YENDTK', 'yenduong.22260043@st.ueh.edu.vn', 'yendtk', 'Dương Thị Kim Yến', 'cc580dbda9dc183dbf4b01d2a201fbbe:a18eb03596a91150d6f979d857c7510808dcfb50f662cc802834022b181fe7c072a28530ab2f6c62348908e96b958150bd6d99bbcae587e6b9ed815a11c8b9e1', 'Active', 'Project Manager', 'Trưởng nhóm dự án', 'Vận hành', NOW(), NOW()),
  ('U_YENNNM', 'yennguyen.22260044@st.ueh.edu.vn', 'yennnm', 'Nguyễn Ngọc Minh Yến', '17985aa26d11c0345fc62da448804a31:4029d5ce6aca95253e02f50511fbeae746ebf2d78d2bf7322994295b3f897645ff4f081e7c53a1a05a75273363714bb4adcb5a13dd48b85ea8ab0646febd0d80', 'Active', 'Member', 'Trợ giảng', 'Nghiên cứu & Dữ liệu', NOW(), NOW()),
  ('U_YENPN', 'yenpham.22260045@st.ueh.edu.vn', 'yenpn', 'Phạm Ngọc Yến', 'ae8a184bdee0707f91444e2f6e2ffb6b:0052a4ea9a434394e7c7d4ab6643ef45f9f2a08de229525e59fa897228cc7ac7b702c807ce35cd20c20788575aaec5e4be80c66b00b02af02f06f125f9e1131e', 'Active', 'Member', 'Nhân viên', 'Học vụ', NOW(), NOW()),
  ('U_CHAUHNT', 'chauhuynh.22260047@st.ueh.edu.vn', 'chauhnt', 'Huỳnh Nhật Trân Châu', '2c8e26ecde4fefeac66daba50ed5055f:8d7c688834ed0772d0342846b11e973ad5dcd067c39bc62a0b6af20546ad51b6b19eeaa205de95006c75cccc3db6b6439607e823582f9b6b1b264c3970f32cc8', 'Active', 'Member', 'Cộng tác viên', 'Truyền thông & Sự kiện', NOW(), NOW()),
  ('U_HANGP', 'hanguyen.22260049@st.ueh.edu.vn', 'hangp', 'Nguyễn Phương Hà', '66fe23825270591101ea88afb1b4822d:c73534ad5bc3c369419cb419a842696c77bd4aed8668ceb0e3d7478f128c54cfa12e9dd083970c684f2c47d4add24585886996c6f9009f0474e1e69d2906678f', 'Active', 'Project Manager', 'Trưởng nhóm dự án', 'Công nghệ thông tin', NOW(), NOW()),
  ('U_KHIEMNHL', 'khiemnguyen.22260051@st.ueh.edu.vn', 'khiemnhl', 'Nguyễn Hữu Lưu Khiêm', 'f251fce73701bc6ce774bc4fda08f54d:185e86976c50cc7601bcb585a5bd60b571087c63cf46ce21e77df755e91562c807dd12931022762022e987742048869695467a70083319fdab21ae537f0a490c', 'Active', 'System Admin', 'Trưởng phòng', 'Vận hành', NOW(), NOW()),
  ('U_LOCPTX', 'locpham.22260053@st.ueh.edu.vn', 'locptx', 'Phạm Thị Xuân Lộc', '70b0b63504a8089964e8ea21dddddb00:1d1862df5b726654d66efd1291ccd027388471cea620e4750985690e3e771f761fccfe2cfde0f38a46b236abfa2c0342f9ef1638b6640fdfc6e82a34beff52e8', 'Active', 'System Admin', 'Quản trị hệ thống', 'Nghiên cứu & Dữ liệu', NOW(), NOW()),
  ('U_NHANNTT', 'nhannguyen.22260055@st.ueh.edu.vn', 'nhanntt', 'Nguyễn Thị Thanh Nhàn', '43e8ec63cccc1b405dc0d6f9dfd55064:1f1f5d88291f713d8db29607f0c2949a9d6f7ef558c487858997affa8d6ca09827ad1a4e580520b4233c3371eaa809db4e188057bbce5a75ff3ddd2ee69e9b89', 'Active', 'System Admin', 'Trưởng phòng', 'Học vụ', NOW(), NOW()),
  ('U_QUYNHVN', 'quynhvo.22260058@st.ueh.edu.vn', 'quynhvn', 'Võ Như Quỳnh', 'f256c6875b19b7bfb18214ee3ba96f7e:30ef1b1b2c646401fb0b582db5f710cfb298bc7b2fc13e617be867bb361b4b867fe76f421176fb2d21f3443986c4ae30a5dfde021bcaf30e1b7f621796a802fd', 'Active', 'System Admin', 'Quản trị hệ thống', 'Truyền thông & Sự kiện', NOW(), NOW()),
  ('U_THUYDT', 'thuydo.22260031@st.ueh.edu.vn', 'thuydt', 'Đỗ Thị Thuỷ', '501fb18f9434a9eeecdd11126a88c521:412b2d61dc034880fcf5298a7084f384ba03a2d60b2836d0d9ab96798fe902e188b8d230d298ae577e7926b4d4ff1712ef3647aa379a4d72fd7263c5aa8b2bd6', 'Active', 'Member', 'Cộng tác viên', 'Công nghệ thông tin', NOW(), NOW()),
  ('U_HYVQ', 'hyvu.22260050@st.ueh.edu.vn', 'hyvq', 'Vũ Quang Hy', '95d133c264e400f3f6fa0d933b296a4f:15b35b0262d7852edde46225bcf004e64504bbea3de16a7eed1a31dd89efe98d801714aadd7d4b3be243063daf981956a71df4cf3a19da5131a549f8d620481e', 'Active', 'Project Manager', 'Trưởng nhóm dự án', 'Vận hành', NOW(), NOW()),
  ('U_THUYPTT', 'thuypham.22260032@st.ueh.edu.vn', 'thuyptt', 'Phạm Thị Thanh Thúy', 'd5c2a6e2c108aba2236db3a841808209:035c0b8d763260a7a36b240563ec3caeb92f04868f9efe4f88224bcd6e7977048441db914b0566980daaa836d98318115024129e7c0ee313cebe4c398da8b814', 'Active', 'Member', 'Nhân viên', 'Nghiên cứu & Dữ liệu', NOW(), NOW()),
  ('U_THOANB', 'thoanguyen.22260030@st.ueh.edu.vn', 'thoanb', 'Nguyễn Bảo Thoa', '7138b708984ce3266f01e0c11ce0efd3:4eb67e95ce602bd193cb26063260d25631cfbd48409313858127586ac9f56c4cbba29a02920366c7ba2ca3a86399634f858dfb95435f78c82af2566f6aad5c61', 'Active', 'Member', 'Cộng tác viên', 'Học vụ', NOW(), NOW()),
  ('U_VIETVPD', 'vietvu.22260039@st.ueh.edu.vn', 'vietvpd', 'Vũ Phạm Đức Việt', 'c63826e543f3590b0b902d6a8c2156ae:cd20b1c8188dac61d803d79b19194aaca07317a5c8c117874f9a00cb8be97d254917eeecfca39de7dae3cb72caae843f69b625cbb0a92691befce9ac5e9d83c2', 'Active', 'Member', 'Trợ giảng', 'Truyền thông & Sự kiện', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Default hourly rate for each new account, effective today.
INSERT INTO employee_rates (id, employee_id, hourly_rate, effective_from, created_by)
VALUES
  ('ER_TRUONGPN', 'U_TRUONGPN', 55000, CURRENT_DATE, 'ADMIN_TIENNT'),
  ('ER_MINCT', 'U_MINCT', 90000, CURRENT_DATE, 'ADMIN_TIENNT'),
  ('ER_VYNHA', 'U_VYNHA', 50000, CURRENT_DATE, 'ADMIN_TIENNT'),
  ('ER_TOANTA', 'U_TOANTA', 60000, CURRENT_DATE, 'ADMIN_TIENNT'),
  ('ER_TRANLN', 'U_TRANLN', 75000, CURRENT_DATE, 'ADMIN_TIENNT'),
  ('ER_DUNGTTT', 'U_DUNGTTT', 55000, CURRENT_DATE, 'ADMIN_TIENNT'),
  ('ER_TRANPB', 'U_TRANPB', 40000, CURRENT_DATE, 'ADMIN_TIENNT'),
  ('ER_TRANGTTH', 'U_TRANGTTH', 50000, CURRENT_DATE, 'ADMIN_TIENNT'),
  ('ER_YENDTK', 'U_YENDTK', 95000, CURRENT_DATE, 'ADMIN_TIENNT'),
  ('ER_YENNNM', 'U_YENNNM', 45000, CURRENT_DATE, 'ADMIN_TIENNT'),
  ('ER_YENPN', 'U_YENPN', 55000, CURRENT_DATE, 'ADMIN_TIENNT'),
  ('ER_CHAUHNT', 'U_CHAUHNT', 40000, CURRENT_DATE, 'ADMIN_TIENNT'),
  ('ER_HANGP', 'U_HANGP', 85000, CURRENT_DATE, 'ADMIN_TIENNT'),
  ('ER_KHIEMNHL', 'U_KHIEMNHL', 110000, CURRENT_DATE, 'ADMIN_TIENNT'),
  ('ER_LOCPTX', 'U_LOCPTX', 100000, CURRENT_DATE, 'ADMIN_TIENNT'),
  ('ER_NHANNTT', 'U_NHANNTT', 90000, CURRENT_DATE, 'ADMIN_TIENNT'),
  ('ER_QUYNHVN', 'U_QUYNHVN', 125000, CURRENT_DATE, 'ADMIN_TIENNT'),
  ('ER_THUYDT', 'U_THUYDT', 50000, CURRENT_DATE, 'ADMIN_TIENNT'),
  ('ER_HYVQ', 'U_HYVQ', 85000, CURRENT_DATE, 'ADMIN_TIENNT'),
  ('ER_THUYPTT', 'U_THUYPTT', 45000, CURRENT_DATE, 'ADMIN_TIENNT'),
  ('ER_THOANB', 'U_THOANB', 55000, CURRENT_DATE, 'ADMIN_TIENNT'),
  ('ER_VIETVPD', 'U_VIETVPD', 40000, CURRENT_DATE, 'ADMIN_TIENNT')
ON CONFLICT (id) DO NOTHING;

