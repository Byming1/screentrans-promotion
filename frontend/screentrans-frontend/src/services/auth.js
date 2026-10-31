import { api } from './api';

export const authApi = {
  register: ({ email, password, fullName }) => api.post('/auth/register', { email, password, fullName }),
  login: ({ email, password }) => api.post('/auth/login', { email, password }),
  googleAuthUrl: () => api.post('/auth/oauth/google'),
  oauthCallback: ({ code, codeVerifier }) => api.post('/auth/oauth/callback', { code, codeVerifier }),
  resendConfirmation: ({ email }) => api.post('/auth/resend', { email }),
  confirmEmail: ({ tokenHash, type }) => api.post('/auth/confirm', { token_hash: tokenHash, type }),
  me: () => api.get('/auth/me'),
  // Bỏ qua các trường không được truyền: backend chỉ cập nhật thứ nó nhận được.
  updateMe: ({ fullName, email }) => api.patch('/auth/me', {
    ...(fullName === undefined ? {} : { fullName }),
    ...(email === undefined ? {} : { email }),
  }),
};
