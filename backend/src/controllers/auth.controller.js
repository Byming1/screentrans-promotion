import { supabase, createUserClient } from "../config/supabase.js";
import { getEmailDomain, hasMailExchanger } from "../utils/emailDomain.js";

// Link trong email xác thực phải trỏ về frontend, nếu không Supabase sẽ dùng
// Site URL mặc định trong Dashboard. URL này cũng phải nằm trong danh sách
// Redirect URLs của project.
const emailRedirectTo = `${(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "")}/auth/confirm`;

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// Email được Supabase quản lý trong auth.users; bảng profiles giữ một bản sao
// để truy vấn cùng dữ liệu nghiệp vụ. Ghi lại mỗi lần đăng nhập để bản sao
// không lệch khi người dùng đổi email.
//
// Dùng upsert thay vì update: hiện chưa có trigger tạo profile khi đăng ký,
// nên row có thể chưa tồn tại. Không chặn đăng nhập nếu ghi thất bại.
const syncProfileEmail = async (accessToken, user) => {
  if (!user?.id || !user?.email) return;

  const profile = {
    id: user.id,
    email: user.email,
  };

  const fullName = user.user_metadata?.full_name;
  if (typeof fullName === "string" && fullName.trim()) {
    profile.full_name = fullName.trim();
  }

  try {
    const { error } = await createUserClient(accessToken)
      .from("profiles")
      .upsert(profile, { onConflict: "id" });

    if (error) {
      console.warn("Could not sync profile email:", error.message);
    }
  } catch (error) {
    console.warn("Could not sync profile email:", error.message);
  }
};

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

    // Supabase vẫn tạo user cho domain không tồn tại, nên phải tự chặn trước:
    // tránh tài khoản rác không bao giờ nhận được email xác thực.
    if (!(await hasMailExchanger(getEmailDomain(email)))) {
      return res.status(400).json({
        code: "email_domain_unreachable",
        message:
          "Tên miền email không nhận được thư. Vui lòng kiểm tra lại địa chỉ email.",
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

    await syncProfileEmail(data.session.access_token, data.user);

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

    if (!(await hasMailExchanger(getEmailDomain(email)))) {
      return res.status(400).json({
        code: "email_domain_unreachable",
        message:
          "Tên miền email không nhận được thư. Vui lòng kiểm tra lại địa chỉ email.",
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

// Các loại OTP được phép xác thực qua endpoint này.
const CONFIRM_TYPES = new Set(["signup", "email", "email_change", "invite"]);

// POST /api/auth/confirm
export const confirmEmail = async (req, res) => {
  try {
    const { token_hash: tokenHash, type } = req.body ?? {};

    if (typeof tokenHash !== "string" || !tokenHash.trim()) {
      return res.status(400).json({
        message: "Liên kết xác thực không hợp lệ.",
      });
    }

    const { data, error } = await supabase.auth.verifyOtp({
      type: CONFIRM_TYPES.has(type) ? type : "signup",
      token_hash: tokenHash.trim(),
    });

    if (error || !data.session) {
      return res.status(400).json({
        code: "invalid_or_expired_token",
        message:
          "Liên kết xác thực đã hết hạn hoặc không hợp lệ. Vui lòng gửi lại email xác thực.",
      });
    }

    await syncProfileEmail(data.session.access_token, data.user);

    return res.status(200).json({
      message: "Xác thực email thành công",
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      session: {
        access_token: data.session.access_token,
        expires_in: data.session.expires_in,
      },
    });
  } catch (error) {
    console.error("Confirm email error:", error);
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
      .select("id, full_name, email, created_at")
      .eq("id", req.user.id)
      .maybeSingle();

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
      // Có thể null nếu profile chưa được tạo; frontend đã xử lý trường hợp này.
      profile: data,
    });
  } catch (error) {
    console.error("GetMe error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
