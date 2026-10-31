import { Router } from "express";

import {
  register,
  login,
  getMe,
  updateMe,
  resendConfirmation,
  confirmEmail,
  googleAuthUrl,
  oauthCallback,
} from "../controllers/auth.controller.js";

import { requireAuth } from "../middlewares/auth.middleware.js";
import {
  loginLimiter,
  registerLimiter,
  resendLimiter,
  confirmLimiter,
  oauthStartLimiter,
  oauthCallbackLimiter,
  updateProfileLimiter,
} from "../middlewares/rateLimit.middleware.js";

const router = Router();

router.post("/register", registerLimiter, register);
router.post("/login", loginLimiter, login);
router.post("/oauth/google", oauthStartLimiter, googleAuthUrl);
router.post("/oauth/callback", oauthCallbackLimiter, oauthCallback);
router.post("/resend", resendLimiter, resendConfirmation);
router.post("/confirm", confirmLimiter, confirmEmail);
router.get("/me", requireAuth, getMe);
router.patch("/me", requireAuth, updateProfileLimiter, updateMe);

export default router;
