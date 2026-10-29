import { api } from './api';

export const paymentApi = {
  createOrder: ({ planCode }) => api.post('/payments/orders', { planCode }),
  orderStatus: ({ orderCode }) => api.get(`/payments/orders/${orderCode}`),
};
