-- Rải ngẫu nhiên `last_sign_in_at` cho các tài khoản mẫu, từ 29/10/2026 đến nay.
-- Chạy trong Supabase Dashboard → SQL Editor.
--
-- VÌ SAO PHẢI CHẠY BẰNG SQL: `auth.users.last_sign_in_at` do GoTrue quản lý.
-- Admin API (`PUT /auth/v1/admin/users/:id`) nhận request và trả 200 nhưng
-- **bỏ qua** trường này, còn schema `auth` thì không expose qua PostgREST
-- ("Only the following schemas are exposed: public"). Nên không có đường nào
-- sửa từ script Node/Python.
--
-- PHẠM VI: chỉ đụng vào tài khoản **chưa từng đăng nhập thật**
-- (`last_sign_in_at IS NULL`). 22 người đã đăng nhập thật giữ nguyên mốc thật
-- của họ — ghi đè lên đó là làm hỏng dữ liệu thật.

begin;

-- 1) Backdate created_at cho tài khoản mẫu ---------------------------------
-- 200 tài khoản mẫu đều được tạo trong vài phút của ngày 01/11, nên nếu chỉ
-- gán last_sign_in_at trong khoảng 29/10..nay thì phần lớn sẽ rơi vào thời
-- điểm TRƯỚC created_at — vô lý, và trang quản trị hiện "ngày tạo" dồn cục
-- một chỗ trong khi "đăng nhập" lại rải đều.
--
-- Vì vậy rải luôn created_at trong cùng khoảng, rồi mới gán lần đăng nhập sau
-- mốc đó. Bỏ qua bước này nếu bạn muốn giữ nguyên ngày tạo thật.
update auth.users u
set created_at = ts.new_created,
    updated_at = greatest(u.updated_at, ts.new_created)
from (
  select id,
         timestamptz '2026-10-29 00:00:00+07'
           + random() * (now() - timestamptz '2026-10-29 00:00:00+07') as new_created
  from auth.users
  where last_sign_in_at is null
    and created_at >= timestamptz '2026-10-29 00:00:00+07'
) ts
where u.id = ts.id;

-- 2) Rải last_sign_in_at ---------------------------------------------------
-- Mốc đăng nhập luôn nằm SAU created_at: lấy max(created_at, 29/10) làm cận
-- dưới rồi random tới now(). Nhờ vậy không sinh ra tài khoản "đăng nhập trước
-- khi tồn tại", kể cả với các tài khoản cũ tạo trước 29/10.
update auth.users u
set last_sign_in_at = ts.signed_in,
    updated_at = greatest(u.updated_at, ts.signed_in)
from (
  select id,
         lower_bound + random() * (now() - lower_bound) as signed_in
  from (
    select id,
           greatest(created_at, timestamptz '2026-10-29 00:00:00+07') as lower_bound
    from auth.users
    where last_sign_in_at is null
  ) b
  -- Tài khoản tạo trong vài giây gần đây có thể cho khoảng rỗng; lọc ra cho chắc.
  where lower_bound < now()
) ts
where u.id = ts.id;

-- 3) Đồng bộ profiles.created_at ------------------------------------------
-- Trang quản trị đọc "ngày tạo" từ auth.users, nhưng giữ hai bảng khớp nhau
-- để các truy vấn khác không thấy hai con số lệch nhau.
update public.profiles p
set created_at = u.created_at
from auth.users u
where p.id = u.id
  and p.created_at <> u.created_at;

commit;

-- 4) Kiểm tra lại ----------------------------------------------------------
select
  count(*)                                               as tong,
  count(last_sign_in_at)                                 as co_lan_dang_nhap,
  count(*) filter (where last_sign_in_at < created_at)   as loi_dang_nhap_truoc_khi_tao,
  min(last_sign_in_at)                                   as som_nhat,
  max(last_sign_in_at)                                   as muon_nhat
from auth.users;
