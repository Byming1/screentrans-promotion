// Thông tin người nhận, chỉ để hiển thị.
//
// Ảnh QR không còn nằm ở đây: backend sinh QR động (`order.qr_url`) từ số tài
// khoản trong biến môi trường BANK_*, với số tiền và nội dung lấy trực tiếp từ
// đơn vừa tạo. Nhờ vậy đổi giá gói trong Supabase không cần vẽ lại ảnh QR nữa.
export const bankAccount = {
  holder: 'PHAM QUANG MINH',
  provider: 'TPBank — VietQR (Napas 247)',
};
