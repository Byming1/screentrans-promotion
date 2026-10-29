import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authApi } from '../services/auth';
import { landingPath } from '../utils/authRedirect';

const AuthContext = createContext(null);
const TOKEN_KEY = 'screentrans_access_token';
// PKCE code verifier phải sống qua lần chuyển trang sang Google rồi quay lại,
// nên dùng sessionStorage (giữ theo tab) thay vì state trong bộ nhớ.
const OAUTH_VERIFIER_KEY = 'screentrans_oauth_verifier';
const OAUTH_FROM_KEY = 'screentrans_oauth_from';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setProfile(null);
  }, []);

  const loadMe = useCallback(async () => {
    const { data } = await authApi.me();
    setUser(data.user);
    setProfile(data.profile);
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!sessionStorage.getItem(TOKEN_KEY)) { setLoading(false); return; }
    authApi.me().then(({ data }) => {
      if (!cancelled) { setUser(data.user); setProfile(data.profile); }
    }).catch(() => {
      if (!cancelled) logout();
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [logout]);

  const login = async (credentials) => {
    const { data } = await authApi.login(credentials);
    if (!data.session?.access_token) throw new Error('Máy chủ không trả về access token.');
    sessionStorage.setItem(TOKEN_KEY, data.session.access_token);
    setUser(data.user);
    setProfile(null);
    // Không lưu refresh token: khi access token hết hạn, người dùng đăng nhập lại.
    // Endpoint /me có thể thất bại nếu bảng profiles/RLS chưa được cấu hình.
    // Trả kèm profile để nơi gọi biết role mà điều hướng, vì state `profile`
    // chưa kịp cập nhật ngay sau khi hàm này trả về.
    let profile = null;
    try { profile = (await loadMe()).profile; } catch (error) { console.warn('Profile chưa sẵn sàng:', error); }
    return { ...data, profile };
  };

  // Dùng cho luồng xác thực email: backend đã đổi token_hash thành session,
  // ở đây chỉ cần nhận access token như sau khi đăng nhập.
  const adoptSession = useCallback(async ({ accessToken, user: confirmedUser }) => {
    sessionStorage.setItem(TOKEN_KEY, accessToken);
    setUser(confirmedUser);
    setProfile(null);
    try { return (await loadMe()).profile; } catch (error) { console.warn('Profile chưa sẵn sàng:', error); }
    return null;
  }, [loadMe]);

  // Bắt đầu đăng nhập Google: lấy URL + code verifier từ backend, giữ lại
  // verifier rồi chuyển trang sang Google. Hàm này không trả về khi thành công.
  const startGoogleLogin = useCallback(async (from) => {
    const { data } = await authApi.googleAuthUrl();
    if (!data.url || !data.codeVerifier) throw new Error('Máy chủ không trả về liên kết đăng nhập Google.');
    sessionStorage.setItem(OAUTH_VERIFIER_KEY, data.codeVerifier);
    if (from) sessionStorage.setItem(OAUTH_FROM_KEY, from);
    else sessionStorage.removeItem(OAUTH_FROM_KEY);
    window.location.assign(data.url);
  }, []);

  // Hoàn tất đăng nhập Google sau khi Google chuyển về /auth/callback.
  const finishGoogleLogin = useCallback(async (code) => {
    const codeVerifier = sessionStorage.getItem(OAUTH_VERIFIER_KEY);
    const from = sessionStorage.getItem(OAUTH_FROM_KEY);
    // Code và verifier chỉ dùng được một lần: xoá trước khi gọi để lần tải
    // lại trang callback không thử lại với dữ liệu đã tiêu thụ.
    sessionStorage.removeItem(OAUTH_VERIFIER_KEY);
    sessionStorage.removeItem(OAUTH_FROM_KEY);
    if (!codeVerifier) throw new Error('Phiên đăng nhập Google không hợp lệ. Vui lòng đăng nhập lại.');

    const { data } = await authApi.oauthCallback({ code, codeVerifier });
    if (!data.session?.access_token) throw new Error('Máy chủ không trả về access token.');
    const profile = await adoptSession({ accessToken: data.session.access_token, user: data.user });
    return landingPath(profile, from);
  }, [adoptSession]);

  return <AuthContext.Provider value={{ user, profile, loading, login, logout, loadMe, adoptSession, startGoogleLogin, finishGoogleLogin }}>
    {children}
  </AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth phải được sử dụng bên trong AuthProvider');
  return context;
}
