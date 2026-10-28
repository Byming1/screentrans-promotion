import { supabase } from "../config/supabase.js";

// Link trong email xác thực phải trỏ về frontend, nếu không Supabase sẽ dùng
// Site URL mặc định trong Dashboard. URL này cũng phải nằm trong danh sách
// Redirect URLs của project.
const emailRedirectTo = `${(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "")}/login`;

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// POST /api/auth/register
export const register = async (req, res) => {
  try {
    const { email, password, fullName } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof fullName !== "string" ||
      !email.trim() ||
      !fullName.trim() ||
      !isEmail(email) ||
      password.length < 8
    ) {
      return res.status(400).json({
        message: "Invalid registration information",
      });
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
        },
        emailRedirectTo,
      },
    });

    if (error) {
      return res
        .status(error.status >= 400 && error.status < 500 ? error.status : 500)
        .json({
          message: error.message,
        });
    }

    return res.status(201).json({
      message: "Registration request accepted",
      user: data.user
        ? {
            id: data.user.id,
            email: data.user.email,
          }
        : null,
      emailConfirmationRequired: !data.session,
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      // Phân biệt "chưa xác thực email" với "sai thông tin" để frontend gợi ý
      // người dùng kiểm tra hộp thư / gửi lại email xác thực.
      if (error.code === "email_not_confirmed") {
        return res.status(403).json({
          code: "email_not_confirmed",
          message:
            "Email chưa được xác thực. Vui lòng kiểm tra hộp thư để xác nhận tài khoản.",
        });
      }

      return res.status(401).json({
        code: "invalid_credentials",
        message: "Email hoặc mật khẩu không chính xác.",
      });
    }

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// POST /api/auth/resend
export const resendConfirmation = async (req, res) => {
  try {
    const { email } = req.body ?? {};

    if (typeof email !== "string" || !email.trim() || !isEmail(email)) {
      return res.status(400).json({
        message: "Email không hợp lệ",
      });
    }

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: {
        emailRedirectTo,
      },
    });

    // Không tiết lộ email nào đã đăng ký / đã xác thực: chỉ báo lỗi khi bị
    // giới hạn tần suất, còn lại luôn trả về thành công.
    if (error) {
      if (error.status === 429) {
        return res.status(429).json({
          message: "Bạn vừa yêu cầu gửi lại. Vui lòng thử lại sau ít phút.",
        });
      }

      console.warn("Resend confirmation error:", error.message);
    }

    return res.status(200).json({
      message:
        "Nếu email tồn tại và chưa xác thực, chúng tôi đã gửi lại liên kết xác thực.",
    });
  } catch (error) {
    console.error("Resend confirmation error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// GET /api/auth/me
export const getMe = async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from("profiles")
      .select("id, full_name, created_at")
      .eq("id", req.user.id)
      .single();

    if (error) {
      return res.status(500).json({
        message: "Could not load profile",
      });
    }

    return res.status(200).json({
      user: {
        id: req.user.id,
        email: req.user.email,
      },
      profile: data,
    });
  } catch (error) {
    console.error("GetMe error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
