import { Router } from "express";

import {
  getAdminStats,
  getAdminUsers,
  getUserSubscriptions,
  updateSubscriptionKey,
} from "../controllers/admin.controller.js";

import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireAdmin } from "../middlewares/admin.middleware.js";

const router = Router();

router.get("/stats", requireAuth, requireAdmin, getAdminStats);
router.get("/users", requireAuth, requireAdmin, getAdminUsers);
router.get(
  "/users/:userId/subscriptions",
  requireAuth,
  requireAdmin,
  getUserSubscriptions,
);
router.patch(
  "/subscriptions/:subscriptionId",
  requireAuth,
  requireAdmin,
  updateSubscriptionKey,
);

export default router;
