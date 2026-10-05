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
- Cây có tán nhiều tầng không đều, cành và chùm lá kim ở gần; cỏ nhiều lá cong, kèm dương xỉ ven suối, chuyển động theo gió. Khi tuyết rơi, đầu tán/cỏ có lớp trắng nhẹ.
- Địa hình có vân đất và lớp đá lộ trên sườn núi; đá ven suối có bề mặt sần, rêu và cụm sỏi. Mưa làm bề mặt sẫm/ướt, tuyết làm sáng các mặt hướng lên.
- Nước có vùng nông sát bờ, gợn và bọt vỡ dọc mép suối. Trăng có vệt tối/miệng hố, sao có kích thước khác nhau và ánh nhấp nháy chậm.
- Desktop có tia nắng mềm xuyên các khoảng rừng, sương thấp nhiều lớp và bóng cây mềm; ánh sáng ấm hơn lúc hoàng hôn, tia nắng giảm khi trời tối hoặc có mưa/tuyết.
- Bảy tảng đá giữa dòng tạo điểm nhấn với bọt phía trước, vệt nước và xoáy phía sau. Khi mưa, các vòng gợn nở trên mặt suối. Đây là hiệu ứng shader theo dòng chảy, không phải mô phỏng chất lỏng vật lý.
- Bướm vỗ cánh ven bờ vào ban ngày, lá rơi chậm gần tán cây. Thân, cành và tán thông cùng đung đưa theo từng đợt gió, lệch nhịp giữa các cụm rừng.
- Nút **Tùy chỉnh khung cảnh** ở góc trên bên phải mở bảng chọn góc **Toàn cảnh / Ven suối**, bật/tắt **Camera trôi nhẹ** và chất lượng **Tự động / Cao / Cân bằng / Nhẹ**. Camera chuyển góc từ từ và giữ khoảng cách với địa hình; chế độ giảm chuyển động dùng góc tĩnh.
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
- Tự lưu ánh sáng, thời tiết, hai chế độ tự động, âm lượng, thời lượng, góc nhìn, chuyển động camera và chất lượng đã chọn vào localStorage. Âm thanh luôn tắt khi tải lại trang; tiến trình đếm ngược không lưu sau tải lại.

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
- `src/SceneSettings.jsx`, `src/scene-settings.css`: bảng cài đặt khung cảnh.
- `src/preferences.js`: kiểm tra và khôi phục tùy chọn đã lưu.
- `src/scene/createScene.js`: camera, ánh sáng, vật thể, nước, thời tiết và vòng dựng hình.
- `src/scene/terrain.js`: địa hình và dòng suối từ seed cố định.
- `src/hooks/useAmbientAudio.js`: tổng hợp âm thanh, trộn các lớp âm và chuông hoàn thành.
- `src/hooks/useSceneCycle.js`: chu kỳ tự động và xử lý tab chạy nền.
- `src/scene/createSnow.js`: hạt tuyết 3D.
- `src/scene/createVegetation.js`: tán thông, cành, bụi cỏ và chuyển động gió trên GPU.
- `src/scene/createLandscapeDetails.js`: chi tiết địa hình, vân đá, rêu và sỏi ven suối.
- `src/scene/createSkyDetails.js`: chi tiết trăng và sao, dùng lại lượt dựng hình sẵn có.
- `src/scene/createAtmosphere.js`: tia nắng và các lớp sương thấp cho desktop.
- `src/scene/createRiverEffects.js`: bọt, xoáy quanh đá và vòng gợn do mưa.
- `src/scene/createWildlife.js`: bướm và lá rơi, chuyển động trên GPU.
- `src/scene/adaptiveQuality.js`: theo dõi nhịp dựng hình và tự chọn mức chi tiết.
- `src/scene/createCameraDirector.js`: hai góc nhìn, chuyển góc và camera trôi nhẹ.
- `src/Landscape.jsx`: cảnh SVG dự phòng.

## Hiệu năng và khả năng hỗ trợ

Ưu tiên desktop, với mục tiêu tối đa 60 fps; đây là giới hạn dựng hình, không phải cam kết FPS thực tế. Rừng cây, bướm và lá dùng instancing, phần lớn chuyển động chạy trên GPU. Desktop bắt đầu ở mức cao, phản chiếu 1024 × 1024 và bóng 2048 × 2048.

Chất lượng tự động có ba mức cao/cân bằng/nhẹ. Khi tốc độ giảm kéo dài, cảnh giảm độ phân giải dựng hình, độ phân giải/tần suất phản chiếu, bóng và mật độ hiệu ứng phụ. Cảnh chỉ tăng chi tiết trở lại sau thời gian chạy ổn định dài hơn; có thời gian chờ giữa các lần đổi để tránh dao động. Việc chuyển tab, đổi kích thước và bật giảm chuyển động đặt lại mẫu đo.

Chọn chất lượng thủ công sẽ giữ mức đã chọn. Quay lại **Tự động** sẽ bắt đầu đo từ mức hiện tại. Cảnh SVG được giữ trong lúc tải và chỉ chuyển sang 3D sau khung hình dựng thành công đầu tiên; khi 3D lỗi, cảnh dự phòng hiện lại. Bộ đếm cập nhật không khiến toàn bộ lớp cảnh React dựng lại.

Điện thoại giữ cảnh nhẹ hơn, mục tiêu 30 fps và tắt bóng đổ; các lớp tia nắng, xoáy quanh đá, gợn mưa, bướm và lá rơi mới chỉ bật trên desktop. Tab ẩn dừng dựng hình. Khi bật giảm chuyển động, cảnh tĩnh, bướm/lá và vòng gợn mưa ẩn; các điều khiển vẫn hoạt động.

3D cần WebGL 2. Nếu không hỗ trợ, trang hiển thị cảnh SVG; bộ đếm và âm thanh vẫn hoạt động. Cảnh dự phòng đổi tông theo ánh sáng/thời tiết và có lớp tuyết CSS, nhưng không mô phỏng đầy đủ các hiệu ứng 3D.

Texture và hình học được tạo tại máy, không tải mô hình hoặc ảnh bên ngoài. Phông chữ dùng Google Fonts, có phông hệ thống dự phòng khi offline. Thư viện 3D: https://threejs.org/docs/.

## Kiểm tra

`npm test` kiểm tra chu kỳ tự chuyển, cơ chế hạ/tăng chất lượng, tùy chọn đã lưu, chuyển động camera và các hợp đồng dữ liệu của hiệu ứng (chuyển thời tiết, giới hạn hình học, giải phóng tài nguyên). `npm run build` kiểm tra bản production. Các kiểm tra này không thay thế việc xem cảnh WebGL và đo FPS trực tiếp trên thiết bị.
