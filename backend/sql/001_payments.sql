-- Bảng đơn thanh toán + kích hoạt gói tự động.
-- Chạy trong Supabase Dashboard → SQL Editor.

-- 1) Đơn thanh toán ------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid not null references public.subscription_plans (id),

  -- Mã đối soát người dùng ghi vào nội dung chuyển khoản. Đây là thứ duy nhất
  -- nối giao dịch ngoài đời với đơn trong hệ thống, nên phải là duy nhất.
  order_code text not null unique,

  amount_vnd integer not null check (amount_vnd >= 0),

  -- pending → paid (đã nhận tiền, đã kích hoạt gói) | failed | expired
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'expired')),

  -- Dữ liệu từ cổng/webhook, giữ lại để đối soát và debug.
  provider text not null default 'momo',
  provider_txn_id text,
  raw_payload jsonb,

  paid_at timestamptz,
  expires_at timestamptz not null default (now() + interval '1 hour'),
  created_at timestamptz not null default now()
);

create index if not exists payments_user_idx on public.payments (user_id);
create index if not exists payments_status_idx on public.payments (status);

-- Một giao dịch của cổng chỉ được ghi nhận một lần. Đây là chốt chống
-- double-activation khi webhook bị gọi lại (SePay retry tới 7 lần).
create unique index if not exists payments_provider_txn_idx
  on public.payments (provider, provider_txn_id)
  where provider_txn_id is not null;

-- 2) RLS -----------------------------------------------------------------
-- Người dùng chỉ đọc đơn của mình. Việc ghi do backend làm bằng secret key
-- (bỏ qua RLS) nên không cần policy insert/update cho client.
alter table public.payments enable row level security;

drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own" on public.payments
  for select using (auth.uid() = user_id);

-- 3) Kích hoạt gói trong một transaction ---------------------------------
-- Gộp "đánh dấu đã trả" + "tạo subscription" vào một hàm để không xảy ra
-- trạng thái nửa vời (đã trừ tiền nhưng chưa có gói).
--
-- Trả về: 'activated' nếu vừa kích hoạt, 'already_paid' nếu đơn đã xử lý
-- trước đó (webhook gọi lại), 'not_found' nếu không có đơn pending nào.
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

  select * into v_plan
  from public.subscription_plans
  where id = v_payment.plan_id;

  if not found then
    return 'plan_missing';
  end if;

  -- Nếu người dùng còn gói chưa hết hạn thì nối tiếp vào cuối, không cắt
  -- ngắn thời gian họ đã trả tiền.
  select greatest(max(s.expires_at), now()) into v_starts_at
  from public.subscriptions s
  where s.user_id = v_payment.user_id
    and s.revoked_at is null
    and s.expires_at is not null
    and s.expires_at > now();

  v_starts_at := coalesce(v_starts_at, now());

  v_expires_at := case v_plan.duration_unit
    when 'day'   then v_starts_at + (v_plan.duration_value || ' days')::interval
    when 'month' then v_starts_at + (v_plan.duration_value || ' months')::interval
    when 'year'  then v_starts_at + (v_plan.duration_value || ' years')::interval
    else null  -- unlimited
  end;

  insert into public.subscriptions (user_id, plan_id, activated_at, expires_at)
  values (v_payment.user_id, v_payment.plan_id, v_starts_at, v_expires_at);

  update public.payments
  set status = 'paid',
      paid_at = now(),
      provider_txn_id = coalesce(p_provider_txn_id, provider_txn_id),
      amount_vnd = coalesce(p_amount, amount_vnd),
      raw_payload = coalesce(p_raw, raw_payload)
  where id = v_payment.id;

  return 'activated';
end;
$$;

-- 4) Cho admin đọc số liệu toàn hệ thống ---------------------------------
-- Không bắt buộc nếu backend dùng secret key, nhưng để sẵn cho tiện.
drop policy if exists "payments_select_admin" on public.payments;
create policy "payments_select_admin" on public.payments
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
