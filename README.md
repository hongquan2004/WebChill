# Lặng — Web chill

Ứng dụng React + Vite + Three.js với cảnh thung lũng 3D, rừng thông, dòng suối phản chiếu, mây và sương. Giao diện chỉ gồm bảng đếm ngược và các điều khiển cần thiết, không có phần chữ giới thiệu.

## Chạy dự án

Yêu cầu Node.js 22.12+.

```sh
npm install
npm run dev
```

Mở http://localhost:5173.

```sh
npm run build
npm run preview
```

Triển khai thư mục `dist` trên hosting tĩnh, không cần backend hoặc tài khoản.

## Trải nghiệm

- Cảnh 3D có núi nhiều lớp, rừng thông, mặt nước phản chiếu, bờ đá, hoa/cỏ ven suối và chim bay.
- Dòng suối có nhịp gợn nhanh khoảng 3,3 lần bản trước, vệt nước chuyển dọc dòng uốn lượn và bọt trôi theo lòng suối.
- Cây có tán nhiều tầng không đều, cành dưới và sắc độ thay đổi; cỏ là bụi nhiều lá cong, chuyển động theo gió. Khi tuyết rơi, đầu tán/cỏ có lớp trắng nhẹ.
- Ba chế độ ánh sáng: ban ngày, hoàng hôn, ban đêm; chuyển màu và ánh sáng từ từ. Ban đêm có sao và đom đóm.
- Bật/tắt mưa nhẹ hoặc tuyết rơi; chỉ một loại thời tiết hoạt động tại một thời điểm, chuyển cảnh có độ trễ nhẹ để hòa trộn. Trời, sương, mặt nước và âm thanh thay đổi theo thời tiết.
- Nút **A** ở nhóm ánh sáng tự đổi **ngày → hoàng hôn → đêm** mỗi **2 phút**. Nút **A** ở nhóm thời tiết tự đổi **trời quang → mưa → tuyết** mỗi **3 phút**. Hai chu kỳ độc lập và có thể bật/tắt riêng.
- Chọn buổi hoặc thời tiết thủ công sẽ tắt chế độ tự động tương ứng. Tự động tính theo thời gian thực, kể cả khi chuyển tab.
- Bảng đếm ngược với vòng tiến trình, mốc 5/15/25/45 phút và tùy chỉnh 1–180 phút; bắt đầu, tạm dừng, tiếp tục và đặt lại.
- Âm thanh suối, gió và mưa được mô phỏng bằng Web Audio stereo, có bật/tắt và âm lượng 0–100%. Âm thanh chỉ khởi tạo sau thao tác bật; không phải bản thu thiên nhiên.
- Chuông nhẹ khi hết giờ nếu âm thanh đang bật và âm lượng lớn hơn 0.
- Nút mũi tên trên bảng đếm ngược thu gọn thành thanh thời gian và nút bắt đầu/tạm dừng; bấm lại để mở rộng. Bộ đếm tiếp tục chạy khi thu gọn.
- Ẩn giao diện để ngắm cảnh; bộ đếm và âm thanh vẫn tiếp tục. Nút hình con mắt ở góc trên giúp hiện lại giao diện.
- Toàn màn hình trên trình duyệt hỗ trợ.
- Tự lưu ánh sáng, thời tiết, hai chế độ tự động, âm lượng và thời lượng đã chọn vào localStorage. Âm thanh luôn tắt khi tải lại trang; tiến trình đếm ngược không lưu sau tải lại.

## Phím tắt

| Phím | Thao tác |
| --- | --- |
| Space | Bắt đầu / tạm dừng khi không đang thao tác trên nút hoặc ô nhập |
| M | Bật/tắt âm thanh |
| H | Ẩn/hiện giao diện |
| F | Toàn màn hình |
| Escape | Hiện lại giao diện hoặc đóng hộp đặt giờ; trình duyệt xử lý thoát toàn màn hình |

Phím tắt không chạy khi nhập liệu hoặc đang mở hộp đặt giờ.

## Cấu trúc

- `src/main.jsx`: giao diện, bộ đếm, điều khiển và lưu tùy chọn.
- `src/style.css`: giao diện kính mờ, vòng đếm ngược và responsive.
- `src/NatureScene.jsx`: tải cảnh 3D riêng, nối các điều khiển, cảnh dự phòng.
- `src/scene/createScene.js`: camera, ánh sáng, vật thể, nước, thời tiết và vòng dựng hình.
- `src/scene/terrain.js`: địa hình và dòng suối từ seed cố định.
- `src/hooks/useAmbientAudio.js`: tổng hợp âm thanh, trộn các lớp âm và chuông hoàn thành.
- `src/hooks/useSceneCycle.js`: chu kỳ tự động và xử lý tab chạy nền.
- `src/scene/createSnow.js`: hạt tuyết 3D.
- `src/scene/createVegetation.js`: tán thông, cành, bụi cỏ và chuyển động gió trên GPU.
- `src/Landscape.jsx`: cảnh SVG dự phòng.

## Hiệu năng và khả năng hỗ trợ

Rừng cây dùng InstancedMesh. Điện thoại giảm mật độ cây và độ phân giải phản chiếu, tắt bóng đổ. Tốc độ dựng hình được giới hạn mục tiêu khoảng 30 fps trên điện thoại, 40 fps trên desktop; thực tế phụ thuộc GPU. Tab ẩn dừng dựng hình. Khi bật giảm chuyển động, cảnh tĩnh và các điều khiển vẫn hoạt động.

3D cần WebGL 2. Nếu không hỗ trợ, trang hiển thị cảnh SVG; bộ đếm và âm thanh vẫn hoạt động. Cảnh dự phòng đổi tông theo ánh sáng/thời tiết và có lớp tuyết CSS, nhưng không mô phỏng đầy đủ các hiệu ứng 3D.

Texture và hình học được tạo tại máy, không tải mô hình hoặc ảnh bên ngoài. Phông chữ dùng Google Fonts, có phông hệ thống dự phòng khi offline. Thư viện 3D: https://threejs.org/docs/.

## Kiểm tra

`npm test` kiểm tra chu kỳ tự chuyển: đúng mốc thời gian, bắt kịp sau khi tab chạy nền, thứ tự lặp và hai chu kỳ độc lập. `npm run build` kiểm tra bản production.
