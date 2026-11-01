import { Router } from "express";
import rateLimit from "express-rate-limit";
import { supabaseAdmin } from "../config/supabase.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { createDesktopController } from "../controllers/desktop.controller.js";

const controller = createDesktopController({
  db: supabaseAdmin, enabled: process.env.DESKTOP_ENABLED,
  frontendUrl: process.env.FRONTEND_URL, gatewaySecret: process.env.DESKTOP_GATEWAY_SECRET,
});
const router = Router();
const limiter = (limit, windowMs = 60000) => rateLimit({
  windowMs, limit, standardHeaders: true, legacyHeaders: false,
  message: { error: "slow_down", message: "Quá nhiều yêu cầu. Vui lòng chờ trước khi thử lại." },
});
router.use(controller.available);
router.post("/device", limiter(12), controller.start);
router.post("/token", limiter(120), controller.poll);
router.get("/request", limiter(30), requireAuth, controller.request);
router.post("/approve", limiter(15), requireAuth, controller.approve);
router.get("/session", limiter(60), controller.session);
router.post("/logout", limiter(30), controller.logout);
// A private shared credential is mandatory; its hash can be held in server-only DB config.
router.post("/authorize", controller.authorize);
export default router;
