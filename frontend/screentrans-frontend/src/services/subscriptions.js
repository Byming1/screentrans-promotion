import { api } from './api';

export const subscriptionApi = {
  plans: () => api.get('/subscriptions/plans'),
  mine: () => api.get('/subscriptions/my'),
};
