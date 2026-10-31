import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, X, Mail, UserRound } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { authApi } from "../services/auth";
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

  const currentName = profile?.full_name || "";
  const currentEmail = profile?.email || user?.email || "";

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  // Email mới chỉ có hiệu lực sau khi người dùng bấm liên kết xác nhận, nên
  // phải nói rõ là đang chờ — nếu không họ tưởng việc lưu đã thất bại.
  const [pendingEmail, setPendingEmail] = useState("");

  const openEditor = () => {
    setForm({ fullName: currentName, email: currentEmail });
    setSaveError("");
    setSaveSuccess("");
    setEditing(true);
  };

  const update = (key) => (event) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const handleSave = async (event) => {
    event.preventDefault();
    const fullName = form.fullName.trim();
    const email = form.email.trim();

    if (fullName.length < 2) {
      setSaveError("Vui lòng nhập họ tên hợp lệ.");
      return;
    }

    // Chỉ gửi những gì thực sự đổi: tránh kích hoạt email xác nhận khi người
    // dùng chỉ sửa họ tên.
    const payload = {};
    if (fullName !== currentName) payload.fullName = fullName;
    if (email.toLowerCase() !== currentEmail.toLowerCase()) payload.email = email;

    if (Object.keys(payload).length === 0) {
      setEditing(false);
      setSaveError("");
      setSaveSuccess("");
      return;
    }

    setSaving(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      const { data } = await authApi.updateMe(payload);
      setSaveSuccess(data.message);
      setPendingEmail(data.pendingEmail || "");
      setEditing(false);
      // Đọc lại hồ sơ để tên mới hiển thị ngay, không phải tải lại trang.
      try {
        await loadMe();
      } catch (err) {
        setProfileError(errorMessage(err));
      }
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

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
            {editing ? (
              <form onSubmit={handleSave}>
                <label>
                  Họ và tên
                  <div className="input-wrap">
                    <UserRound size={18} />
                    <input
                      value={form.fullName}
                      onChange={update("fullName")}
                      placeholder="Nhập họ tên"
                      autoComplete="name"
                      required
                      minLength={2}
                      maxLength={100}
                    />
                  </div>
                </label>
                <label>
                  Email đăng nhập
                  <div className="input-wrap">
                    <Mail size={18} />
                    <input
                      type="email"
                      value={form.email}
                      onChange={update("email")}
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                </label>
                <p className="profile-hint">
                  Đổi email cần xác nhận qua liên kết gửi tới địa chỉ mới. Email
                  cũ vẫn dùng để đăng nhập cho tới khi bạn xác nhận.
                </p>
                {saveError && (
                  <p className="form-message error" role="alert">
                    {saveError}
                  </p>
                )}
                <div className="profile-actions">
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={saving}
                  >
                    {saving ? "Đang lưu..." : "Lưu thay đổi"}
                  </button>
                  <button
                    className="btn btn-outline"
                    type="button"
                    disabled={saving}
                    onClick={() => setEditing(false)}
                  >
                    Huỷ
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p>
                  <strong>Họ tên:</strong> {currentName || "Chưa có thông tin"}
                </p>
                <p className="break-word">
                  <strong>Email:</strong> {currentEmail}
                </p>
                {pendingEmail && (
                  <p className="form-message break-word" role="status">
                    Đang chờ xác nhận đổi sang <strong>{pendingEmail}</strong>.
                    Hãy kiểm tra hộp thư của địa chỉ mới.
                  </p>
                )}
                {saveSuccess && (
                  <p className="form-message success" role="status">
                    {saveSuccess}
                  </p>
                )}
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={openEditor}
                >
                  Chỉnh sửa thông tin
                </button>
              </>
            )}
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
