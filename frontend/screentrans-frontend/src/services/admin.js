import { api } from './api';

export const adminApi = {
  stats: () => api.get('/admin/stats'),
};
