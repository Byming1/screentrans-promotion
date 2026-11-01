begin;
create table public.desktop_server_config (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  gateway_key_hash text check (gateway_key_hash ~ '^[a-f0-9]{64}$'),
  frontend_url text not null default 'https://screentrans-promotion.vercel.app',
  check (not enabled or gateway_key_hash is not null)
);
alter table public.desktop_server_config enable row level security;
revoke all on public.desktop_server_config from public, anon, authenticated, service_role;
grant select on public.desktop_server_config to service_role;
insert into public.desktop_server_config(id, enabled) values (true, false);
commit;
