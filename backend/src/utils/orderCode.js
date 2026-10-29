import crypto from "node:crypto";

// Mã đối soát người dùng ghi vào nội dung chuyển khoản.
//
// Chỉ dùng A-Z và 2-9: bỏ 0/O/1/I/L để người dùng không gõ sai khi nhập tay.
// Không dùng ký tự thường vì nhiều app ngân hàng tự viết hoa nội dung.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 8;

export const generateOrderCode = () => {
  const bytes = crypto.randomBytes(LENGTH);
  let code = "";

  for (let i = 0; i < LENGTH; i += 1) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }

  // Tiền tố giúp tách mã của hệ thống khỏi phần nội dung người dùng tự thêm.
  return `ST${code}`;
};

// Tìm mã đơn trong nội dung chuyển khoản. Người dùng và ngân hàng thường thêm
// chữ vào quanh mã ("CT DEN:... STABCD2345 ..."), nên phải quét thay vì so khớp
// toàn bộ chuỗi.
const CODE_PATTERN = new RegExp(`ST[${ALPHABET}]{${LENGTH}}`, "g");

export const extractOrderCodes = (content) => {
  if (typeof content !== "string") return [];

  // Bỏ dấu cách và ký tự phân cách: một số ngân hàng chèn thêm vào giữa.
  const normalized = content.toUpperCase().replace(/[\s.\-_]/g, "");

  return [...new Set(normalized.match(CODE_PATTERN) ?? [])];
};
