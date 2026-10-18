import { supabase } from "../config/supabase.js";

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
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        message: "Failed to fetch subscription",
      });
    }

    if (!data) {
      return res.status(200).json({
        status: "free",
        subscription: null,
      });
    }

    const now = new Date();

    const status = data.revoked_at
      ? "revoked"
      : now >= new Date(data.expires_at)
        ? "expired"
        : now < new Date(data.activated_at)
          ? "pending"
          : "active";

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
