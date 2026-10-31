import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase configuration");
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

// Client bỏ qua RLS, dùng cho trang admin (đếm số liệu của mọi người dùng).
// Key này có toàn quyền trên database nên tuyệt đối không được gửi ra frontend
// và chỉ được dùng sau khi middleware đã xác nhận người gọi là admin.
//
// Null khi chưa cấu hình key: chỉ các endpoint admin báo lỗi, phần còn lại của
// API vẫn chạy bình thường.
const secretKey = process.env.SUPABASE_SECRET_KEY;

export const supabaseAdmin = secretKey
  ? createClient(supabaseUrl, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

// Client chạy dưới danh nghĩa người dùng để RLS được áp dụng đúng.
export const createUserClient = (accessToken) =>
  createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

// Gọi trực tiếp GoTrue (Supabase Auth) dưới danh nghĩa người dùng.
//
// Vì sao không dùng supabase.auth.updateUser: hàm đó đọc session từ storage
// của client, còn backend chỉ có access token do frontend gửi kèm request
// (không lưu refresh token nên cũng không dựng lại session được). Bản thân SDK
// cũng chỉ gửi access token đó làm Bearer, nên gọi thẳng REST là tương đương.
//
// Trả về { data, error } giống SDK để nơi gọi xử lý một kiểu.
export const authFetch = async (path, { method, accessToken, body, redirectTo }) => {
  try {
    // GoTrue đọc đích chuyển hướng của email từ query string, không phải body.
    const query = redirectTo
      ? `?redirect_to=${encodeURIComponent(redirectTo)}`
      : "";

    const response = await fetch(`${supabaseUrl}/auth/v1${path}${query}`, {
      method,
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        data: null,
        error: {
          status: response.status,
          code: data?.error_code ?? data?.error ?? null,
          message:
            data?.msg || data?.message || `Auth request failed (${response.status})`,
        },
      };
    }

    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: { status: 502, code: null, message: error.message },
    };
  }
};

const OAUTH_STORAGE_KEY = "screentrans-oauth";

// Supabase SDK ghi/đọc PKCE code verifier qua storage adapter (giá trị luôn
// được JSON hoá). Trên server không có localStorage và cũng không được dùng
// storage chung giữa các request, nên mỗi request có một Map riêng.
const createMemoryStorage = () => {
  const store = new Map();

  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
};

const verifierKey = `${OAUTH_STORAGE_KEY}-code-verifier`;

// Client cho luồng OAuth (PKCE). Backend không giữ state giữa hai chặng của
// luồng: chặng đầu đọc verifier ra để trả về cho trình duyệt, chặng sau nhận
// lại verifier đó và nạp vào storage trước khi đổi code lấy session.
//
// persistSession phải bật, vì khi tắt thì SDK bỏ qua storage được truyền vào
// và dùng bộ nhớ nội bộ không truy cập được. Session ghi vào Map cũng bị bỏ
// cùng request nên không có gì tồn tại lâu hơn một lần gọi.
export const createOAuthClient = (codeVerifier) => {
  const storage = createMemoryStorage();

  if (codeVerifier) {
    storage.setItem(verifierKey, JSON.stringify(codeVerifier));
  }

  const client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      storage,
      storageKey: OAUTH_STORAGE_KEY,
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const readCodeVerifier = () => {
    const raw = storage.getItem(verifierKey);
    if (typeof raw !== "string") return null;

    try {
      const value = JSON.parse(raw);
      return typeof value === "string" ? value : null;
    } catch {
      return null;
    }
  };

  return { client, readCodeVerifier };
};
