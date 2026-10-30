-- Nội dung chuyển khoản là email người đăng ký + QR động.
-- Chạy trong Supabase Dashboard → SQL Editor, sau 002_payment_fixes.sql.
--
-- Vì sao cần cột mới: webhook chỉ nhận được nội dung chuyển khoản do ngân hàng
-- in ra (đã viết hoa và mất `@` `.` `+`). Muốn khớp nội dung đó với một đơn thì
-- phải lưu sẵn dạng đã chuẩn hoá của email, không thể join sang auth.users rồi
-- chuẩn hoá tại thời điểm đọc (không đánh index được, và `@`/`.` biến mất khác
-- nhau tuỳ ngân hàng).

-- 1) Nội dung chuyển khoản của đơn ----------------------------------------
alter table public.payments
  add column if not exists transfer_memo text;

-- Dạng chuẩn hoá: chỉ A-Z và 0-9, dùng để so khớp với nội dung từ webhook.
alter table public.payments
  add column if not exists transfer_memo_key text;

create index if not exists payments_memo_key_idx
  on public.payments (transfer_memo_key)
  where status = 'pending';

-- 2) Khớp đơn theo nội dung chuyển khoản ----------------------------------
-- Trả về mã đơn pending còn hạn khớp với nội dung chuyển khoản và số tiền.
--
-- Vì nội dung giờ là email (không còn là mã đơn ngẫu nhiên), một người có thể
-- có nhiều đơn pending cùng email — ví dụ mở cả trang gói tháng và gói năm.
-- Số tiền là thứ phân biệt: chọn đơn có amount_vnd lớn nhất mà người dùng đã
-- trả đủ. Trả đủ cho gói năm thì kích hoạt gói năm, không phải gói tháng.
create or replace function public.match_order_by_memo(
  p_content_key text,
  p_amount integer
)
returns text
language sql
security definer
set search_path = public
as $$
  select p.order_code
  from public.payments p
  where p.status = 'pending'
    and p.expires_at > now()
    and p.transfer_memo_key is not null
    and length(p.transfer_memo_key) >= 6
    and position(p.transfer_memo_key in p_content_key) > 0
    and p_amount >= p.amount_vnd
  order by p.amount_vnd desc, p.created_at asc
  limit 1;
$$;
