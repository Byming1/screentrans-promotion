// Sinh ảnh QR VietQR động cho từng đơn thanh toán.
//
// Trước đây mỗi gói dùng một ảnh QR tĩnh trong frontend/public/qr, nên đổi giá
// gói trong Supabase là phải vẽ lại ảnh. QR động lấy số tiền và nội dung ngay
// từ đơn vừa tạo nên không bao giờ lệch với price_vnd.
//
// Dùng dịch vụ ảnh QR của SePay (miễn phí, không cần key): nó dựng chuỗi
// VietQR/Napas 247 từ số tài khoản + mã ngân hàng.
const QR_ENDPOINT = "https://qr.sepay.vn/img";

export const bankConfig = () => {
  const account = process.env.BANK_ACCOUNT_NUMBER?.trim();
  const bank = process.env.BANK_CODE?.trim();
  const holder = process.env.BANK_ACCOUNT_HOLDER?.trim();

  if (!account || !bank) return null;

  return { account, bank, holder: holder || "" };
};

// Nội dung chuyển khoản là email người đăng ký.
//
// Ngân hàng tự viết hoa và bỏ ký tự đặc biệt (`@`, `.`, `+`) khỏi nội dung, nên
// không thể so khớp email nguyên bản. Chuẩn hoá cả hai phía về cùng một dạng
// chỉ gồm A-Z và 0-9 thì email "an.vu+x@gmail.com" và nội dung ngân hàng in ra
// "ANVUXGMAILCOM" vẫn khớp nhau.
export const normalizeMemo = (value) =>
  typeof value === "string" ? value.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";

// Nội dung hiển thị cho người dùng cũng là dạng đã chuẩn hoá, không phải email
// nguyên bản: chuỗi VietQR và app ngân hàng đều tự bỏ `@` `.` `+` khỏi nội
// dung, nên nếu web hiện "an.vu@gmail.com" mà QR quét ra "ANVUGMAILCOM" thì
// người dùng tưởng hệ thống sinh sai mã.
export const buildTransferMemo = (email) => normalizeMemo(email);

export const buildQrUrl = ({ amount, memo }) => {
  const bank = bankConfig();
  if (!bank) return null;

  const params = new URLSearchParams({
    acc: bank.account,
    bank: bank.bank,
    amount: String(amount),
    des: memo,
    template: "compact",
  });

  return `${QR_ENDPOINT}?${params.toString()}`;
};
