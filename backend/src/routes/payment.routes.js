import { Router } from "express";

import {
  createOrder,
  getOrderStatus,
  sepayWebhook,
} from "../controllers/payment.controller.js";

import { requireAuth } from "../middlewares/auth.middleware.js";
import {
  createOrderLimiter,
  orderStatusLimiter,
} from "../middlewares/rateLimit.middleware.js";

const router = Router();

// Webhook do dịch vụ bên ngoài gọi: không có access token của người dùng, xác
// thực bằng API key trong controller. Không rate limit theo IP vì mọi request
// đều đến từ cùng một IP của nhà cung cấp.
router.post("/webhook/sepay", sepayWebhook);

router.post("/orders", requireAuth, createOrderLimiter, createOrder);
router.get(
  "/orders/:orderCode",
  requireAuth,
  orderStatusLimiter,
  getOrderStatus,
);

export default router;
