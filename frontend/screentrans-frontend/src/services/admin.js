import { api } from './api';

export const adminApi = {
  stats: () => api.get('/admin/stats'),
  users: () => api.get('/admin/users'),
  userSubscriptions: (userId) => api.get(`/admin/users/${userId}/subscriptions`),
  updateSubscriptionKey: (subscriptionId, activationKey) =>
    api.patch(`/admin/subscriptions/${subscriptionId}`, { activationKey }),
};
