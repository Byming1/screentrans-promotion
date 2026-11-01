import crypto from "node:crypto";

import { supabaseAdmin } from "../config/supabase.js";

// Gói trả phí được nhận ra bằng subscription_plans.code để số liệu không phụ
// thuộc vào tên gói (tên có thể sửa trong Dashboard).
const MONTHLY_CODE = "PREMIUM_MONTHLY";
const YEARLY_CODE = "PREMIUM_YEARLY";

// Mỗi code gói trả phí tương ứng một nhóm trong giao diện quản trị. Gói nào
// không nằm trong map này (ví dụ FREE) thì không được tính là trả phí.
const PAID_PLAN_KEY = {
  [MONTHLY_CODE]: "monthly",
  [YEARLY_CODE]: "yearly",
};

const USERS_PER_PAGE = 1000;

// Lấy toàn bộ tài khoản từ auth.users thay vì bảng profiles: profiles chỉ được
// tạo khi người dùng đăng nhập lần đầu, nên đọc profiles sẽ bỏ sót tài khoản đã
// đăng ký mà chưa đăng nhập.
//
// Không dùng pagination.total của SDK: giá trị đó chỉ được điền khi response có
// header `link` (tức là có nhiều trang), còn một trang thì luôn trả 0 — nên số
// lượng phải tự đếm từ các trang đã tải.
const listAuthUsers = async () => {
  const all = [];

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: USERS_PER_PAGE,
    });

    if (error) throw error;

    const users = data?.users ?? [];
    all.push(...users);

    if (users.length < USERS_PER_PAGE) break;
  }

  return all;
};

const isConfirmed = (user) => Boolean(user.email_confirmed_at || user.confirmed_at);

// "Còn hạn" dùng đúng định nghĩa của GET /subscriptions/my: chưa bị thu hồi, đã
// tới ngày kích hoạt và chưa tới ngày hết hạn. expires_at null được coi là
// không hết hạn (gói unlimited).
const isActive = (sub, now) => {
  if (sub.revoked_at) return false;
  if (sub.activated_at && now < new Date(sub.activated_at)) return false;
  if (!sub.expires_at) return true;
  return now < new Date(sub.expires_at);
};

const fetchSubscriptions = async () => {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select(
      `
      user_id,
      activated_at,
      expires_at,
      revoked_at,
      subscription_plans (
        code,
        name,
        price_vnd
      )
    `,
    )
    .is("revoked_at", null);

  if (error) throw new Error(`subscriptions: ${error.message}`);
  return data ?? [];
};

const fetchProfiles = async () => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, role");

  if (error) throw new Error(`profiles: ${error.message}`);
  return data ?? [];
};

// Chỉ đơn đã thu được tiền mới được cộng vào doanh thu.
const fetchPaidPayments = async () => {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("user_id, amount_vnd, paid_at, plan_id, subscription_plans (code)")
    .eq("status", "paid");

  if (error) throw new Error(`payments: ${error.message}`);
  return data ?? [];
};

