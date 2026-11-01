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

## Video demo ở trang chủ

Video **không được commit vào repo** (`public/demo/` đã vào `.gitignore`): file
27MB sẽ phình lịch sử git vĩnh viễn và mỗi lần clone đều phải tải lại. Thay vào
đó host trên Cloudinary — họ tự transcode và phát qua CDN.

1. Upload video lên Cloudinary (Media Library → Upload, hoặc CLI), copy URL
   dạng:

   ```
   https://res.cloudinary.com/<cloud-name>/video/upload/v<version>/<public-id>.mp4
   ```

2. Thêm vào `frontend/screentrans-frontend/.env`, và vào **Environment
   Variables của Vercel** cho môi trường production:

   ```
   VITE_DEMO_VIDEO_URL=<URL vừa copy>
   ```

Thiếu biến này thì section demo tự ẩn, trang chủ vẫn chạy bình thường — nên
không ai phải thấy một khung video lỗi khi chưa cấu hình.

Ảnh poster được suy ra từ chính URL đó (Cloudinary trả thumbnail khi đổi `.mp4`
thành `.jpg`), nên không cần cấu hình thêm. Biến `VITE_*` bị nhúng vào bundle,
nhưng URL video vốn công khai nên không sao — **không** đặt API secret của
Cloudinary ở đây.

Muốn giảm dung lượng thêm thì thay `/upload/` bằng `/upload/q_auto,f_auto/`
trong URL để Cloudinary tự chọn chất lượng và định dạng theo trình duyệt.

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
   `payments`, lấy **email của người đăng nhập** làm nội dung chuyển khoản, rồi
   sinh **mã QR động** (VietQR) đã nhúng sẵn số tiền và nội dung đó.
2. Người dùng quét QR — số tiền và nội dung đã được điền sẵn, không phải gõ gì.
3. SePay phát hiện tiền vào → gọi `POST /api/payments/webhook/sepay`.
4. Backend khớp nội dung chuyển khoản với email của đơn (xem *Khớp đơn bằng
   email* bên dưới), kiểm tra số tiền, rồi gọi hàm SQL
   `activate_paid_order` để đánh dấu đã trả **và** tạo subscription trong cùng
   một transaction.
5. Trang checkout hỏi trạng thái mỗi 5 giây nên tự chuyển sang "đã thanh toán".

### Cấu hình

1. Chạy trong Supabase SQL Editor, theo thứ tự:
   - `backend/sql/001_payments.sql` — tạo bảng `payments`, RLS và hàm
     `activate_paid_order`.
   - `backend/sql/002_payment_fixes.sql` — bản sửa đang dùng (xem *Những gì 002
     sửa* bên dưới). **Bắt buộc chạy**, nếu không gói sẽ bị kích hoạt sai.
   - `backend/sql/003_email_memo.sql` — thêm cột nội dung chuyển khoản và hàm
     `match_order_by_memo`. **Bắt buộc chạy**, nếu không webhook không khớp
     được đơn nào.
2. Thêm vào `backend/.env`:

   ```
   SEPAY_WEBHOOK_API_KEY=<chuỗi ngẫu nhiên tự đặt>

   # Tài khoản nhận tiền — dùng để sinh QR động
   BANK_ACCOUNT_NUMBER=<số tài khoản>
   BANK_CODE=TPBank
   BANK_ACCOUNT_HOLDER=PHAM QUANG MINH
   ```

   Thiếu `BANK_ACCOUNT_NUMBER` hoặc `BANK_CODE` thì `POST /payments/orders` trả
   503 — không dựng được QR nên không để người dùng vào trang không trả được
   tiền.

   Cần `SUPABASE_SECRET_KEY` (xem phần dưới) vì webhook ghi dữ liệu thay người
   dùng, không có access token của họ.
3. Trong SePay: liên kết tài khoản ngân hàng (hiện dùng **TPBank**), rồi thêm
   webhook trỏ tới `https://<backend>/api/payments/webhook/sepay`:
   - Loại giao dịch: **Có tiền vào**
   - Định dạng dữ liệu: **JSON**
   - Kiểu xác thực: **API Key**, giá trị đúng bằng `SEPAY_WEBHOOK_API_KEY`
     (SePay gửi header `Authorization: Apikey <key>`)

Webhook trả `{"success": true}` kèm HTTP 200 như SePay yêu cầu; sai thì SePay
retry tới 7 lần trong 5 giờ. Việc gọi lại nhiều lần là an toàn: `activate_paid_order`
dùng `SELECT ... FOR UPDATE` và trả `already_paid` nên gói không bị kích hoạt hai lần.

