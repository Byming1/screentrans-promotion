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
