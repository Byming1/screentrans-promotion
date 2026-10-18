import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, X } from "lucide-react";
import { subscriptionApi } from "../services/subscriptions";
import { errorMessage } from "../services/api";
import {
  normalizeFeatures,
  formatDuration,
  formatScanLimit,
} from "../utils/planFeatures";
import { useAuth } from "../contexts/AuthContext";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export default function Pricing() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    let active = true;
    subscriptionApi
      .plans()
      .then(({ data }) => {
        if (active) setPlans(Array.isArray(data.plans) ? data.plans : []);
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
  }, []);

  return (
    <>
      <div className="page-top">
        <div className="container">
          <span className="eyebrow">BẢNG GIÁ</span>
          <h1>Các gói ScreenTrans</h1>
          <p>
            Thông tin lấy từ hệ thống. Website hiện chưa tích hợp thanh toán.
          </p>
        </div>
      </div>
      <section className="section">
        <div className="container">
          {loading && <p>Đang tải bảng giá...</p>}
          {error && (
            <p className="form-message error" role="alert">
              Không tải được bảng giá: {error}
            </p>
          )}
          {!loading && !error && plans.length === 0 && (
            <p>Chưa có gói dịch vụ nào được công bố.</p>
          )}
          <div className="pricing-grid">
            {plans.map((plan) => {
              const features = normalizeFeatures(plan.features);
              return (
                <article className="pricing-card" key={plan.id}>
                  <span className="price-name">{plan.name}</span>
                  <h2>
                    {currency.format(plan.price_vnd || 0)}{" "}
                    <small>/ {formatDuration(plan)}</small>
                  </h2>
                  <div className="price-line" />
                  <div className="price-feature">
                    <Check size={17} />
                    {formatScanLimit(plan.daily_scan_limit)}
                  </div>
                  {features.map((f, i) => (
                    <div
                      className="price-feature"
                      key={i}
                      style={f.enabled ? undefined : { opacity: 0.5 }}
                    >
                      {f.enabled ? <Check size={17} /> : <X size={17} />}
                      {f.label}
                    </div>
                  ))}
                  {authLoading ? (
                    <button className="btn btn-outline full" disabled>
                      Đang kiểm tra tài khoản...
                    </button>
                  ) : user ? (
                    <Link className="btn btn-outline full" to="/profile">
                      Xem gói của tôi
                    </Link>
                  ) : (
                    <Link className="btn btn-outline full" to="/register">
                      Tạo tài khoản
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
          <p className="fine-print">
            Các gói hiển thị nhằm giới thiệu quyền lợi; chưa hỗ trợ mua hoặc gia
            hạn trên website.
          </p>
        </div>
      </section>
    </>
  );
}
