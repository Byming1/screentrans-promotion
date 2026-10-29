import crypto from "node:crypto";

import { supabase, supabaseAdmin } from "../config/supabase.js";
import { generateOrderCode, extractOrderCodes } from "../utils/orderCode.js";

// POST /api/payments/orders
//
// Tạo đơn pending và trả về mã đối soát để người dùng ghi vào nội dung chuyển
// khoản. Chưa có tiền vào ở bước này.
export const createOrder = async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({
        code: "payments_not_configured",
        message: "Chức năng thanh toán chưa được cấu hình trên máy chủ.",
      });
    }

    const { planCode } = req.body ?? {};

    if (typeof planCode !== "string" || !planCode.trim()) {
      return res.status(400).json({ message: "Thiếu mã gói dịch vụ." });
    }

    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("id, code, name, price_vnd, duration_unit, duration_value")
      .eq("code", planCode.trim())
      .eq("is_active", true)
      .maybeSingle();

    if (planError) {
      console.error("Create order plan error:", planError.message);
      return res.status(500).json({ message: "Không đọc được gói dịch vụ." });
    }

    if (!plan) {
      return res.status(404).json({ message: "Gói dịch vụ không tồn tại." });
    }

    if (!plan.price_vnd) {
      return res.status(400).json({
        code: "plan_not_payable",
        message: "Gói này không cần thanh toán.",
      });
    }

    // Số tiền lấy từ database, không lấy từ client: nếu không người dùng có thể
    // tự gửi lên amount nhỏ hơn giá gói.
    const payload = {
      user_id: req.user.id,
      plan_id: plan.id,
      amount_vnd: plan.price_vnd,
      order_code: generateOrderCode(),
      provider: "momo",
    };

    const { data, error } = await supabaseAdmin
      .from("payments")
      .insert(payload)
      .select("id, order_code, amount_vnd, status, expires_at")
      .single();

    if (error) {
      console.error("Create order error:", error.message);
      return res.status(500).json({ message: "Không tạo được đơn thanh toán." });
    }

    return res.status(201).json({
      order: data,
      plan: { code: plan.code, name: plan.name, price_vnd: plan.price_vnd },
    });
  } catch (error) {
    console.error("Create order error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// GET /api/payments/orders/:orderCode
//
// Frontend hỏi định kỳ để biết đã nhận được tiền chưa. Đọc bằng req.supabase
// nên RLS tự chặn người dùng xem đơn của người khác.
export const getOrderStatus = async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from("payments")
      .select("order_code, status, amount_vnd, paid_at, expires_at")
      .eq("order_code", req.params.orderCode)
      .maybeSingle();

    if (error) {
      console.error("Get order status error:", error.message);
      return res.status(500).json({ message: "Không đọc được đơn thanh toán." });
    }

    if (!data) {
      return res.status(404).json({ message: "Không tìm thấy đơn thanh toán." });
    }

    return res.status(200).json({ order: data });
  } catch (error) {
    console.error("Get order status error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// So sánh chuỗi theo thời gian hằng định để không rò rỉ token qua thời gian
// phản hồi.
const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

// POST /api/payments/webhook/sepay
//
// Webhook báo biến động số dư. Khớp đơn bằng mã trong nội dung chuyển khoản,
// rồi gọi hàm SQL activate_paid_order để kích hoạt gói trong một transaction.
//
// Endpoint này công khai trên Internet nên bắt buộc phải xác thực bằng token
// cấu hình sẵn (SePay gửi header `Authorization: Apikey <key>`).
export const sepayWebhook = async (req, res) => {
  try {
    const expected = process.env.SEPAY_WEBHOOK_API_KEY;

    if (!expected) {
      console.error("SePay webhook called without SEPAY_WEBHOOK_API_KEY set");
      return res.status(503).json({ success: false });
    }

    const header = req.headers.authorization ?? "";
    const token = header.replace(/^Apikey\s+/i, "").trim();

    if (!token || !safeEqual(token, expected)) {
      console.warn("SePay webhook: invalid api key");
      return res.status(401).json({ success: false });
    }

    if (!supabaseAdmin) {
      console.error("SePay webhook without SUPABASE_SECRET_KEY configured");
      return res.status(503).json({ success: false });
    }

    const body = req.body ?? {};

    // Chỉ xử lý tiền vào; giao dịch chuyển ra không liên quan tới đơn hàng.
    if (body.transferType && body.transferType !== "in") {
      return res.status(200).json({ success: true, skipped: "not_incoming" });
    }

    const amount = Number(body.transferAmount);
    const content = `${body.content ?? ""} ${body.description ?? ""}`;
    const codes = extractOrderCodes(content);

    if (!codes.length) {
      // Vẫn trả 200: giao dịch không có mã đơn (người dùng quên ghi) không phải
      // lỗi của webhook, trả lỗi chỉ làm SePay retry vô ích.
      console.warn("SePay webhook: no order code in content:", content.slice(0, 120));
      return res.status(200).json({ success: true, skipped: "no_order_code" });
    }

    const results = [];

    for (const code of codes) {
      const { data: order, error: orderError } = await supabaseAdmin
        .from("payments")
        .select("order_code, amount_vnd, status")
        .eq("order_code", code)
        .maybeSingle();

      if (orderError) {
        console.error("SePay webhook lookup error:", orderError.message);
        return res.status(500).json({ success: false });
      }

      if (!order) {
        results.push({ code, result: "not_found" });
        continue;
      }

      // Trả thiếu tiền thì không kích hoạt; để admin xử lý tay.
      if (Number.isFinite(amount) && amount < order.amount_vnd) {
        console.warn(
          `SePay webhook: underpaid ${code} (${amount}/${order.amount_vnd})`,
        );
        results.push({ code, result: "underpaid" });
        continue;
      }

      const { data, error } = await supabaseAdmin.rpc("activate_paid_order", {
        p_order_code: code,
        p_provider_txn_id: body.referenceCode ?? body.id ?? null,
        p_amount: Number.isFinite(amount) ? amount : null,
        p_raw: body,
      });

      if (error) {
        console.error("activate_paid_order error:", error.message);
        return res.status(500).json({ success: false });
      }

      console.log(`SePay webhook: ${code} -> ${data}`);
      results.push({ code, result: data });
    }

    // SePay coi là thành công khi nhận 200/201 kèm {"success": true}; sai thì
    // nó retry tới 7 lần.
    return res.status(200).json({ success: true, results });
  } catch (error) {
    console.error("SePay webhook error:", error);
    return res.status(500).json({ success: false });
  }
};
