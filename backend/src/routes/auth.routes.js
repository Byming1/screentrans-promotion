import { Router } from "express";

import {
  register,
  login,
  getMe,
  resendConfirmation,
} from "../controllers/auth.controller.js";

import { requireAuth } from "../middlewares/auth.middleware.js";
import {
  loginLimiter,
  registerLimiter,
  resendLimiter,
} from "../middlewares/rateLimit.middleware.js";

const router = Router();

router.post("/register", registerLimiter, register);
router.post("/login", loginLimiter, login);
router.post("/resend", resendLimiter, resendConfirmation);
router.get("/me", requireAuth, getMe);

export default router;
