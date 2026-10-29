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

// Xác thực token từ email: chặn dò token nhưng vẫn đủ rộng để người dùng bấm
// lại liên kết vài lần (ví dụ refresh trang) mà không bị khoá.
export const confirmLimiter = rateLimit({
  ...base,
  limit: 20,
  skipSuccessfulRequests: true,
});

// Luồng OAuth: người dùng có thể bấm đăng nhập Google rồi đổi ý nhiều lần,
// nên để rộng hơn login. Mỗi lần chỉ tạo URL, chưa tốn gì ở phía Supabase.
export const oauthStartLimiter = rateLimit({
  ...base,
  limit: 30,
});

// Đổi authorization code lấy session: chặn dò code, nhưng không tính các lần
// thành công để người dùng đăng nhập lại nhiều lần không bị khoá.
export const oauthCallbackLimiter = rateLimit({
  ...base,
  limit: 20,
  skipSuccessfulRequests: true,
});

// Tạo đơn thanh toán: mỗi lần tạo một row trong database nên cần chặn spam,
// nhưng vẫn để người dùng đổi gói / thử lại vài lần.
export const createOrderLimiter = rateLimit({
  ...base,
  limit: 20,
});

// Trang thanh toán hỏi trạng thái mỗi 5 giây, tức ~180 lần trong 15 phút.
// Giới hạn cao hơn mức đó để người dùng ngồi chờ không bị khoá.
export const orderStatusLimiter = rateLimit({
  ...base,
  limit: 400,
});
