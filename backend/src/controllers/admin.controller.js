import { supabaseAdmin } from "../config/supabase.js";

// Gói trả phí được nhận ra bằng subscription_plans.code để số liệu không phụ
// thuộc vào tên gói (tên có thể sửa trong Dashboard).
const MONTHLY_CODE = "PREMIUM_MONTHLY";
const YEARLY_CODE = "PREMIUM_YEARLY";

const USERS_PER_PAGE = 1000;

// Đếm tài khoản từ auth.users thay vì bảng profiles: profiles chỉ được tạo khi
// người dùng đăng nhập lần đầu, nên đếm profiles sẽ bỏ sót tài khoản đã đăng
// ký mà chưa đăng nhập.
//
// Không dùng pagination.total của SDK: giá trị đó chỉ được điền khi response có
// header `link` (tức là có nhiều trang), còn một trang thì luôn trả 0.
const countAuthUsers = async () => {
  let total = 0;
  let confirmed = 0;

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: USERS_PER_PAGE,
    });

    if (error) throw error;

    const users = data?.users ?? [];
    total += users.length;
    confirmed += users.filter(
      (user) => user.email_confirmed_at || user.confirmed_at,
    ).length;

    if (users.length < USERS_PER_PAGE) break;
  }

  return { total, confirmed };
};

// GET /api/admin/stats
export const getAdminStats = async (req, res) => {
  try {
    const users = await countAuthUsers();

    const { data: subscriptions, error } = await supabaseAdmin
      .from("subscriptions")
      .select(
        `
        user_id,
        activated_at,
        expires_at,
        revoked_at,
        subscription_plans (
          code,
          name
        )
      `,
      )
      .is("revoked_at", null);

    if (error) {
      console.error("Admin stats subscriptions error:", error.message);
      return res.status(500).json({
        message: "Không tải được dữ liệu gói dịch vụ.",
      });
    }

    const now = new Date();

    // "Còn hạn" dùng đúng định nghĩa của GET /subscriptions/my: chưa bị thu
    // hồi, đã tới ngày kích hoạt và chưa tới ngày hết hạn. expires_at null
    // được coi là không hết hạn (gói unlimited).
    const isActive = (sub) => {
      if (sub.revoked_at) return false;
      if (sub.activated_at && now < new Date(sub.activated_at)) return false;
      if (!sub.expires_at) return true;
      return now < new Date(sub.expires_at);
    };

    // Đếm theo người, không theo số dòng: một người có thể gia hạn nhiều lần
    // và có nhiều subscription cùng còn hạn.
    const monthly = new Set();
    const yearly = new Set();
    const anyPremium = new Set();

    for (const sub of subscriptions ?? []) {
      if (!isActive(sub)) continue;

      const code = sub.subscription_plans?.code;
      if (code === MONTHLY_CODE) monthly.add(sub.user_id);
      else if (code === YEARLY_CODE) yearly.add(sub.user_id);
      else continue;

      anyPremium.add(sub.user_id);
    }

    return res.status(200).json({
      generatedAt: now.toISOString(),
      users: {
        total: users.total,
        confirmed: users.confirmed,
      },
      subscriptions: {
        monthly: monthly.size,
        yearly: yearly.size,
        premiumTotal: anyPremium.size,
      },
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
