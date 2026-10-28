import { resolveMx } from "node:dns/promises";

// Chỉ kiểm tra domain có nhận mail được hay không (có bản ghi MX). Không thể
// kiểm tra hộp thư cụ thể có tồn tại: máy chủ mail hiện đại đều trả lời giống
// nhau cho địa chỉ có thật và không có thật để chống dò email.
const cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 3000;

// Các lỗi này nghĩa là domain không tồn tại hoặc sai cú pháp nên chắc chắn
// không nhận được mail; những lỗi còn lại (mạng, timeout) thì cho đi qua để
// không chặn người dùng hợp lệ khi DNS tạm thời có vấn đề.
const NOT_FOUND_CODES = new Set([
  "ENOTFOUND",
  "ENODATA",
  "NXDOMAIN",
  "EBADNAME",
]);

export const getEmailDomain = (email) =>
  email.trim().split("@").pop()?.toLowerCase() ?? "";

export async function hasMailExchanger(domain) {
  if (!domain) return false;

  const cached = cache.get(domain);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value = true;

  try {
    const records = await Promise.race([
      resolveMx(domain),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("dns_timeout")), LOOKUP_TIMEOUT_MS),
      ),
    ]);

    value = Array.isArray(records) && records.length > 0;
  } catch (error) {
    if (NOT_FOUND_CODES.has(error.code)) {
      value = false;
    } else {
      console.warn(`MX lookup failed for ${domain}:`, error.message);
      value = true;
    }
  }

  cache.set(domain, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}
