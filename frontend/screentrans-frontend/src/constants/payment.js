// Cấu hình thanh toán thủ công qua QR (MoMo / VietQR).
// Mỗi gói trả phí ánh xạ tới một ảnh QR có sẵn số tiền trong /public/qr.
// Khi đổi giá gói trong Supabase, nhớ tạo lại ảnh QR tương ứng rồi thay file ở đây.
export const bankAccount = {
  holder: 'PHAM QUANG MINH',
  provider: 'MoMo / VietQR (Napas 247)',
};

// key = subscription_plans.code
export const paymentQr = {
  PREMIUM_MONTHLY: '/qr/premium-monthly.jpg', // 59.000đ
  PREMIUM_YEARLY: '/qr/premium-yearly.jpg', // 599.000đ
};

export const hasQr = (planCode) => Boolean(paymentQr[planCode]);
