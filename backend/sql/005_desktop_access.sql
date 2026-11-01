-- Apply only this migration on the existing production schema (001-003).
-- 004_randomize_last_sign_in.sql is sample-data tooling, NOT a prerequisite.
begin;

revoke execute on function public.activate_paid_order(text, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.activate_paid_order(text, text, integer, jsonb) to service_role;
revoke execute on function public.match_order_by_memo(text, integer) from public, anon, authenticated;
grant execute on function public.match_order_by_memo(text, integer) to service_role;

-- Existing profile upserts may update id/email/name, but never the role.
revoke insert, update, delete on public.profiles from public, anon, authenticated;
revoke insert(role), update(role) on public.profiles from public, anon, authenticated;
grant insert(id, email, full_name), update(id, email, full_name) on public.profiles to authenticated;
alter table public.profiles enable row level security;
drop policy if exists desktop_profile_self_only on public.profiles;
create policy desktop_profile_self_only on public.profiles as restrictive
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.subscriptions, public.subscription_plans, public.payments from public, anon, authenticated;

create table public.desktop_login_requests (
  device_hash text primary key check (length(device_hash) = 64),
  user_code text not null unique,
  device_id uuid not null,
  device_name text not null check (length(device_name) between 1 and 80),
  user_id uuid references auth.users(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending', 'approved', 'denied', 'exchanged')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);
create table public.desktop_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  token_hash text not null unique check (length(token_hash) = 64),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz
);
create index desktop_sessions_user on public.desktop_sessions(user_id);
create table public.desktop_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  used_count bigint not null default 0 check (used_count >= 0),
  primary key (user_id, usage_day)
);
create table public.desktop_usage_receipts (
  session_id uuid not null references public.desktop_sessions(id) on delete cascade,
  request_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  primary key (session_id, request_id)
);
create index desktop_receipts_retention on public.desktop_usage_receipts(user_id, usage_day);
alter table public.desktop_login_requests enable row level security;
alter table public.desktop_sessions enable row level security;
alter table public.desktop_daily_usage enable row level security;
alter table public.desktop_usage_receipts enable row level security;
revoke all on public.desktop_login_requests, public.desktop_sessions,
  public.desktop_daily_usage, public.desktop_usage_receipts from public, anon, authenticated;
grant all on public.desktop_login_requests, public.desktop_sessions,
  public.desktop_daily_usage, public.desktop_usage_receipts to service_role;

create function public.exchange_desktop_login(p_device_hash text, p_device_id uuid, p_session_id uuid, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.desktop_login_requests; s public.desktop_sessions;
begin
  select * into r from public.desktop_login_requests
    where device_hash = p_device_hash and device_id = p_device_id for update;
  if not found or r.expires_at <= now() then return jsonb_build_object('error', 'expired_token'); end if;
  if r.state = 'pending' then return jsonb_build_object('error', 'authorization_pending'); end if;
  if r.state <> 'approved' then return jsonb_build_object('error', 'access_denied'); end if;
  if not exists (select 1 from auth.users where id = r.user_id
    and coalesce(banned_until, '-infinity'::timestamptz) <= now()) then
    return jsonb_build_object('error', 'access_denied');
  end if;
  insert into public.desktop_sessions(id, user_id, device_id, token_hash)
    values (p_session_id, r.user_id, r.device_id, p_token_hash) returning * into s;
  update public.desktop_login_requests set state = 'exchanged' where device_hash = r.device_hash;
  return jsonb_build_object('session_id', s.id, 'user_id', s.user_id,
    'expires', extract(epoch from s.expires_at));
end;
$$;

create function public.authorize_desktop_session(p_token_hash text, p_device_id uuid,
  p_consume boolean default false, p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.desktop_sessions; p public.subscription_plans; sub_id uuid; sub_end timestamptz;
  used bigint := 0; day date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  replay boolean := false;
begin
  select ds.* into s from public.desktop_sessions ds join auth.users u on u.id = ds.user_id
    where ds.token_hash = p_token_hash and ds.device_id = p_device_id and ds.revoked_at is null
      and ds.expires_at > now() and coalesce(u.banned_until, '-infinity'::timestamptz) <= now();
  if not found then return jsonb_build_object('error', 'invalid_session'); end if;
  select sp.id, su.id, su.expires_at into p.id, sub_id, sub_end
    from public.subscriptions su join public.subscription_plans sp on sp.id = su.plan_id
    where su.user_id = s.user_id and su.revoked_at is null and su.activated_at <= now()
      and (su.expires_at is null or su.expires_at > now())
    order by (sp.tier = 'premium') desc, (sp.daily_scan_limit is null) desc,
      sp.daily_scan_limit desc, su.expires_at desc nulls first, su.id limit 1;
  if found then select * into p from public.subscription_plans where id = p.id;
  else select * into p from public.subscription_plans where code = 'FREE' and is_active limit 1;
  end if;
  if p.id is null then return jsonb_build_object('error', 'plan_unavailable'); end if;
  if p_consume then
    if p_request_id is null then return jsonb_build_object('error', 'invalid_request'); end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('desktop_usage:' || s.user_id::text, 0));
    select exists(select 1 from public.desktop_usage_receipts
      where session_id = s.id and request_id = p_request_id) into replay;
  end if;
  select used_count into used from public.desktop_daily_usage where user_id = s.user_id and usage_day = day;
  used := coalesce(used, 0);
  if p_consume and not replay then
    if p.daily_scan_limit is not null and used >= p.daily_scan_limit then
      return jsonb_build_object('error', 'quota_exceeded', 'limit', p.daily_scan_limit, 'used', used, 'day', day);
    end if;
    insert into public.desktop_daily_usage(user_id, usage_day, used_count) values (s.user_id, day, 1)
      on conflict (user_id, usage_day) do update set used_count = public.desktop_daily_usage.used_count + 1
      returning used_count into used;
    insert into public.desktop_usage_receipts(session_id, request_id, user_id, usage_day)
      values (s.id, p_request_id, s.user_id, day);
    delete from public.desktop_usage_receipts where user_id = s.user_id and usage_day < day - 2;
  end if;
  return jsonb_build_object('client_id', 'account:' || s.user_id::text, 'session_id', s.id,
    'user_id', s.user_id, 'device_id', s.device_id, 'expires', extract(epoch from s.expires_at),
    'minimum_interval', 1.0, 'subscription_id', sub_id, 'subscription_expires_at', sub_end,
    'plan', jsonb_build_object('code', p.code, 'name', p.name, 'tier', p.tier, 'features', p.features),
    'quota', jsonb_build_object('limit', p.daily_scan_limit, 'used', used, 'day', day));
end;
$$;
revoke all on function public.exchange_desktop_login(text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.authorize_desktop_session(text, uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.exchange_desktop_login(text, uuid, uuid, text) to service_role;
grant execute on function public.authorize_desktop_session(text, uuid, boolean, uuid) to service_role;
commit;