### Khớp đơn bằng email

Nội dung chuyển khoản là email người đăng ký thay vì mã đơn ngẫu nhiên: người
dùng không phải gõ hay dán gì, và nếu quét QR thì nội dung đã nhúng sẵn.

Chuỗi VietQR và app ngân hàng đều bỏ `@` `.` `+` khỏi nội dung và viết hoa phần
còn lại, nên **nội dung của đơn là dạng đã chuẩn hoá** (`an.vu+x@gmail.com` →
`ANVUXGMAILCOM`), không phải email nguyên bản. Trang checkout hiển thị đúng
chuỗi đó để khớp với cái người dùng thấy khi quét QR — nếu hiện email nguyên bản
thì họ tưởng hệ thống sinh sai nội dung.

Webhook chuẩn hoá nội dung nhận được theo cùng cách rồi tìm `transfer_memo_key`
của đơn nằm trong đó (`match_order_by_memo`).

Một người có thể có nhiều đơn pending cùng email (mở cả trang gói tháng và gói
năm). Số tiền là thứ phân biệt: hàm chọn đơn có `amount_vnd` **lớn nhất mà số
tiền đã trả vẫn đủ**, nên trả 599.000đ kích hoạt gói năm chứ không phải gói
tháng. Key ngắn hơn 6 ký tự bị bỏ qua để không khớp tình cờ.

Mã đơn `ST...` vẫn được quét trước, nên các đơn tạo theo cơ chế cũ không bị treo.

### Ba thứ webhook phải đảm bảo

- **Đúng người** — `payments.user_id` *và* `transfer_memo` đều được chốt từ
  access token lúc tạo đơn (`req.user.email`), không bao giờ từ body; nếu không
  người dùng có thể khai email của người khác rồi chiếm gói khi người kia chuyển
  khoản. `activate_paid_order` đọc lại `user_id` từ chính row đó, nên webhook
  không thể gán gói sang người khác.
- **Đúng giá** — `amount_vnd` lấy từ `subscription_plans.price_vnd` lúc tạo đơn,
  không bao giờ từ client. So sánh diễn ra hai lần: ở controller (để ghi log rõ)
  và lại trong transaction SQL. Trả thiếu → `underpaid`, không kích hoạt. Webhook
  không cho biết số tiền → cũng **không** kích hoạt.
- **Đúng thời gian** — `activated_at = now()` nên quyền lợi có hiệu lực ngay khi
  tiền vào; chỉ `expires_at` mới nối tiếp vào hạn gói cũ (gia hạn sớm không bị
  cắt ngắn thời gian đã trả tiền).

### Những gì 002 sửa

- `transferAmount` không đọc được (thiếu field, `null`, chuỗi rác) từng cho
  `Number(...)` ra `NaN`; `NaN < giá` là `false` nên đơn **được kích hoạt dù
  không biết người dùng trả bao nhiêu**. Giờ bị từ chối ở cả Node và SQL.
- Gia hạn sớm từng đặt `activated_at` ở tương lai, khiến
  `GET /subscriptions/my` trả `pending` và người vừa trả tiền **tụt về quyền lợi
  gói free** cho tới ngày hết hạn cũ.
- Một giao dịch ngân hàng từng có thể kích hoạt nhiều đơn (nội dung lẫn nhiều
  mã). Giờ dừng sau đơn đầu tiên, và SQL từ chối `duplicate_txn`.
- Cửa sổ thanh toán 1 tiếng → 24 tiếng, và `createOrder` tái dùng đơn pending
  còn hạn thay vì tạo mã mới mỗi lần mở trang checkout (trước đây mở lại trang
  là mã đổi, lệch với mã người dùng vừa ghi vào nội dung chuyển khoản).

### Lưu ý

- Nội dung chuyển khoản được quét ở cả ba field `code`, `content`, `description`
  (viết thường và dấu `-` `_` `.` chèn giữa đều nhận được).
- QR được sinh động ở backend (`order.qr_url`, qua `qr.sepay.vn`) với số tiền
  lấy từ `subscription_plans.price_vnd` lúc tạo đơn, nên **đổi giá gói không
  cần vẽ lại ảnh QR nữa**. Các ảnh tĩnh trong `frontend/.../public/qr/` không
  còn được dùng.
- Số tài khoản nhận tiền chỉ nằm ở backend (`BANK_*`), không nhúng vào bundle
  frontend — client không được quyết định tiền chảy về đâu.

## Cấu hình trang quản trị

Trang `/admin` gồm bốn phần:

- **Hàng thẻ số liệu** — số người đăng ký, số gói tháng và gói năm **đang còn
  hạn**, và tổng doanh thu.
