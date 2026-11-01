import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const userCode = /^[A-Z2-7]{4}-[A-Z2-7]{4}$/;
const sessionToken = /^STA-[A-Za-z0-9_-]{43}$/;
const messages = {
  invalid_session: "Phiên đăng nhập app hết hạn hoặc đã bị thu hồi. Vui lòng đăng nhập lại.",
  quota_exceeded: "Đã dùng hết lượt quét hôm nay. Xem gói sử dụng trên website.",
  plan_unavailable: "Chưa cấu hình gói sử dụng trên máy chủ.",
};

export function createDesktopController({ db, enabled, frontendUrl, gatewaySecret }) {
  function available(req, res, next) {
    res.set("Cache-Control", "no-store");
    if (!enabled || !db || !frontendUrl || !gatewaySecret || gatewaySecret.length < 32) return res.status(503).json({ code: "desktop_not_configured", message: "Đăng nhập app chưa được cấu hình trên máy chủ." });
    next();
  }
  function sessionHeaders(req) {
    const token = req.get("Authorization")?.replace(/^Bearer /, "");
    const device = req.get("X-ScreenTrans-Device");
    return sessionToken.test(token || "") && uuid.test(device || "") ? { token, device } : null;
  }
  async function readAccess(credentials, consume = false, requestId = null) {
    const { data, error } = await db.rpc("authorize_desktop_session", {
      p_token_hash: hash(credentials.token), p_device_id: credentials.device,
      p_consume: consume, p_request_id: requestId,
    });
    if (error || !data) throw new Error("desktop_authorization_unavailable", { cause: error });
    return data;
  }
  function accessResponse(res, data) {
    if (data.error) {
      const status = data.error === "invalid_session" ? 401 : data.error === "quota_exceeded" ? 429 : 403;
      return res.status(status).json({ code: data.error, message: messages[data.error] || "Không có quyền sử dụng app." });
    }
    return res.json(data);
  }
  const guarded = (fn) => async (req, res) => {
    try { return await fn(req, res); }
    catch (error) {
      console.error("Desktop API failure:", error.message, error.cause?.code || "unknown");
      return res.status(503).json({ code: "desktop_service_unavailable", message: "Không kiểm tra được quyền app. Vui lòng thử lại sau." });
    }
  };
  return {
    available,
    start: guarded(async (req, res) => {
      const { device_id: device, device_name: name = "ScreenTrans Windows" } = req.body || {};
      if (!uuid.test(device || "") || typeof name !== "string" || !name.trim() || name.length > 80) {
        return res.status(400).json({ message: "Thiết bị không hợp lệ." });
      }
      const secret = randomBytes(32).toString("base64url");
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      const chars = [...randomBytes(8)].map((n) => alphabet[n & 31]).join("");
      const code = chars.slice(0, 4) + "-" + chars.slice(4);
      const { error } = await db.from("desktop_login_requests").insert({
        device_hash: hash(secret), user_code: code, device_id: device, device_name: name.trim(),
      });
      if (error) throw new Error("desktop_start_failed", { cause: error });
      const uri = new URL("/app/connect", frontendUrl).href;
      return res.status(201).json({ device_code: secret, user_code: code,
        verification_uri: uri, verification_uri_complete: `${uri}?user_code=${code}`,
        expires_in: 600, interval: 5 });
    }),
    request: guarded(async (req, res) => {
      if (!userCode.test(req.query.user_code || "")) return res.status(400).json({ message: "Mã thiết bị không hợp lệ." });
      const { data, error } = await db.from("desktop_login_requests")
        .select("device_name, state, expires_at").eq("user_code", req.query.user_code)
        .gt("expires_at", new Date().toISOString()).eq("state", "pending").maybeSingle();
      if (error) throw new Error("desktop_request_failed");
      if (!data) return res.status(404).json({ message: "Mã thiết bị hết hạn hoặc đã sử dụng." });
      return res.json(data);
    }),
    approve: guarded(async (req, res) => {
      const { user_code: code, approve } = req.body || {};
      if (!userCode.test(code || "") || typeof approve !== "boolean") return res.status(400).json({ message: "Yêu cầu xác nhận không hợp lệ." });
      const { data, error } = await db.from("desktop_login_requests")
        .update({ state: approve ? "approved" : "denied", user_id: req.user.id })
        .eq("user_code", code).eq("state", "pending").gt("expires_at", new Date().toISOString())
        .select("state").maybeSingle();
      if (error) throw new Error("desktop_approve_failed");
      if (!data) return res.status(409).json({ message: "Mã thiết bị hết hạn hoặc đã xử lý." });
      return res.json({ status: data.state });
    }),
    poll: guarded(async (req, res) => {
      const { device_code: code, device_id: device } = req.body || {};
      if (!/^[A-Za-z0-9_-]{43}$/.test(code || "") || !uuid.test(device || "")) return res.status(400).json({ error: "invalid_request" });
      const token = "STA-" + randomBytes(32).toString("base64url");
      const { data, error } = await db.rpc("exchange_desktop_login", {
        p_device_hash: hash(code), p_device_id: device, p_session_id: randomUUID(), p_token_hash: hash(token),
      });
      if (error || !data) throw new Error("desktop_exchange_failed", { cause: error });
      if (data.error) return res.status(400).json({ error: data.error });
      const access = await readAccess({ token, device });
      if (access.error) return accessResponse(res, access);
      return res.json({ ...access, token, auth_mode: "account" });
    }),
    session: guarded(async (req, res) => {
      const credentials = sessionHeaders(req);
      if (!credentials) return res.status(401).json({ code: "invalid_session", message: messages.invalid_session });
      return accessResponse(res, await readAccess(credentials));
    }),
    logout: guarded(async (req, res) => {
      const credentials = sessionHeaders(req);
      if (!credentials) return res.status(401).json({ code: "invalid_session", message: messages.invalid_session });
      const { error } = await db.from("desktop_sessions").update({ revoked_at: new Date().toISOString() })
        .eq("token_hash", hash(credentials.token)).eq("device_id", credentials.device);
      if (error) throw new Error("desktop_logout_failed");
      return res.json({ status: "signed_out" });
    }),
    authorize: guarded(async (req, res) => {
      const provided = Buffer.from(req.get("X-ScreenTrans-Gateway") || "");
      const expected = Buffer.from(gatewaySecret || "");
      if (expected.length < 32 || provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
        return res.status(401).json({ message: "Gateway authentication required" });
      }
      const credentials = sessionHeaders(req);
      if (!credentials) return res.status(401).json({ code: "invalid_session", message: messages.invalid_session });
      const { consume = false, request_id: requestId = null } = req.body || {};
      if (typeof consume !== "boolean" || (consume && !uuid.test(requestId || ""))) return res.status(400).json({ code: "invalid_request" });
      return accessResponse(res, await readAccess(credentials, consume, requestId));
    }),
  };
}
