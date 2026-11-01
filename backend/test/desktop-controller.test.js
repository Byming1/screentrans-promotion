import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createDesktopController } from "../src/controllers/desktop.controller.js";
const device = "20000000-0000-4000-8000-000000000001";
const token = "STA-" + "a".repeat(43);
const secret = "s".repeat(48);
function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }, set() {} };
}
function controller(db) { return createDesktopController({ db, enabled: true, frontendUrl: "https://screentrans-promotion.vercel.app", gatewaySecret: secret }); }
test("a user cannot invoke gateway authorization without the private gateway credential", async () => {
  let calls = 0;
  const handler = controller({ rpc() { calls++; } });
  const res = response();
  await handler.authorize({ get() { return ""; }, body: {} }, res);
  assert.equal(res.statusCode, 401); assert.equal(calls, 0);
});
test("backend hashes the app token and sends only a server-selected identity to SQL", async () => {
  let seen;
  const handler = controller({ async rpc(name, args) { seen = { name, args }; return { data: { client_id: "account:real" } }; } });
  const req = { body: { consume: false, user_id: "attacker", plan: "premium" },
    get(name) { return { Authorization: "Bearer " + token, "X-ScreenTrans-Device": device, "X-ScreenTrans-Gateway": secret }[name]; } };
  const res = response(); await handler.authorize(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(seen.args.p_token_hash, createHash("sha256").update(token).digest("hex"));
  assert.equal(seen.args.p_device_id, device);
  assert.equal("user_id" in seen.args, false);
  assert.equal("plan" in seen.args, false);
});
test("approval uses the authenticated user's UUID, never user_id from the body", async () => {
  let write;
  const query = { update(value) { write = value; return this; }, eq() { return this; }, gt() { return this; }, select() { return this; }, async maybeSingle() { return { data: { state: "approved" } }; } };
  const res = response();
  await controller({ from() { return query; } }).approve({ user: { id: "real-user" }, body: { user_code: "ABCD-EFGH", approve: true, user_id: "attacker" } }, res);
  assert.equal(res.statusCode, 200); assert.equal(write.user_id, "real-user");
});
test("a database outage is an explicit service error, not permission or unlimited access", async () => {
  const res = response();
  await controller({ async rpc() { return { error: { code: "42P01" } }; } }).session({
    get(name) { return { Authorization: "Bearer " + token, "X-ScreenTrans-Device": device }[name]; },
  }, res);
  assert.equal(res.statusCode, 503); assert.equal(res.body.code, "desktop_service_unavailable");
});

function databaseConfiguration(overrides = {}) {
  let reads = 0;
  const state = { data: { enabled: true, gateway_key_hash: createHash("sha256").update(secret).digest("hex"),
    frontend_url: "https://screentrans-promotion.vercel.app", ...overrides }, error: null };
  const query = { select() { return this; }, eq() { return this; }, async maybeSingle() { reads++; return state; } };
  const db = { from(table) { assert.equal(table, "desktop_server_config"); return query; },
    async rpc() { return { data: { plan: { code: "FREE" } } }; } };
  return { db, state, reads: () => reads };
}

test("database configuration enables the app without a plaintext gateway secret in Render", async () => {
  const config = databaseConfiguration();
  const handler = createDesktopController({ db: config.db });
  const req = {}, res = response(); let accepted = false;
  await handler.available(req, res, () => { accepted = true; });
  assert.equal(accepted, true); assert.equal(res.body, null);
  assert.equal(req.desktopConfiguration.frontendUrl, config.state.data.frontend_url);
});

test("explicit environment disable and partial environment configuration never fall back to database", async () => {
  for (const options of [{ enabled: false }, { enabled: "false" }, { enabled: true }]) {
    const config = databaseConfiguration(); const res = response();
    await createDesktopController({ db: config.db, ...options }).available({}, res, () => assert.fail("Must remain disabled"));
    assert.equal(res.statusCode, 503); assert.equal(config.reads(), 0);
  }
});

test("missing, disabled, malformed or non-HTTPS database configuration fails closed", async () => {
  for (const options of [{ enabled: false }, { gateway_key_hash: "bad" }, { frontend_url: "http://example.com" },
    { frontend_url: "https://name:password@example.com" }]) {
    const config = databaseConfiguration(options); const res = response();
    await createDesktopController({ db: config.db }).available({}, res, () => assert.fail("Invalid config accepted"));
    assert.equal(res.statusCode, 503);
  }
});

test("only server configuration is cached, with a bounded five-second lifetime", async () => {
  let time = 100; const config = databaseConfiguration();
  const handler = createDesktopController({ db: config.db, now: () => time });
  await handler.available({}, response(), () => {});
  await handler.available({}, response(), () => {});
  assert.equal(config.reads(), 1);
  time += 5001; config.state.data.enabled = false; const res = response();
  await handler.available({}, res, () => assert.fail("Disabled configuration accepted"));
  assert.equal(config.reads(), 2); assert.equal(res.statusCode, 503);
});

test("expired configuration is never reused after a database failure", async () => {
  let time = 100; const config = databaseConfiguration();
  const handler = createDesktopController({ db: config.db, now: () => time });
  await handler.available({}, response(), () => {});
  time += 5001; config.state.error = { code: "08006" }; const res = response();
  await handler.available({}, res, () => assert.fail("Stale configuration accepted"));
  assert.equal(res.statusCode, 503); assert.equal(res.body.code, "desktop_service_unavailable");
});

test("the stored gateway hash cannot itself be used as the gateway credential", async () => {
  const config = databaseConfiguration(); const res = response();
  await createDesktopController({ db: config.db }).authorize({ get(name) {
    return { Authorization: "Bearer " + token, "X-ScreenTrans-Device": device,
      "X-ScreenTrans-Gateway": config.state.data.gateway_key_hash }[name];
  }, body: {} }, res);
  assert.equal(res.statusCode, 401);
});

test("cached server configuration never delays a plan change", async () => {
  const config = databaseConfiguration(); let calls = 0;
  config.db.rpc = async () => ({ data: { plan: { code: ++calls === 1 ? "FREE" : "PREMIUM_MONTHLY" } } });
  const handler = createDesktopController({ db: config.db });
  const req = { get(name) { return { Authorization: "Bearer " + token, "X-ScreenTrans-Device": device,
    "X-ScreenTrans-Gateway": secret }[name]; }, body: {} };
  const first = response(), second = response();
  await handler.authorize(req, first); await handler.authorize(req, second);
  assert.equal(first.body.plan.code, "FREE"); assert.equal(second.body.plan.code, "PREMIUM_MONTHLY");
  assert.equal(calls, 2); assert.equal(config.reads(), 1);
});
