import { supabaseAdmin } from "../config/supabase.js";

// Chạy sau requireAuth. Quyền admin được đọc từ profiles.role bằng client bỏ
// qua RLS: không tin role do client gửi lên, và cũng không đọc qua
// req.supabase vì RLS có thể che chính row đó.
export const requireAdmin = async (req, res, next) => {
  try {
    if (!supabaseAdmin) {
      console.error("Admin API called without SUPABASE_SECRET_KEY configured");
      return res.status(503).json({
        code: "admin_not_configured",
        message:
          "Chức năng quản trị chưa được cấu hình trên máy chủ (thiếu SUPABASE_SECRET_KEY).",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", req.user.id)
      .maybeSingle();

    if (error) {
      console.error("Admin role lookup error:", error.message);
      return res.status(500).json({
        message: "Không kiểm tra được quyền truy cập.",
      });
    }

    if (data?.role !== "admin") {
      // Dùng 403 thay vì 404: người gọi đã đăng nhập hợp lệ, chỉ là không đủ quyền.
      return res.status(403).json({
        code: "forbidden",
        message: "Bạn không có quyền truy cập trang quản trị.",
      });
    }

    next();
  } catch (error) {
    console.error("Admin middleware error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
