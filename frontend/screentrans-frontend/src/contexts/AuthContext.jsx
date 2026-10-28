import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authApi } from '../services/auth';

const AuthContext = createContext(null);
const TOKEN_KEY = 'screentrans_access_token';

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
    try { await loadMe(); } catch (error) { console.warn('Profile chưa sẵn sàng:', error); }
    return data;
  };

  // Dùng cho luồng xác thực email: backend đã đổi token_hash thành session,
  // ở đây chỉ cần nhận access token như sau khi đăng nhập.
  const adoptSession = useCallback(async ({ accessToken, user: confirmedUser }) => {
    sessionStorage.setItem(TOKEN_KEY, accessToken);
    setUser(confirmedUser);
    setProfile(null);
    try { await loadMe(); } catch (error) { console.warn('Profile chưa sẵn sàng:', error); }
  }, [loadMe]);

  return <AuthContext.Provider value={{ user, profile, loading, login, logout, loadMe, adoptSession }}>
    {children}
  </AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth phải được sử dụng bên trong AuthProvider');
  return context;
}
