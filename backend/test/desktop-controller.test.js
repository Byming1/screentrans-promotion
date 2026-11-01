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
