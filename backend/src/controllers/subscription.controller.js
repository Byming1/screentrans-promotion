import { supabase } from "../config/supabase.js";
import { bestSubscription, subscriptionStatus } from "../utils/subscriptionAccess.js";

export const getSubscriptionPlans = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select(
        "id, code, name, tier, price_vnd, duration_unit, duration_value, daily_scan_limit, features",
      )
      .eq("is_active", true)
      .order("price_vnd", { ascending: true });

    if (error) {
      return res.status(500).json({
        message: error.message,
      });
    }

    return res.status(200).json({
      plans: data,
    });
  } catch (error) {
    console.error("Get plans error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

export const getMySubscription = async (req, res) => {
  try {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await req.supabase
      .from("subscriptions")
      .select(
        `
        id,
        activated_at,
        expires_at,
        revoked_at,
        subscription_plans (
          code,
          name,
          tier,
          price_vnd,
          daily_scan_limit,
          features
        )
      `,
      )
      .eq("user_id", req.user.id)
      .order("id", { ascending: true })
      .range(offset, offset + 999);

      if (error) return res.status(500).json({ message: "Failed to fetch subscription" });
      rows.push(...data);
      if (data.length < 1000) break;
    }
    const data = bestSubscription(rows);

    if (!data) {
      return res.status(200).json({
        status: "free",
        subscription: null,
      });
    }

    const status = subscriptionStatus(data);

    return res.status(200).json({
      status,
      subscription: data,
    });
  } catch (error) {
    console.error("Get subscription error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
