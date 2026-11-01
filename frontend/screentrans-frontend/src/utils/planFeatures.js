// Chuẩn hoá cột `features` (jsonb) của subscription_plans thành danh sách hiển thị.
// Hỗ trợ: mảng chuỗi, mảng object {label|name|title}, object {key: true|false|number|string}, hoặc chuỗi JSON.

// Thêm key -> nhãn tiếng Việt cho các feature của bạn ở đây. Key nào không có
// trong bảng này sẽ bị humanize() hiện nguyên dạng tiếng Anh, nên khi thêm
// feature mới trong Supabase hãy khai báo nhãn ở đây luôn.
const FEATURE_LABELS = {
  ocr: "Nhận dạng văn bản (OCR)",
  translate: "Dịch văn bản trên màn hình",
  history: "Lưu lịch sử dịch",
  no_ads: "Không quảng cáo",
  ads_free: "Không quảng cáo",
  priority_support: "Hỗ trợ ưu tiên",
  offline: "Dùng ngoại tuyến",
  multi_language: "Đa ngôn ngữ",
  standard_overlay: "Lớp phủ dịch tiêu chuẩn",
  advanced_overlay: "Lớp phủ dịch nâng cao",
  auto_full_screen_scan: "Tự động quét toàn màn hình",
};

// `support` có giá trị dạng chuỗi ("general", "priority"...) chứ không phải
// bật/tắt, nên cần nhãn riêng cho từng giá trị thay vì "Support: general".
const SUPPORT_LABELS = {
  general: "Hỗ trợ tiêu chuẩn",
  priority: "Hỗ trợ ưu tiên",
  vip: "Hỗ trợ VIP",
};

const humanize = (key) => {
  const text = String(key).replace(/[_-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export function normalizeFeatures(raw) {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return value.trim() ? [{ label: value.trim(), enabled: true }] : [];
    }
  }
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item == null) return null;
        if (typeof item === "object") {
          const label = item.label || item.name || item.title;
          return label
            ? { label: String(label), enabled: item.enabled !== false }
            : null;
        }
        return { label: FEATURE_LABELS[item] || String(item), enabled: true };
      })
      .filter(Boolean);
  }

  if (typeof value === "object") {
    return Object.entries(value).map(([key, val]) => {
      const name = FEATURE_LABELS[key] || humanize(key);
      if (key === "support" && typeof val === "string")
        return { label: SUPPORT_LABELS[val] || humanize(val), enabled: true };
      if (val === true) return { label: name, enabled: true };
      if (val === false || val == null) return { label: name, enabled: false };
      if (typeof val === "number")
        return { label: `${name}: ${val}`, enabled: val !== 0 };
      if (typeof val === "object") return { label: name, enabled: true };
      return { label: `${name}: ${val}`, enabled: true };
    });
  }
  return [];
}

const UNIT_TEXT = { day: "ngày", month: "tháng", year: "năm" };

export function formatDuration(plan) {
  if (!plan) return "";
  if (plan.duration_unit === "unlimited" || plan.duration_value == null)
    return "không giới hạn thời gian";
  return `${plan.duration_value} ${UNIT_TEXT[plan.duration_unit] || plan.duration_unit}`;
}

export function formatScanLimit(limit) {
  return limit == null
    ? "Không giới hạn lượt quét/ngày"
    : `${limit} lượt quét/ngày`;
}
