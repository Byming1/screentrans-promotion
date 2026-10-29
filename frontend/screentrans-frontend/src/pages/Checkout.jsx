import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, Copy, Info, ArrowLeft, Loader2 } from "lucide-react";
import { subscriptionApi } from "../services/subscriptions";
import { paymentApi } from "../services/payments";
import { errorMessage } from "../services/api";
import { paymentQr, bankAccount } from "../constants/payment";
import { formatDuration } from "../utils/planFeatures";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

// Hỏi trạng thái đơn mỗi 5 giây. Webhook thường về trong vài giây sau khi
// chuyển khoản, nên người dùng không phải tải lại trang.
const POLL_MS = 5000;

export default function Checkout() {
  const { planCode } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [order, setOrder] = useState(null);
  const [paid, setPaid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const qrSrc = paymentQr[planCode];

  // Tải gói + tạo đơn pending để lấy mã đối soát.
  useEffect(() => {
    let active = true;
    Promise.all([subscriptionApi.plans(), paymentApi.createOrder({ planCode })])
      .then(([plansRes, orderRes]) => {
        if (!active) return;
        const plans = Array.isArray(plansRes.data.plans)
          ? plansRes.data.plans
          : [];
        setPlan(plans.find((p) => p.code === planCode) || null);
        setOrder(orderRes.data.order);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [planCode]);

  // Chờ webhook xác nhận đã nhận tiền.
  useEffect(() => {
    if (!order?.order_code || paid) return;

    let active = true;

    const poll = async () => {
      try {
        const { data } = await paymentApi.orderStatus({
          orderCode: order.order_code,
        });
        if (active && data.order?.status === "paid") setPaid(true);
      } catch {
        // Lỗi mạng tạm thời: bỏ qua, lần hỏi sau sẽ thử lại.
      }
    };

    // Hỏi ngay một lần: webhook có thể đã về xong trước khi trang kịp tải
    // (người dùng chuyển khoản rồi mới mở lại trang), khi đó không nên bắt họ
    // đợi thêm một nhịp POLL_MS.
    poll();
    const timer = setInterval(poll, POLL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [order?.order_code, paid]);

  // Chuyển hướng phải nằm ở effect riêng, không nằm trong callback của effect
  // polling: `paid` là dependency của effect đó, nên setPaid(true) làm React
  // chạy cleanup (active = false) trước khi setTimeout kịp nổ — khiến người
  // dùng thấy thông báo thành công rồi kẹt lại ở trang thanh toán.
  useEffect(() => {
    if (!paid) return;
    // Cho người dùng thấy thông báo thành công trước khi chuyển trang.
    const timer = setTimeout(() => navigate("/profile", { replace: true }), 2500);
    return () => clearTimeout(timer);
  }, [paid, navigate]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(order.order_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Trình duyệt không cho phép sao chép. Hãy chép mã thủ công.");
    }
  };

  return (
    <>
      <div className="page-top">
        <div className="container">
          <span className="eyebrow">THANH TOÁN</span>
          <h1>Quét mã để nâng cấp Premium</h1>
          <p>
            Chuyển khoản đúng số tiền và ghi mã đơn vào nội dung chuyển khoản.
            Gói sẽ được kích hoạt tự động ngay sau khi nhận được tiền.
          </p>
        </div>
      </div>
      <section className="section">
        <div className="container">
          {loading && <p>Đang tải thông tin gói...</p>}
          {error && (
            <p className="form-message error" role="alert">
              {error}
            </p>
          )}
          {!loading && !plan && (
            <div className="checkout-empty">
              <p>Không tìm thấy gói dịch vụ bạn chọn.</p>
              <Link className="btn btn-outline" to="/pricing">
                Quay lại bảng giá
              </Link>
            </div>
          )}
          {!loading && plan && !qrSrc && (
            <div className="checkout-empty">
              <p>Gói {plan.name} chưa hỗ trợ thanh toán bằng mã QR.</p>
              <Link className="btn btn-outline" to="/pricing">
                Quay lại bảng giá
              </Link>
            </div>
          )}
          {!loading && plan && qrSrc && (
            <div className="checkout-grid">
              <article className="checkout-qr">
                <img src={qrSrc} alt={`Mã QR thanh toán gói ${plan.name}`} />
              </article>
              <article className="checkout-info">
                <span className="price-name">{plan.name}</span>
                <h2>
                  {currency.format(plan.price_vnd || 0)}{" "}
                  <small>/ {formatDuration(plan)}</small>
                </h2>
                <div className="price-line" />

                {paid ? (
                  <p className="form-message success" role="status">
                    <strong>Đã nhận được thanh toán!</strong> Gói của bạn đã
                    được kích hoạt. Đang chuyển tới trang tài khoản...
                  </p>
                ) : (
                  <>
                    <p className="checkout-label">Nội dung chuyển khoản</p>
                    <div className="checkout-copy">
                      <code className="break-word">{order?.order_code}</code>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={handleCopy}
                      >
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                        {copied ? "Đã chép" : "Chép"}
                      </button>
                    </div>

                    <div className="notice">
                      <Info size={17} />
                      <span>
                        <strong>
                          Hãy nhập đúng mã này vào nội dung chuyển khoản.
                        </strong>{" "}
                        Hệ thống dựa vào mã để biết giao dịch thuộc về bạn.
                        Thiếu mã, gói sẽ không được kích hoạt tự động.
                      </span>
                    </div>

                    <p className="checkout-waiting" role="status">
                      <Loader2 size={15} className="spin" />
                      Đang chờ thanh toán... Trang này sẽ tự cập nhật.
                    </p>
                  </>
                )}

                <p className="checkout-label">Thông tin người nhận</p>
                <p className="checkout-meta">
                  {bankAccount.holder} — {bankAccount.provider}
                </p>

                <ol className="checkout-steps">
                  <li>Mở app ngân hàng, quét mã QR bên cạnh.</li>
                  <li>
                    Kiểm tra số tiền đúng {currency.format(plan.price_vnd || 0)}
                    .
                  </li>
                  <li>Dán mã đơn ở trên vào ô nội dung chuyển khoản.</li>
                  <li>
                    Hoàn tất chuyển khoản và đợi tại trang này — gói được kích
                    hoạt tự động sau vài giây.
                  </li>
                </ol>

                <Link className="btn btn-outline full" to="/pricing">
                  <ArrowLeft size={16} />
                  Quay lại bảng giá
                </Link>
              </article>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
