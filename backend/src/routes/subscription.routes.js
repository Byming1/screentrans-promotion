import { Router } from "express";

import {
  getSubscriptionPlans,
  getMySubscription,
} from "../controllers/subscription.controller.js";

import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/plans", getSubscriptionPlans);

router.get("/my", requireAuth, getMySubscription);

export default router;