- **Bảng người dùng gói tháng** và **bảng người dùng gói năm** — ai đang còn
  hạn, sắp hết hạn xếp lên trên để tiện nhắc gia hạn (dưới 7 ngày được tô màu
  cảnh báo). Bấm một dòng để mở hộp thoại chi tiết, xem và sửa key ngay.
- **Bảng danh sách người dùng** — toàn bộ tài khoản, chia trang 25 dòng, có ô
  tìm theo email/tên và lọc theo gói. **Bấm vào một dòng** để mở hộp thoại chi
  tiết: toàn bộ gói của người đó (kể cả đã hết hạn / thu hồi) với trạng thái,
  ngày kích hoạt, ngày hết hạn và activation key — key sửa được tại chỗ.

Phân trang làm ở **client**, không phải ở API: hai bảng gói tháng/năm và ô tìm
kiếm đều cần toàn bộ danh sách, nên vẫn phải tải hết một lần (341 người ≈ 121KB,
~230ms — chưa đáng để tách endpoint). Thứ thực sự làm chậm là số dòng đem
render, và phân trang client đã xử lý: DOM giữ nguyên ~450 node dù có 341 hay
2000 người dùng. Đổi trang không gọi lại API.

Khi nào nên chuyển sang phân trang phía server: lúc danh sách lớn tới mức bản
thân việc tải JSON thành vấn đề (cỡ chục nghìn người). Khi đó phải đổi cả hai
bảng gói và ô tìm kiếm sang truy vấn server, không chỉ riêng bảng này.

Về việc sửa key: cột trong database tên là `activation_key_hash` nhưng thực tế
lưu **key dạng thô** (app desktop đọc thẳng), nên trang quản trị hiện nguyên
văn và ghi đè nguyên văn. Key được `trim()` trước khi ghi vì vài dòng cũ đang
dính `\r\n` ở cuối do dán từ email, và `key_last4` được cập nhật theo key mới.

Ngày kích hoạt / hết hạn **cố ý không cho sửa**: chúng do luồng thanh toán tính
ra từ bảng `payments`, sửa tay sẽ làm hai bảng lệch nhau.

### Cấp gói tay

Trong hộp thoại chi tiết có nút **Cấp gói tháng / Cấp gói năm** — dùng khi tặng
gói, đền bù, hoặc nhận tiền ngoài luồng tự động. Nút luôn hiện, kể cả với người
đã có gói (khi đó đổi chữ thành "Cấp thêm gói").

Gói cấp tay hành xử giống gói mua qua `activate_paid_order`:

- **Nối tiếp hạn cũ** — người còn 20 ngày mà được cấp thêm 1 tháng thì thành
  50 ngày, không bị cắt còn 30.
- **Có hiệu lực ngay** (`activated_at = now()`), chỉ `expires_at` mới cộng dồn.
- **Tự sinh activation key** cùng dạng `ST-...` nên app desktop không phải
  phân biệt gói mua với gói tặng.

Điểm khác: **không ghi gì vào bảng `payments`**. Ở đây không có tiền thật chạy
qua, ghi vào đó sẽ thổi phồng doanh thu hiển thị trên chính trang này. Hệ quả
là người được tặng gói sẽ hiện ở bảng gói tháng/năm nhưng cột "đã trả" là 0 —
đúng như thực tế.

Lưu ý khi sửa code: cột `subscriptions.plan_name` có `DEFAULT 'monthly'`, nên
khi tạo dòng mới phải truyền giá trị này, không thì gói năm bị ghi nhầm thành
gói tháng.

Doanh thu được cộng từ bảng `payments` (tiền thực nhận), không nhân ngược từ
giá gói đang còn hạn: giá trong `subscription_plans` có thể đã bị sửa sau khi
người dùng trả tiền.

Cần hai bước để dùng được trang này:

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

## Tạo tài khoản mẫu hàng loạt

```bash
python -I -X utf8 scripts/seed_users_admin.py "DS-học-EXE201-kỳ-SU26 (1).xlsx" 200 [--dry-run]
```

Đọc danh sách lớp trong file `.xlsx`, tạo tài khoản qua **Admin API** của
Supabase (`POST /auth/v1/admin/users`, cần `SUPABASE_SECRET_KEY`). Mật khẩu
ngẫu nhiên của từng tài khoản được ghi vào `scripts/seeded-users.csv` — file
này đã nằm trong `.gitignore`, **đừng commit**.

Vì sao không dùng `scripts/seed_users.py` (bản cũ, gọi signup công khai):

