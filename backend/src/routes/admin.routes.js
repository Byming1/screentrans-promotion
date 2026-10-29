import { Router } from "express";

import { getAdminStats } from "../controllers/admin.controller.js";

import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireAdmin } from "../middlewares/admin.middleware.js";

const router = Router();

router.get("/stats", requireAuth, requireAdmin, getAdminStats);

export default router;
