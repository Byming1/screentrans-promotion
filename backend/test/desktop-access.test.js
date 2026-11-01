import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

let db;
const user = "10000000-0000-4000-8000-000000000001";
const device = "20000000-0000-4000-8000-000000000001";
const session = "30000000-0000-4000-8000-000000000001";
const free = "40000000-0000-4000-8000-000000000001";
const premium = "40000000-0000-4000-8000-000000000002";
const hash = "a".repeat(64);

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    create table auth.users(id uuid primary key, banned_until timestamptz);
    create table public.profiles(id uuid primary key references auth.users, email text, full_name text, role text default 'user');
    create table public.subscription_plans(id uuid primary key, code text, name text, tier text,
      price_vnd integer, duration_unit text, duration_value integer, daily_scan_limit integer, features jsonb, is_active boolean default true);
    create table public.subscriptions(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users,
      plan_id uuid references public.subscription_plans, activated_at timestamptz default now(), expires_at timestamptz, revoked_at timestamptz);
    create table public.payments(id uuid);
    create function public.activate_paid_order(text, text, integer, jsonb) returns text language sql security definer as $$ select 'test'::text $$;
    create function public.match_order_by_memo(text, integer) returns text language sql security definer as $$ select 'test'::text $$;
    grant all on all tables in schema public to anon, authenticated, service_role;
    alter table profiles enable row level security;
    create policy own_profile on profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
  `);
  await db.exec(await readFile(new URL("../sql/005_desktop_access.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../sql/006_desktop_server_config.sql", import.meta.url), "utf8"));
});
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("reset role; truncate auth.users, subscription_plans cascade;");
  await db.query("insert into auth.users(id) values ($1)", [user]);
  await db.query(`insert into subscription_plans(id,code,name,tier,daily_scan_limit,features,is_active) values
    ($1,'FREE','Free','free',50,'{"standard_overlay":true,"auto_full_screen_scan":false}',true),
    ($2,'PREMIUM_MONTHLY','Premium Monthly','premium',null,'{"standard_overlay":true,"auto_full_screen_scan":true}',true)`, [free, premium]);
  await db.query("insert into desktop_sessions(id,user_id,device_id,token_hash) values ($1,$2,$3,$4)", [session, user, device, hash]);
});
async function access({ tokenHash = hash, deviceId = device, consume = false, requestId = null } = {}) {
  const { rows } = await db.query("select authorize_desktop_session($1,$2,$3,$4) as result", [tokenHash, deviceId, consume, requestId]);
  return rows[0].result;
}
async function grant(end = null) {
  return (await db.query("insert into subscriptions(user_id,plan_id,expires_at) values ($1,$2,$3) returning id", [user, premium, end])).rows[0].id;
}

test("migration removes public access to privileged RPCs and account tables", async () => {
  for (const role of ["anon", "authenticated"]) {
    for (const name of ["exchange_desktop_login(text,uuid,uuid,text)", "authorize_desktop_session(text,uuid,boolean,uuid)", "activate_paid_order(text,text,integer,jsonb)", "match_order_by_memo(text,integer)"]) {
      assert.equal((await db.query("select has_function_privilege($1,$2,'execute') as ok", [role, name])).rows[0].ok, false);
    }
    assert.equal((await db.query("select has_table_privilege($1,'desktop_sessions','select') as ok", [role])).rows[0].ok, false);
  }
});

test("gateway configuration is private, disabled by default, and backend cannot alter it", async () => {
  const config = (await db.query("select * from desktop_server_config")).rows[0];
  assert.equal(config.enabled, false);
  assert.equal(config.gateway_key_hash, null);
  for (const role of ["anon", "authenticated"]) {
    assert.equal((await db.query("select has_table_privilege($1,'desktop_server_config','select') as ok", [role])).rows[0].ok, false);
  }
  assert.equal((await db.query("select has_table_privilege('service_role','desktop_server_config','select') as ok")).rows[0].ok, true);
  assert.equal((await db.query("select has_table_privilege('service_role','desktop_server_config','update') as ok")).rows[0].ok, false);
  await assert.rejects(db.query("update desktop_server_config set enabled=true"), /check constraint/);
});

test("only the approved device can exchange once; pending does not create a session", async () => {
  const deviceHash = "b".repeat(64);
  await db.query("insert into desktop_login_requests(device_hash,user_code,device_id,device_name) values ($1,'ABCD-EFGH',$2,'Windows')", [deviceHash, device]);
  async function exchange(deviceId = device) {
    return (await db.query("select exchange_desktop_login($1,$2,$3,$4) as result", [deviceHash, deviceId, randomUUID(), "c".repeat(64)])).rows[0].result;
  }
  assert.equal((await exchange()).error, "authorization_pending");
  await db.query("update desktop_login_requests set state='approved',user_id=$1", [user]);
  assert.equal((await exchange(randomUUID())).error, "expired_token");
  const result = await exchange();
  assert.equal(result.user_id, user);
  assert.ok(result.expires > Date.now() / 1000);
  assert.equal((await exchange()).error, "access_denied");
});

test("expired or denied device approval cannot be exchanged", async () => {
  await db.query("insert into desktop_login_requests(device_hash,user_code,device_id,device_name,state,expires_at) values ($1,'ABCD-EFGH',$2,'Windows','denied',now()-interval '1 second')", [hash, device]);
  const result = (await db.query("select exchange_desktop_login($1,$2,$3,$4) as result", [hash, device, randomUUID(), hash])).rows[0].result;
  assert.equal(result.error, "expired_token");
});

test("an admin subscription immediately upgrades the same account session; revoke falls back to Free", async () => {
  assert.equal((await access()).plan.code, "FREE");
  const id = await grant(null);
  assert.equal((await access()).plan.code, "PREMIUM_MONTHLY");
  await db.query("update subscriptions set revoked_at=now() where id=$1", [id]);
  assert.equal((await access()).plan.code, "FREE");
});

test("a revoked later subscription cannot mask an active unlimited grant", async () => {
  await grant(null);
  const id = await grant("2099-01-01T00:00:00Z");
  await db.query("update subscriptions set revoked_at=now() where id=$1", [id]);
  assert.equal((await access()).plan.code, "PREMIUM_MONTHLY");
});

test("expiry and future activation do not authorize Premium", async () => {
  await grant("2000-01-01T00:00:00Z");
  const future = await grant(null);
  await db.query("update subscriptions set activated_at=now()+interval '1 day' where id=$1", [future]);
  assert.equal((await access()).plan.code, "FREE");
});

test("Free quota is atomic at account level across sessions and idempotent per receipt", async () => {
  const secondHash = "b".repeat(64);
  await db.query("insert into desktop_sessions(id,user_id,device_id,token_hash) values ($1,$2,$3,$4)", [randomUUID(), user, device, secondHash]);
  const requestId = randomUUID();
  assert.equal((await access({ consume: true, requestId })).quota.used, 1);
  assert.equal((await access({ consume: true, requestId })).quota.used, 1);
  for (let n = 1; n < 50; n++) {
    assert.equal((await access({ tokenHash: n % 2 ? secondHash : hash, consume: true, requestId: randomUUID() })).quota.used, n + 1);
  }
  assert.equal((await access({ consume: true, requestId: randomUUID() })).error, "quota_exceeded");
  await grant(null);
  assert.equal((await access({ consume: true, requestId: randomUUID() })).quota.used, 51);
});

test("device mismatch, revoked session and banned account all fail closed", async () => {
  assert.equal((await access({ deviceId: randomUUID() })).error, "invalid_session");
  await db.query("update desktop_sessions set revoked_at=now() where id=$1", [session]);
  assert.equal((await access()).error, "invalid_session");
  await db.query("update desktop_sessions set revoked_at=null where id=$1", [session]);
  await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [user]);
  assert.equal((await access()).error, "invalid_session");
});

test("users cannot promote themselves or directly create paid subscriptions", async () => {
  assert.equal((await db.query("select has_column_privilege('authenticated','profiles','role','update') as ok")).rows[0].ok, false);
  assert.equal((await db.query("select has_table_privilege('authenticated','subscriptions','insert') as ok")).rows[0].ok, false);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
  await db.query("insert into profiles(id,email,full_name) values ($1,'test@example.test','Test')", [user]);
  await assert.rejects(db.query("update profiles set role='admin' where id=$1", [user]), /permission denied/);
  await db.exec("reset role");
});
