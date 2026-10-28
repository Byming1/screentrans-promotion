import { Router } from "express";

import {
  register,
  login,
  getMe,
  resendConfirmation,
  confirmEmail,
} from "../controllers/auth.controller.js";

import { requireAuth } from "../middlewares/auth.middleware.js";
import {
  loginLimiter,
  registerLimiter,
  resendLimiter,
  confirmLimiter,
} from "../middlewares/rateLimit.middleware.js";

const router = Router();

router.post("/register", registerLimiter, register);
router.post("/login", loginLimiter, login);
router.post("/resend", resendLimiter, resendConfirmation);
router.post("/confirm", confirmLimiter, confirmEmail);
router.get("/me", requireAuth, getMe);

export default router;