// GET /api/admin/stats
export const getAdminStats = async (req, res) => {
  try {
    const [authUsers, subscriptions, payments] = await Promise.all([
      listAuthUsers(),
      fetchSubscriptions(),
      fetchPaidPayments(),
    ]);

    const now = new Date();

    // Đếm theo người, không theo số dòng: một người có thể gia hạn nhiều lần
    // và có nhiều subscription cùng còn hạn.
    const monthly = new Set();
    const yearly = new Set();
    const anyPremium = new Set();

    for (const sub of subscriptions) {
      if (!isActive(sub, now)) continue;

      const key = PAID_PLAN_KEY[sub.subscription_plans?.code];
      if (!key) continue;

      if (key === "monthly") monthly.add(sub.user_id);
      else yearly.add(sub.user_id);

      anyPremium.add(sub.user_id);
    }

    // Doanh thu tính từ payments (tiền thực nhận), không từ giá gói đang còn
    // hạn: giá gói có thể đã bị sửa sau khi người dùng trả tiền.
    let revenueTotal = 0;
    let revenueMonthly = 0;
    let revenueYearly = 0;

    for (const payment of payments) {
      const amount = payment.amount_vnd ?? 0;
      revenueTotal += amount;

      const key = PAID_PLAN_KEY[payment.subscription_plans?.code];
      if (key === "monthly") revenueMonthly += amount;
      else if (key === "yearly") revenueYearly += amount;
    }

    return res.status(200).json({
      generatedAt: now.toISOString(),
      users: {
        total: authUsers.length,
        confirmed: authUsers.filter(isConfirmed).length,
      },
      subscriptions: {
        monthly: monthly.size,
        yearly: yearly.size,
        premiumTotal: anyPremium.size,
      },
      revenue: {
        total: revenueTotal,
        monthly: revenueMonthly,
        yearly: revenueYearly,
        orders: payments.length,
      },
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return res.status(500).json({
      message: "Không tải được số liệu thống kê.",
    });
  }
};

// GET /api/admin/users
//
// Một endpoint duy nhất trả cả danh sách người dùng và gói đang dùng của họ:
// trang quản trị cần ghép ba nguồn (auth.users, subscriptions, payments) để
// hiện một dòng, nên ghép ở server rẻ hơn là bắt client gọi ba lần rồi join.
export const getAdminUsers = async (req, res) => {
  try {
    const [authUsers, subscriptions, profiles, payments] = await Promise.all([
      listAuthUsers(),
      fetchSubscriptions(),
      fetchProfiles(),
      fetchPaidPayments(),
    ]);

    const now = new Date();

    const profileById = new Map(profiles.map((p) => [p.id, p]));

    // Gói hiện tại của mỗi người: trong các gói trả phí còn hạn, lấy gói hết
    // hạn muộn nhất. Người vừa mua gói năm khi còn gói tháng thì phải được xếp
    // vào nhóm gói năm.
    const currentByUser = new Map();
    // Người từng có gói trả phí nhưng hiện không còn hạn → "đã hết hạn", khác
    // với người chưa từng trả tiền.
    const everPaidPlan = new Set();

    for (const sub of subscriptions) {
      const key = PAID_PLAN_KEY[sub.subscription_plans?.code];
      if (!key) continue;

      everPaidPlan.add(sub.user_id);

      if (!isActive(sub, now)) continue;

      const previous = currentByUser.get(sub.user_id);
      // expires_at null (unlimited) luôn thắng: không có mốc nào muộn hơn.
      const beats =
        !previous ||
        !sub.expires_at ||
        (previous.expires_at &&
          new Date(sub.expires_at) > new Date(previous.expires_at));

      if (beats) {
        currentByUser.set(sub.user_id, {
          key,
          planName: sub.subscription_plans?.name ?? null,
          activated_at: sub.activated_at,
          expires_at: sub.expires_at,
        });
      }
    }

    const spendByUser = new Map();
    for (const payment of payments) {
      const entry = spendByUser.get(payment.user_id) ?? {
        total: 0,
        orders: 0,
        lastPaidAt: null,
      };

      entry.total += payment.amount_vnd ?? 0;
      entry.orders += 1;
      if (
        payment.paid_at &&
        (!entry.lastPaidAt || new Date(payment.paid_at) > new Date(entry.lastPaidAt))
      ) {
        entry.lastPaidAt = payment.paid_at;
      }

      spendByUser.set(payment.user_id, entry);
    }

    const users = authUsers.map((user) => {
      const profile = profileById.get(user.id);
      const current = currentByUser.get(user.id);
      const spend = spendByUser.get(user.id);

      return {
        id: user.id,
        email: user.email ?? profile?.email ?? null,
        // full_name chỉ có trong profiles sau lần đăng nhập đầu; trước đó lấy
        // tạm từ user_metadata do form đăng ký ghi vào.
        fullName: profile?.full_name || user.user_metadata?.full_name || null,
        role: profile?.role ?? "user",
        provider: user.app_metadata?.provider ?? null,
        createdAt: user.created_at ?? null,
        confirmed: isConfirmed(user),
        lastSignInAt: user.last_sign_in_at ?? null,
        plan: current?.key ?? (everPaidPlan.has(user.id) ? "expired" : "free"),
        planName: current?.planName ?? null,
        activatedAt: current?.activated_at ?? null,
        expiresAt: current?.expires_at ?? null,
        paidTotalVnd: spend?.total ?? 0,
        paidOrders: spend?.orders ?? 0,
        lastPaidAt: spend?.lastPaidAt ?? null,
      };
    });

    // Mới nhất lên đầu: admin quan tâm người vừa đăng ký.
    users.sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0));

    return res.status(200).json({
      generatedAt: now.toISOString(),
      users,
    });
  } catch (error) {
    console.error("Admin users error:", error);
    return res.status(500).json({
      message: "Không tải được danh sách người dùng.",
    });
  }
};

