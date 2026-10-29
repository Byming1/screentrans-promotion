import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, LogOut } from "lucide-react";
import { adminApi } from "../services/admin";
import { errorMessage } from "../services/api";
import { useAuth } from "../contexts/AuthContext";

const number = new Intl.NumberFormat("vi-VN");

function StatTile({ label, value, note }) {
  return (
    <article className="stat-tile">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{number.format(value ?? 0)}</strong>
      {note && <span className="stat-note">{note}</span>}
    </article>
  );
}

export default function Admin() {
  const { profile, user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  // Tải lần đầu: chỉ set state trong callback của promise, không set đồng bộ
  // trong thân effect (busy đã mặc định là true).
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .stats()
      .then(({ data }) => {
        if (!cancelled) {
          setStats(data);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadCount]);

  const handleRefresh = () => {
    setBusy(true);
    setReloadCount((n) => n + 1);
  };

  const handleSignOut = () => {
    logout();
    navigate("/login");
  };

  const users = stats?.users;
  const subs = stats?.subscriptions;

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div>
          <h1>Thống kê ScreenTrans</h1>
          <p>{profile?.email || user?.email}</p>
        </div>
        <div className="admin-actions">
          <button
            type="button"
            className="btn btn-outline"
            disabled={busy}
            onClick={handleRefresh}
          >
            <RefreshCw size={16} /> {busy ? "Đang tải..." : "Làm mới"}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleSignOut}
          >
            <LogOut size={16} /> Đăng xuất
          </button>
        </div>
      </header>

      {error && (
        <p className="form-message error" role="alert">
          {error}
        </p>
      )}

      {stats && (
        <>
          <div className="stat-row">
            <StatTile label="Người đăng ký" value={users?.total} />
            <StatTile label="Gói tháng còn hạn" value={subs?.monthly} />
            <StatTile label="Gói năm còn hạn" value={subs?.yearly} />
            <StatTile
              label="Tổng Premium còn hạn"
              value={subs?.premiumTotal}
              note="Không tính trùng người gia hạn nhiều lần"
            />
          </div>
          <p className="admin-foot">
            Cập nhật lúc{" "}
            {new Date(stats.generatedAt).toLocaleString("vi-VN")}
          </p>
        </>
      )}
    </div>
  );
}
