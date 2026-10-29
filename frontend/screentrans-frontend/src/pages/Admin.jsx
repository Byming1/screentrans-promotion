import { useEffect, useState } from 'react';
import { RefreshCw, Users, CalendarDays, CalendarRange, Crown } from 'lucide-react';
import { adminApi } from '../services/admin';
import { errorMessage } from '../services/api';

const number = new Intl.NumberFormat('vi-VN');

function StatTile({ icon, label, value, note }) {
  return <article className="stat-tile">
    <span className="stat-icon">{icon}</span>
    <span className="stat-label">{label}</span>
    <strong className="stat-value">{number.format(value ?? 0)}</strong>
    {note && <span className="stat-note">{note}</span>}
  </article>;
}

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);

  // Tải lần đầu: chỉ set state trong callback của promise, không set đồng bộ
  // trong thân effect (busy đã mặc định là true).
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    adminApi.stats()
      .then(({ data }) => { if (!cancelled) { setStats(data); setError(''); } })
      .catch((err) => { if (!cancelled) setError(errorMessage(err)); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [reloadCount]);

  const handleRefresh = () => {
    setBusy(true);
    setReloadCount((n) => n + 1);
  };

  const users = stats?.users;
  const subs = stats?.subscriptions;

  return <>
    <div className="page-top">
      <div className="container">
        <span className="eyebrow">QUẢN TRỊ</span>
        <h1>Thống kê ScreenTrans</h1>
        <p>Số lượng người dùng và các gói Premium đang còn hạn sử dụng.</p>
      </div>
    </div>
    <section className="section">
      <div className="container">
        <div className="admin-bar">
          <p className="checkout-meta">
            {stats?.generatedAt
              ? `Cập nhật lúc ${new Date(stats.generatedAt).toLocaleString('vi-VN')}`
              : 'Đang tải số liệu...'}
          </p>
          <button type="button" className="btn btn-outline" disabled={busy} onClick={handleRefresh}>
            <RefreshCw size={16} /> {busy ? 'Đang tải...' : 'Làm mới'}
          </button>
        </div>

        {error && <p className="form-message error" role="alert">{error}</p>}

        {stats && <div className="stat-row">
          <StatTile
            icon={<Users size={18} />}
            label="Người đăng ký"
            value={users?.total}
            note={`${number.format(users?.confirmed ?? 0)} đã xác thực email`}
          />
          <StatTile
            icon={<CalendarDays size={18} />}
            label="Gói tháng còn hạn"
            value={subs?.monthly}
          />
          <StatTile
            icon={<CalendarRange size={18} />}
            label="Gói năm còn hạn"
            value={subs?.yearly}
          />
          <StatTile
            icon={<Crown size={18} />}
            label="Tổng Premium còn hạn"
            value={subs?.premiumTotal}
            note="Không tính trùng người gia hạn nhiều lần"
          />
        </div>}
      </div>
    </section>
  </>;
}
