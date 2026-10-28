import rateLimit from "express-rate-limit";

const message = {
  message: "Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.",
};

const base = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message,
};

// Chống brute-force mật khẩu: chỉ tính các lần đăng nhập thất bại để người
// dùng hợp lệ không bị khoá khi đăng nhập lại nhiều lần.
export const loginLimiter = rateLimit({
  ...base,
  limit: 10,
  skipSuccessfulRequests: true,
});

// Chống spam tạo tài khoản (mỗi lần đều kích hoạt một email từ Supabase).
export const registerLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 5,
});

// Gửi lại email xác thực: siết chặt hơn vì Supabase cũng có quota riêng.
export const resendLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 3,
});
