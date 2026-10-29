-- Sửa luồng kích hoạt gói từ webhook SePay (TPBank).
-- Chạy trong Supabase Dashboard → SQL Editor, sau 001_payments.sql.
--
-- Ba thứ được sửa so với 001:
--   1) ĐÚNG GIÁ    — số tiền được kiểm tra bên trong transaction, không chỉ ở
--                    tầng Node. `p_amount` null giờ bị từ chối thay vì được
--                    coalesce thành đúng giá gói (001 kích hoạt gói khi webhook
--                    gửi transferAmount không đọc được).
--   2) ĐÚNG THỜI GIAN — gói gia hạn có hiệu lực NGAY (activated_at = now()),
--                    chỉ expires_at mới nối tiếp vào hạn cũ. 001 đặt
--                    activated_at ở tương lai nên GET /subscriptions/my trả
--                    status 'pending' và người vừa trả tiền bị tụt về quyền
--                    lợi gói free.
--   3) CHỐNG GHI HAI LẦN — một transaction của SePay (`id`/`referenceCode`)
--                    chỉ được dùng cho một đơn.

-- 1) Cửa sổ thanh toán -----------------------------------------------------
-- 1 tiếng quá ngắn: người dùng mở trang checkout rồi mới đi mở app ngân hàng.
-- Giá trị này chỉ dùng để gom đơn pending, không dùng để từ chối tiền đã vào.
alter table public.payments
  alter column expires_at set default (now() + interval '24 hours');

-- 2) Tiền vào từ SePay, không phải MoMo ------------------------------------
alter table public.payments
  alter column provider set default 'sepay';

-- Index phục vụ createOrder: tìm đơn pending còn hạn của một người cho một gói.
create index if not exists payments_user_plan_status_idx
  on public.payments (user_id, plan_id, status);

-- 3) Kích hoạt gói trong một transaction -----------------------------------
-- Trả về một trong các giá trị:
--   activated      vừa kích hoạt
--   already_paid   đơn đã xử lý trước đó (SePay gọi lại webhook)
--   duplicate_txn  transaction này đã dùng cho đơn khác
--   underpaid      không đủ tiền, hoặc webhook không cho biết số tiền
--   order_failed   đơn đã bị đánh dấu thất bại, không tự kích hoạt
--   plan_missing   gói đã bị xoá khỏi subscription_plans
--   not_found      không có đơn nào mang mã này
create or replace function public.activate_paid_order(
  p_order_code text,
  p_provider_txn_id text,
  p_amount integer,
  p_raw jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
  v_plan public.subscription_plans;
  v_stack_until timestamptz;
  v_starts_at timestamptz := now();
  v_expires_at timestamptz;
begin
  -- FOR UPDATE: hai webhook gọi cùng lúc thì cái thứ hai phải đợi, đọc lại
  -- status đã là 'paid' và thoát ra thay vì kích hoạt lần nữa.
  select * into v_payment
  from public.payments
  where order_code = p_order_code
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_payment.status = 'paid' then
    return 'already_paid';
  end if;

  if v_payment.status = 'failed' then
    return 'order_failed';
  end if;

  -- Cùng một giao dịch ngân hàng không được kích hoạt hai đơn khác nhau. Kiểm
  -- tra ở đây (thay vì để unique index ném lỗi) để webhook trả 200 và SePay
  -- không retry vô ích 7 lần.
  if p_provider_txn_id is not null and exists (
    select 1 from public.payments
    where provider_txn_id = p_provider_txn_id
      and id <> v_payment.id
  ) then
    return 'duplicate_txn';
  end if;

  -- ĐÚNG GIÁ: chốt lại trong transaction. amount_vnd của đơn được tính từ
  -- subscription_plans.price_vnd lúc tạo đơn, không bao giờ từ client.
  if p_amount is null or p_amount < v_payment.amount_vnd then
    return 'underpaid';
  end if;

  select * into v_plan
  from public.subscription_plans
  where id = v_payment.plan_id;

  if not found then
    return 'plan_missing';
  end if;

  -- ĐÚNG THỜI GIAN: nếu người dùng còn gói chưa hết hạn thì hạn mới nối tiếp
  -- vào cuối, không cắt ngắn thời gian họ đã trả tiền.
  select max(s.expires_at) into v_stack_until
  from public.subscriptions s
  where s.user_id = v_payment.user_id
    and s.revoked_at is null
    and s.expires_at is not null
    and s.expires_at > now();

  v_expires_at := case v_plan.duration_unit
    when 'day'   then coalesce(v_stack_until, now()) + (v_plan.duration_value || ' days')::interval
    when 'month' then coalesce(v_stack_until, now()) + (v_plan.duration_value || ' months')::interval
    when 'year'  then coalesce(v_stack_until, now()) + (v_plan.duration_value || ' years')::interval
    else null  -- unlimited
  end;

  -- activated_at là now() kể cả khi gia hạn sớm: quyền lợi phải có hiệu lực
  -- ngay khi tiền vào. Chỉ expires_at mới cộng dồn.
  insert into public.subscriptions (user_id, plan_id, activated_at, expires_at)
  values (v_payment.user_id, v_payment.plan_id, v_starts_at, v_expires_at);

  update public.payments
  set status = 'paid',
      paid_at = now(),
      provider_txn_id = coalesce(p_provider_txn_id, provider_txn_id),
      amount_vnd = v_payment.amount_vnd,  -- giữ giá gốc của đơn để đối soát
      raw_payload = coalesce(p_raw, raw_payload)
  where id = v_payment.id;

  return 'activated';
end;
$$;
