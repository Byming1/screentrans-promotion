import { supabase, createUserClient } from "../config/supabase.js";

export const requireAuth = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Missing access token",
      });
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        message: "Missing access token",
      });
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({
        message: "Invalid or expired token",
      });
    }

    req.user = data.user;

    // Giữ lại token thô: các endpoint gọi thẳng GoTrue (đổi email / họ tên)
    // cần nó làm Bearer, không dùng được qua client PostgREST bên dưới.
    req.accessToken = token;

    // Tạo client riêng cho request của người dùng
    req.supabase = createUserClient(token);

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      message: "Authentication service error",
    });
  }
};
