# ScreenTrans Promotion

Website giới thiệu sản phẩm ScreenTrans.

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: Supabase PostgreSQL
- Authentication: Supabase Auth

## Features

- Register / Login
- Login with Google
- User Profile
- Subscription Plans
- Subscription Status
- Admin dashboard (`/admin`)

## Thanh toán & kích hoạt gói tự động

### Vì sao không dùng IPN của MoMo

MoMo **chỉ gửi IPN (callback tự động) cho tài khoản MoMo Business**, vì chữ ký
IPN được ký HMAC-SHA256 bằng `secretKey` mà MoMo cấp cho merchant. Ví MoMo cá
nhân và QR cá nhân không có cơ chế này — MoMo không gọi về hệ thống.

Nên với ví cá nhân, cách tự động hoá là đọc **biến động số dư tài khoản ngân
hàng** qua dịch vụ trung gian (SePay / Casso) rồi nhận webhook. Lưu ý: SePay và
Casso chỉ kết nối **tài khoản ngân hàng**, không đọc được ví MoMo. Muốn tự động
hoàn toàn thì nhận tiền qua số tài khoản ngân hàng (VietQR), hoặc nâng lên MoMo
Business.

### Luồng hiện tại

1. Người dùng vào `/checkout/:planCode` → backend tạo đơn `pending` trong bảng
   `payments` kèm **mã đơn** (ví dụ `STA7K2M9QX`).
2. Người dùng chuyển khoản và ghi mã đơn vào nội dung chuyển khoản.
3. SePay phát hiện tiền vào → gọi `POST /api/payments/webhook/sepay`.
4. Backend tìm mã đơn trong nội dung, kiểm tra số tiền, rồi gọi hàm SQL
   `activate_paid_order` để đánh dấu đã trả **và** tạo subscription trong cùng
   một transaction.
5. Trang checkout hỏi trạng thái mỗi 5 giây nên tự chuyển sang "đã thanh toán".

### Cấu hình

1. Chạy `backend/sql/001_payments.sql` trong Supabase SQL Editor (tạo bảng
   `payments`, RLS và hàm `activate_paid_order`).
2. Thêm vào `backend/.env`:

   ```
   SEPAY_WEBHOOK_API_KEY=<chuỗi ngẫu nhiên tự đặt>
   ```

   Cần `SUPABASE_SECRET_KEY` (xem phần dưới) vì webhook ghi dữ liệu thay người
   dùng, không có access token của họ.
3. Trong SePay: liên kết tài khoản ngân hàng, rồi thêm webhook trỏ tới
   `https://<backend>/api/payments/webhook/sepay`, kiểu xác thực **API Key**,
   giá trị đúng bằng `SEPAY_WEBHOOK_API_KEY`.

Webhook trả `{"success": true}` kèm HTTP 200 như SePay yêu cầu; sai thì SePay
retry tới 7 lần trong 5 giờ. Việc gọi lại nhiều lần là an toàn: `activate_paid_order`
dùng `SELECT ... FOR UPDATE` và trả `already_paid` nên gói không bị kích hoạt hai lần.

### Lưu ý

- Số tiền luôn lấy từ `subscription_plans` trong database, không lấy từ client.
- Trả thiếu tiền thì đơn **không** được kích hoạt, chỉ ghi log để xử lý tay.
- Gia hạn khi gói cũ còn hạn sẽ **nối tiếp** vào ngày hết hạn cũ, không cắt ngắn.
- Mã đơn chỉ dùng `A-Z` và `2-9` (bỏ `0/O/1/I/L`) để người dùng không gõ sai.

## Cấu hình trang quản trị

Trang `/admin` hiển thị số người đăng ký, số gói tháng và gói năm **đang còn
hạn**. Cần hai bước:

1. **Thêm secret key vào `backend/.env`.** Supabase Dashboard → Project
   Settings → API keys → copy `service_role` (hoặc `Secret key`):

   ```
   SUPABASE_SECRET_KEY=<secret key>
   ```

   Key này bỏ qua RLS nên chỉ được để ở backend, không bao giờ đưa vào frontend
   (biến `VITE_*` đều bị nhúng vào bundle). Thiếu key thì chỉ endpoint admin trả
   503, phần còn lại của API vẫn chạy.

   Cần key vì key publishable hiện tại bị RLS chặn: `subscriptions` trả
   *permission denied*, còn `profiles` chỉ thấy row của chính mình.

2. **Đặt `role = 'admin'`** cho tài khoản của bạn trong bảng `profiles` (SQL
   Editor hoặc Table Editor):

   ```sql
   update profiles set role = 'admin' where email = 'email-cua-ban@example.com';
   ```

   Lưu ý: row trong `profiles` chỉ được tạo khi người dùng đăng nhập lần đầu,
   nên hãy đăng nhập một lần trước khi chạy câu lệnh trên.

Số người đăng ký được đếm từ `auth.users` (không phải `profiles`) để không bỏ
sót tài khoản đã đăng ký mà chưa đăng nhập lần nào.

## Cấu hình đăng nhập Google

Code đã sẵn sàng, nhưng cần bật provider ở hai nơi sau mới dùng được:

1. **Google Cloud Console** → APIs & Services → Credentials → tạo *OAuth client ID*
   loại **Web application**. Ở *Authorized redirect URIs* thêm:

   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

2. **Supabase Dashboard** → Authentication:
   - *Providers → Google*: bật, dán Client ID và Client Secret vừa tạo.
   - *URL Configuration → Redirect URLs*: thêm `http://localhost:5173/auth/callback`
     và URL callback của môi trường production (`<FRONTEND_URL>/auth/callback`).

Biến môi trường không cần thêm gì mới: backend dựng URL callback từ
`FRONTEND_URL` đã có.