// Trạng thái của một subscription, dùng chung cho mọi nơi hiển thị.
const subscriptionStatus = (sub, now) => {
  if (sub.revoked_at) return "revoked";
  if (sub.activated_at && now < new Date(sub.activated_at)) return "pending";
  if (sub.expires_at && now >= new Date(sub.expires_at)) return "expired";
  return "active";
};

// GET /api/admin/users/:userId/subscriptions
//
// Toàn bộ gói của một người (kể cả đã hết hạn / thu hồi) để admin thấy lịch sử
// chứ không chỉ gói đang chạy.
export const getUserSubscriptions = async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: authUser, error: authError } =
      await supabaseAdmin.auth.admin.getUserById(userId);

    if (authError || !authUser?.user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng." });
    }

    const [{ data: subs, error }, { data: profile }] = await Promise.all([
      supabaseAdmin
        .from("subscriptions")
        .select(
          `
          id,
          plan_id,
          plan_name,
          activation_key_hash,
          key_last4,
          activated_at,
          expires_at,
          revoked_at,
          created_at,
          subscription_plans (
            code,
            name,
            price_vnd
          )
        `,
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("profiles")
        .select("full_name, email, role")
        .eq("id", userId)
        .maybeSingle(),
    ]);

    if (error) {
      console.error("Admin user subscriptions error:", error.message);
      return res.status(500).json({ message: "Không tải được gói của người dùng." });
    }

    const now = new Date();

    return res.status(200).json({
      user: {
        id: authUser.user.id,
        email: authUser.user.email ?? profile?.email ?? null,
        fullName:
          profile?.full_name || authUser.user.user_metadata?.full_name || null,
        role: profile?.role ?? "user",
      },
      subscriptions: (subs ?? []).map((sub) => ({
        id: sub.id,
        planName: sub.subscription_plans?.name ?? sub.plan_name ?? null,
        planCode: sub.subscription_plans?.code ?? null,
        priceVnd: sub.subscription_plans?.price_vnd ?? null,
        // Cột tên là *_hash nhưng thực tế lưu key dạng thô (app desktop đọc
        // thẳng), nên trả nguyên văn cho admin xem và sửa được.
        activationKey: sub.activation_key_hash ?? null,
        keyLast4: sub.key_last4 ?? null,
        activatedAt: sub.activated_at ?? null,
        expiresAt: sub.expires_at ?? null,
        revokedAt: sub.revoked_at ?? null,
        createdAt: sub.created_at ?? null,
        status: subscriptionStatus(sub, now),
      })),
    });
  } catch (error) {
    console.error("Admin user subscriptions error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// PATCH /api/admin/subscriptions/:subscriptionId
//
// Chỉ cho sửa activation key. Ngày kích hoạt / hết hạn cố tình không cho sửa ở
// đây: chúng do luồng thanh toán tính ra, sửa tay sẽ lệch với bảng payments.
export const updateSubscriptionKey = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { activationKey } = req.body ?? {};

    if (typeof activationKey !== "string") {
      return res.status(400).json({ message: "Thiếu activationKey." });
    }

    // Người dùng hay dán key kèm xuống dòng/khoảng trắng từ email — vài dòng
    // trong database đang dính "\r\n" ở cuối vì vậy. Cắt sạch trước khi ghi.
    const key = activationKey.trim();

    if (key.length < 8 || key.length > 200) {
      return res.status(400).json({
        message: "Key phải dài từ 8 đến 200 ký tự.",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("subscriptions")
      .update({
        activation_key_hash: key,
        // key_last4 là thứ app hiển thị cho người dùng, phải đi cùng key mới.
        key_last4: key.slice(-4),
      })
      .eq("id", subscriptionId)
      .select("id, activation_key_hash, key_last4")
      .maybeSingle();

    if (error) {
      console.error("Update subscription key error:", error.message);
      return res.status(500).json({ message: "Không cập nhật được key." });
    }

    if (!data) {
      return res.status(404).json({ message: "Không tìm thấy gói này." });
    }

    return res.status(200).json({
      subscription: {
        id: data.id,
        activationKey: data.activation_key_hash,
        keyLast4: data.key_last4,
      },
    });
  } catch (error) {
    console.error("Update subscription key error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Key kích hoạt cho gói cấp tay. Cùng dạng với key do luồng thanh toán sinh ra
// (tiền tố ST- + chuỗi ngẫu nhiên) để app desktop không phải phân biệt.
const generateActivationKey = () =>
  `ST-${crypto.randomBytes(24).toString("base64url")}`;

// POST /api/admin/users/:userId/subscriptions
//
// Cấp gói tay cho một người (tặng, đền bù, trả tiền ngoài luồng tự động...).
// Không ghi gì vào bảng payments: ở đây không có tiền thật chạy qua, ghi vào
// đó sẽ thổi phồng doanh thu trên chính trang này.
export const grantSubscription = async (req, res) => {
  try {
    const { userId } = req.params;
    const { planCode } = req.body ?? {};

    if (!PAID_PLAN_KEY[planCode]) {
      return res.status(400).json({
        message: "Chỉ cấp được gói tháng hoặc gói năm.",
      });
    }

    const { data: authUser, error: authError } =
      await supabaseAdmin.auth.admin.getUserById(userId);

    if (authError || !authUser?.user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng." });
    }

    const { data: plan, error: planError } = await supabaseAdmin
      .from("subscription_plans")
      .select("id, code, name, duration_unit, duration_value")
      .eq("code", planCode)
      .maybeSingle();

    if (planError || !plan) {
      return res.status(404).json({ message: "Không tìm thấy gói này." });
    }

    // Gói còn hạn thì nối tiếp vào cuối, giống activate_paid_order: người đang
    // còn 20 ngày mà được tặng thêm 1 tháng thì phải thành 50 ngày, không phải
    // bị cắt còn 30.
    const { data: actives, error: activeError } = await supabaseAdmin
      .from("subscriptions")
      .select("expires_at")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .not("expires_at", "is", null)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1);

    if (activeError) {
      console.error("Grant subscription lookup error:", activeError.message);
      return res.status(500).json({ message: "Không kiểm tra được gói hiện có." });
    }

    const now = new Date();
    const stackFrom = actives?.[0]?.expires_at
      ? new Date(actives[0].expires_at)
      : now;

    const expiresAt = new Date(stackFrom);
    if (plan.duration_unit === "day") {
      expiresAt.setDate(expiresAt.getDate() + plan.duration_value);
    } else if (plan.duration_unit === "month") {
      expiresAt.setMonth(expiresAt.getMonth() + plan.duration_value);
    } else if (plan.duration_unit === "year") {
      expiresAt.setFullYear(expiresAt.getFullYear() + plan.duration_value);
    }

    const key = generateActivationKey();

    const { data: created, error } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        user_id: userId,
        plan_id: plan.id,
        // Cột này có DEFAULT 'monthly': không truyền thì gói năm bị ghi nhầm
        // thành tháng.
        plan_name: PAID_PLAN_KEY[planCode],
        activation_key_hash: key,
        key_last4: key.slice(-4),
        // Quyền lợi có hiệu lực ngay, chỉ ngày hết hạn mới cộng dồn.
        activated_at: now.toISOString(),
        expires_at:
          plan.duration_unit === "unlimited" ? null : expiresAt.toISOString(),
      })
      .select("id, activated_at, expires_at")
      .single();

    if (error) {
      console.error("Grant subscription error:", error.message);
      return res.status(500).json({ message: "Không cấp được gói." });
    }

    return res.status(201).json({
      subscription: {
        id: created.id,
        planName: plan.name,
        planCode: plan.code,
        activationKey: key,
        activatedAt: created.activated_at,
        expiresAt: created.expires_at,
      },
    });
  } catch (error) {
    console.error("Grant subscription error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
