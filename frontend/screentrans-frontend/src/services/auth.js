import { api } from './api';

export const authApi = {
  register: ({ email, password, fullName }) => api.post('/auth/register', { email, password, fullName }),
  login: ({ email, password }) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
};
