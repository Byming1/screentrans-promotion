import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, Copy, Info, ArrowLeft } from "lucide-react";
import { subscriptionApi } from "../services/subscriptions";
import { errorMessage } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { paymentQr, bankAccount } from "../constants/payment";
import { formatDuration } from "../utils/planFeatures";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export default function Checkout() {
  const { planCode } = useParams();
  const { user, profile } = useAuth();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const email = profile?.email || user?.email || "";
  const qrSrc = paymentQr[planCode];

  useEffect(() => {
    let active = true;
    subscriptionApi
      .plans()
      .then(({ data }) => {
        if (!active) return;
        const plans = Array.isArray(data.plans) ? data.plans : [];
        setPlan(plans.find((p) => p.code === planCode) || null);
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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Trình duyệt không cho phép sao chép. Hãy chép email thủ công.");
    }
  };

  return (
    <>
      <div className="page-top">
        <div className="container">
          <span className="eyebrow">THANH TOÁN</span>
          <h1>Quét mã để nâng cấp Premium</h1>
          <p>
            Chuyển khoản đúng số tiền và ghi email của bạn vào nội dung chuyển
            khoản để chúng tôi kích hoạt gói.
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

                <p className="checkout-label">Nội dung chuyển khoản</p>
                <div className="checkout-copy">
                  <code className="break-word">{email}</code>
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
                    <strong>Hãy nhập email vào nội dung chuyển khoản.</strong>{" "}
                    Đây là cách duy nhất để chúng tôi xác định tài khoản cần
                    nâng cấp. Thiếu email, giao dịch sẽ không được kích hoạt.
                  </span>
                </div>

                <p className="checkout-label">Thông tin người nhận</p>
                <p className="checkout-meta">
                  {bankAccount.holder} — {bankAccount.provider}
                </p>

                <ol className="checkout-steps">
                  <li>Mở app ngân hàng hoặc MoMo, quét mã QR bên cạnh.</li>
                  <li>
                    Kiểm tra số tiền đúng {currency.format(plan.price_vnd || 0)}
                    .
                  </li>
                  <li>Dán email ở trên vào ô nội dung chuyển khoản.</li>
                  <li>
                    Hoàn tất chuyển khoản, gói sẽ được kích hoạt trong vòng 24
                    giờ.
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
