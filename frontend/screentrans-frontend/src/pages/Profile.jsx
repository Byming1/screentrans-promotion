import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { subscriptionApi } from "../services/subscriptions";
import { errorMessage } from "../services/api";
import { normalizeFeatures, formatScanLimit } from "../utils/planFeatures";

const statusText = {
  free: "Chưa có gói đang sử dụng",
  active: "Đang hoạt động",
  pending: "Chưa đến thời điểm kích hoạt",
  expired: "Đã hết hạn",
  revoked: "Đã thu hồi",
};

export default function Profile() {
  const { user, profile, loadMe } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [freePlan, setFreePlan] = useState(null);
  const [subError, setSubError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      loadMe(),
      subscriptionApi.mine(),
      subscriptionApi.plans(),
    ]).then(([p, s, pl]) => {
      if (cancelled) return;
      if (p.status === "rejected") setProfileError(errorMessage(p.reason));
      if (s.status === "fulfilled") setSubscription(s.value.data);
      else setSubError(errorMessage(s.reason));
      if (pl.status === "fulfilled") {
        const plans = pl.value.data?.plans || [];
        setFreePlan(plans.find((x) => x.tier === "free") || null);
      }
      setBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadMe]);

  const status = subscription?.status;
  const sub = subscription?.subscription;
  // Chỉ gói đang active mới được hưởng quyền lợi premium; còn lại dùng quyền lợi gói free.
  const effectivePlan =
    status === "active" ? sub?.subscription_plans : freePlan;
  const features = normalizeFeatures(effectivePlan?.features);

  return (
    <>
      <div className="page-top">
        <div className="container">
          <span className="eyebrow">TÀI KHOẢN</span>
          <h1>Hồ sơ ScreenTrans</h1>
          <p>Thông tin tài khoản và trạng thái gói sử dụng.</p>
        </div>
      </div>
      <section className="section">
        <div className="container profile-grid">
          <article className="profile-card">
            <h2>Thông tin cá nhân</h2>
            <p>
              <strong>Họ tên:</strong>{" "}
              {profile?.full_name || "Chưa có thông tin"}
            </p>
            <p>
              <strong>Email:</strong> {user?.email}
            </p>
            <p>
              <strong>ID:</strong>{" "}
              <span className="break-word">{user?.id}</span>
            </p>
            {profileError && (
              <p className="form-message error">
                Không thể tải hồ sơ: {profileError}. Kiểm tra bảng profiles và
                RLS.
              </p>
            )}
          </article>
          <article className="profile-card">
            <h2>Gói dịch vụ</h2>
            {busy ? (
              <p>Đang tải...</p>
            ) : (
              <>
                <p>
                  <strong>Trạng thái:</strong>{" "}
                  {subscription
                    ? statusText[status] || status
                    : "Chưa có dữ liệu"}
                </p>
                <p>
                  <strong>Gói:</strong>{" "}
                  {status === "active"
                    ? sub?.subscription_plans?.name
                    : freePlan?.name || "Free / Chưa kích hoạt"}
                </p>
                {sub?.expires_at && (
                  <p>
                    <strong>Hết hạn:</strong>{" "}
                    {new Date(sub.expires_at).toLocaleDateString("vi-VN")}
                  </p>
                )}
                {effectivePlan && (
                  <>
                    <p>
                      <strong>Quyền lợi hiện tại:</strong>
                    </p>
                    <div className="price-feature">
                      <Check size={17} />
                      {formatScanLimit(effectivePlan.daily_scan_limit)}
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
                  </>
                )}
                {subError && <p className="form-message error">{subError}</p>}
              </>
            )}
            <Link to="/pricing" className="btn btn-outline">
              Xem bảng giá
            </Link>
          </article>
        </div>
      </section>
    </>
  );
}