- Signup công khai **gửi mail xác thực** nên dính quota của Supabase — lần chạy
  trước chết giữa chừng với `email rate limit exceeded`, chỉ tạo được 8/21 tài
  khoản. Admin API không gửi mail nên không có giới hạn này.
- Admin API đặt được `email_confirm: true`, tài khoản **xác thực sẵn** và đăng
  nhập được ngay, không cần ai bấm link trong mail.

Script đổi mọi email sang đuôi `@gmail.com` (giữ nguyên phần trước `@`). Vì
không có mail nào được gửi đi, các địa chỉ này chỉ là khoá định danh trong
database chứ không làm phiền hộp thư của ai.

Trước khi tạo, script đọc toàn bộ `auth.users` và bỏ qua email đã tồn tại, nên
chạy lại nhiều lần không sinh bản ghi trùng. Dùng `--dry-run` để xem trước danh
sách mà không gọi API.

### Vá email cho tài khoản đã tạo

```bash
python -I -X utf8 scripts/fix_user_emails.py "DS-học-EXE201-kỳ-SU26 (1).xlsx" [--dry-run] [--rename]
```

**Tài khoản tạo bằng Admin API luôn có `profiles.email = NULL`** — phải chạy
script này sau mỗi lần seed, nếu không cột email ở trang quản trị bị trống.

Nguyên nhân nằm trong trigger `on_auth_user_created` (định nghĩa trong
Dashboard, không có trong repo): nó chỉ điền `profiles.email` cho luồng signup
công khai. Thêm `email` vào `user_metadata` lúc tạo **không giải quyết được** —
đã thử trên lứa 100 tài khoản ngày 01/11/2026: metadata có đủ email mà
`profiles.email` vẫn NULL cả 100 dòng. Muốn sửa tận gốc thì phải sửa trigger
trong SQL Editor; trước khi làm được việc đó, cách chắc chắn là chạy script này
sau khi seed.

**`--rename` đổi cả email trong `auth.users`, mặc định tắt.** Email là danh
tính đăng nhập: đổi email của một người đang dùng thật sẽ làm họ mất đường vào,
nhất là tài khoản Google (danh tính gắn với địa chỉ bên Google). Không có cờ
này thì script chỉ vá dữ liệu hiển thị, không đụng vào đăng nhập của ai.

Script không bao giờ xoá tài khoản. Địa chỉ gmail đích đã có người dùng thì chỉ
được liệt kê ra để xử lý riêng — `auth.users.email` là UNIQUE nên không thể có
hai tài khoản cùng địa chỉ.

**17 tài khoản đuôi `@fpt.edu.vn` được giữ nguyên, có chủ đích** — đừng chạy
`--rename` để "dọn" chúng:

- 15 tài khoản đã có bản sao đuôi gmail (cùng người, sinh ra từ cùng dòng trong
  file lớp). Đổi đuôi sẽ đụng ràng buộc UNIQUE, muốn đổi thì phải xoá một
  trong hai.
- 2 tài khoản còn lại là **người dùng thật đã đăng nhập**, không phải dữ liệu
  mẫu. Email là danh tính đăng nhập nên đổi sẽ làm họ mất đường vào — một
  trong hai đăng nhập bằng Google thì chắc chắn hỏng. Chạy script với
  `--dry-run` sẽ liệt kê ra cụ thể là tài khoản nào.

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

## Đổi thông tin tài khoản

Trang `/profile` cho phép sửa họ tên và email đăng nhập (`PATCH /api/auth/me`).

- **Họ tên** đổi ngay: ghi vào `user_metadata` của `auth.users` và cột
  `profiles.full_name`.
- **Email** không đổi ngay. Supabase gửi liên kết xác nhận tới địa chỉ mới; chỉ
  sau khi người dùng bấm liên kết đó thì email đăng nhập mới thay đổi. Cột
  `profiles.email` được đồng bộ ở lần đăng nhập / xác thực kế tiếp.

Mặc định Supabase bật *Authentication → Providers → Email → Secure email change*,
nghĩa là liên kết xác nhận được gửi tới **cả hai** địa chỉ (cũ và mới) và phải
mở cả hai mới hoàn tất. Trang `/auth/confirm` xử lý trường hợp này: lần xác nhận
đầu hiện thông báo còn thiếu một bước thay vì báo lỗi. Tắt tuỳ chọn đó nếu muốn
chỉ cần xác nhận ở địa chỉ mới.

URL trong email xác nhận cũng trỏ về `<FRONTEND_URL>/auth/confirm`, nên đường dẫn
này phải nằm trong *URL Configuration → Redirect URLs* như mục trên.
