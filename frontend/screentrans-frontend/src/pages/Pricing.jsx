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

// Phần trăm tiết kiệm của gói dài hạn so với trả theo tháng. Tính từ giá thật
// trong database chứ không ghi cứng, để đổi giá trong Supabase là con số này
// tự đúng theo.
function savingsPercent(plan, monthlyPlan) {
  if (!monthlyPlan?.price_vnd || !plan.price_vnd) return null;
  if (plan.duration_unit !== "year" || !plan.duration_value) return null;

  const fullPrice = monthlyPlan.price_vnd * 12 * plan.duration_value;
  if (fullPrice <= plan.price_vnd) return null;

  return Math.round((1 - plan.price_vnd / fullPrice) * 100);
}

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

  // Mốc để tính tiết kiệm: gói trả phí ngắn nhất theo tháng.
  const monthlyPlan = plans.find(
    (plan) => plan.duration_unit === "month" && plan.price_vnd > 0,
  );

  // Gói được làm nổi bật là gói trả phí đắt nhất (dài hạn nhất) — không ghi
  // cứng mã gói để bảng giá tự đúng khi số gói thay đổi.
  const featuredCode = plans
    .filter((plan) => plan.price_vnd > 0)
    .reduce(
      (best, plan) => (!best || plan.price_vnd > best.price_vnd ? plan : best),
      null,
    )?.code;

  return (
    <>
      <div className="page-top">
        <div className="container">
          <span className="eyebrow">BẢNG GIÁ</span>
          <h1>Các gói ScreenTrans</h1>
          <p>
            Chọn gói phù hợp và thanh toán bằng mã QR.
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
              const savings = savingsPercent(plan, monthlyPlan);
              return (
                <article
                  className={
                    plan.code === featuredCode
                      ? "pricing-card featured"
                      : "pricing-card"
                  }
                  key={plan.id}
                >
                  {plan.code === featuredCode && (
                    <span className="popular">PHỔ BIẾN</span>
                  )}
                  <span className="price-name">{plan.name}</span>
                  <h2>
                    {currency.format(plan.price_vnd || 0)}{" "}
                    <small>/ {formatDuration(plan)}</small>
                  </h2>
                  {savings != null && (
                    <span className="price-badge">Tiết kiệm {savings}%</span>
                  )}
                  <div className="price-line" />
                  <div className="price-features">
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
                  </div>
                  {authLoading ? (
                    <button className="btn btn-outline full" disabled>
                      Đang kiểm tra tài khoản...
                    </button>
                  ) : plan.price_vnd > 0 ? (
                    // Gói trả phí: dẫn tới màn hình QR. Khách chưa đăng nhập phải
                    // đăng nhập trước để lấy đúng email ghi vào nội dung chuyển khoản.
                    <Link
                      className="btn btn-primary full"
                      to={user ? `/checkout/${plan.code}` : "/login"}
                      state={user ? undefined : { from: `/checkout/${plan.code}` }}
                    >
                      Mua gói
                    </Link>
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
            Thanh toán bằng chuyển khoản QR. Vui lòng ghi email tài khoản vào
            nội dung chuyển khoản; gói sẽ được kích hoạt trong vòng 24 giờ.
          </p>
        </div>
      </section>
    </>
  );
}
