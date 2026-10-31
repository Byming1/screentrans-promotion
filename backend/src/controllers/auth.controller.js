import {
  supabase,
  createUserClient,
  createOAuthClient,
  authFetch,
} from "../config/supabase.js";
import { getEmailDomain, hasMailExchanger } from "../utils/emailDomain.js";

const frontendUrl = (
  process.env.FRONTEND_URL || "http://localhost:5173"
).replace(/\/$/, "");

// Link trong email xác thực phải trỏ về frontend, nếu không Supabase sẽ dùng
// Site URL mặc định trong Dashboard. URL này cũng phải nằm trong danh sách
// Redirect URLs của project.
const emailRedirectTo = `${frontendUrl}/auth/confirm`;

// Google trả người dùng về Supabase, Supabase chuyển tiếp kèm ?code về đây.
const oauthRedirectTo = `${frontendUrl}/auth/callback`;

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// Supabase cố tình trả 200 khi đăng ký trùng email để không tiết lộ email nào
// đã có trên hệ thống, nên phải tự nhận ra:
//   - user đã xác thực  -> identities rỗng
//   - user chưa xác thực -> created_at là của lần đăng ký trước, lệch hẳn so
//     với confirmation_sent_at của lần này
const EXISTING_USER_SKEW_MS = 5000;

const isExistingUser = (user) => {
  if (!user) return false;

  if (Array.isArray(user.identities) && user.identities.length === 0) {
    return true;
  }

  const createdAt = Date.parse(user.created_at ?? "");
  const sentAt = Date.parse(
    user.confirmation_sent_at ?? user.updated_at ?? "",
  );

  if (Number.isNaN(createdAt) || Number.isNaN(sentAt)) return false;

  return sentAt - createdAt > EXISTING_USER_SKEW_MS;
};

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

    if (isExistingUser(data.user)) {
      return res.status(409).json({
        code: "email_already_registered",
        message: "Email này đã được đăng ký. Vui lòng đăng nhập.",
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

// POST /api/auth/oauth/google
//
// Chặng 1 của luồng PKCE: lấy URL đăng nhập Google kèm code_challenge.
// code_verifier được trả về cho trình duyệt giữ (sessionStorage) rồi gửi lại ở
// chặng 2 — backend không có session store nên không tự giữ được, và đây cũng
// là cách client Supabase phía trình duyệt vẫn làm.
export const googleAuthUrl = async (req, res) => {
  try {
    const { client, readCodeVerifier } = createOAuthClient();

    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: oauthRedirectTo,
        skipBrowserRedirect: true,
      },
    });

    const codeVerifier = readCodeVerifier();

    if (error || !data?.url || !codeVerifier) {
      console.error(
        "Google OAuth URL error:",
        error?.message || "missing url or code verifier",
      );
      return res.status(502).json({
        message:
          "Không khởi tạo được đăng nhập Google. Vui lòng thử lại sau.",
      });
    }

    return res.status(200).json({
      url: data.url,
      codeVerifier,
    });
  } catch (error) {
    console.error("Google OAuth URL error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// POST /api/auth/oauth/callback
//
// Chặng 2: đổi authorization code + code_verifier lấy session.
export const oauthCallback = async (req, res) => {
  try {
    const { code, codeVerifier } = req.body ?? {};

    if (
      typeof code !== "string" ||
      !code.trim() ||
      typeof codeVerifier !== "string" ||
      !codeVerifier.trim()
    ) {
      return res.status(400).json({
        code: "invalid_oauth_callback",
        message: "Thiếu thông tin để hoàn tất đăng nhập Google.",
      });
    }

    const { client } = createOAuthClient(codeVerifier.trim());

    const { data, error } = await client.auth.exchangeCodeForSession(
      code.trim(),
    );

    if (error || !data?.session || !data?.user) {
      // Code chỉ dùng được một lần và hết hạn nhanh, nên lỗi ở đây thường là
      // người dùng tải lại trang callback hoặc quay lại bằng nút back.
      console.warn(
        "OAuth callback error:",
        error?.message || "missing session",
      );
      return res.status(400).json({
        code: "oauth_exchange_failed",
        message:
          "Liên kết đăng nhập Google đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.",
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
        expires_in: data.session.expires_in,
      },
    });
  } catch (error) {
    console.error("OAuth callback error:", error);
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

    if (error) {
      return res.status(400).json({
        code: "invalid_or_expired_token",
        message:
          "Liên kết xác thực đã hết hạn hoặc không hợp lệ. Vui lòng gửi lại email xác thực.",
      });
    }

    // Khi Supabase bật "Secure email change" (mặc định), đổi email cần xác nhận
    // ở CẢ hai địa chỉ. Lần xác nhận đầu thành công nhưng chưa có session —
    // không phải lỗi, chỉ là chưa xong.
    if (!data.session) {
      return res.status(200).json({
        code: "email_change_pending_other_address",
        message:
          "Đã xác nhận ở địa chỉ này. Vui lòng mở liên kết xác nhận ở địa chỉ email còn lại để hoàn tất thay đổi.",
        session: null,
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

const FULL_NAME_MAX = 100;

// PATCH /api/auth/me
//
// Đổi họ tên và/hoặc email đăng nhập. Hai thứ này nằm ở hai nơi khác nhau:
//   - họ tên: user_metadata trong auth.users + bản sao ở profiles.full_name
//   - email:  auth.users.email, và chỉ đổi thật sau khi người dùng bấm liên kết
//             xác nhận Supabase gửi tới địa chỉ mới (type=email_change, đã được
//             /auth/confirm xử lý). Vì vậy không ghi email mới vào profiles ở
//             đây — bản sao đó được cập nhật ở lần đăng nhập/xác thực kế tiếp.
export const updateMe = async (req, res) => {
  try {
    const { fullName, email } = req.body ?? {};

    const wantsName = fullName !== undefined;
    const wantsEmail = email !== undefined;

    if (!wantsName && !wantsEmail) {
      return res.status(400).json({
        message: "Không có thông tin nào cần cập nhật.",
      });
    }

    let trimmedName;
    if (wantsName) {
      if (typeof fullName !== "string") {
        return res.status(400).json({ message: "Họ tên không hợp lệ." });
      }
      trimmedName = fullName.trim();
      if (trimmedName.length < 2 || trimmedName.length > FULL_NAME_MAX) {
        return res.status(400).json({
          message: `Họ tên phải có từ 2 đến ${FULL_NAME_MAX} ký tự.`,
        });
      }
    }

    let trimmedEmail;
    if (wantsEmail) {
      if (typeof email !== "string" || !isEmail(email)) {
        return res.status(400).json({ message: "Email không hợp lệ." });
      }
      trimmedEmail = email.trim();
    }

    // Email trùng email hiện tại thì coi như không đổi: Supabase vẫn gửi thư
    // xác nhận trong trường hợp này, gây hiểu nhầm là đã đổi thành công.
    const emailChanged =
      wantsEmail &&
      trimmedEmail.toLowerCase() !== (req.user.email ?? "").toLowerCase();

    if (emailChanged && !(await hasMailExchanger(getEmailDomain(trimmedEmail)))) {
      return res.status(400).json({
        code: "email_domain_unreachable",
        message:
          "Tên miền email không nhận được thư. Vui lòng kiểm tra lại địa chỉ email.",
      });
    }

    const attributes = {};
    if (wantsName) attributes.data = { full_name: trimmedName };
    if (emailChanged) attributes.email = trimmedEmail;

    if (Object.keys(attributes).length > 0) {
      const { error } = await authFetch("/user", {
        method: "PUT",
        accessToken: req.accessToken,
        body: attributes,
        redirectTo: emailChanged ? emailRedirectTo : undefined,
      });

      if (error) {
        if (error.code === "email_exists" || error.status === 422) {
          return res.status(409).json({
            code: "email_already_registered",
            message: "Email này đã được sử dụng cho một tài khoản khác.",
          });
        }

        if (error.status === 429) {
          return res.status(429).json({
            message: "Bạn vừa yêu cầu đổi email. Vui lòng thử lại sau ít phút.",
          });
        }

        console.warn("Update user error:", error.message);
        return res.status(error.status >= 400 && error.status < 500 ? error.status : 500)
          .json({ message: "Không cập nhật được thông tin. Vui lòng thử lại." });
      }
    }

    // Họ tên hiển thị khắp nơi đọc từ profiles, nên phải ghi cả bản sao đó.
    // Khác với syncProfileEmail: ở đây lỗi phải báo cho người dùng, nếu không
    // họ thấy "đã lưu" mà tên trên trang vẫn như cũ.
    if (wantsName) {
      const { error } = await req.supabase
        .from("profiles")
        .upsert(
          { id: req.user.id, email: req.user.email, full_name: trimmedName },
          { onConflict: "id" },
        );

      if (error) {
        console.warn("Could not update profile name:", error.message);
        return res.status(500).json({
          message: "Đã đổi tên trên tài khoản nhưng chưa lưu được vào hồ sơ.",
        });
      }
    }

    return res.status(200).json({
      message: emailChanged
        ? "Đã lưu thông tin. Vui lòng kiểm tra hộp thư của email mới để xác nhận thay đổi."
        : "Đã lưu thông tin.",
      emailConfirmationRequired: emailChanged,
      // Email đăng nhập chưa đổi cho tới khi người dùng xác nhận.
      pendingEmail: emailChanged ? trimmedEmail : null,
    });
  } catch (error) {
    console.error("UpdateMe error:", error);
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
      .select("id, full_name, email, role, created_at")
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
