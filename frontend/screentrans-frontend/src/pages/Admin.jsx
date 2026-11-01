import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  RefreshCw,
  LogOut,
  Search,
  Users,
  CalendarDays,
  CalendarRange,
  X,
  KeyRound,
  Check,
  Copy,
} from "lucide-react";
import { adminApi } from "../services/admin";
import { errorMessage } from "../services/api";
import { useAuth } from "../contexts/AuthContext";

const number = new Intl.NumberFormat("vi-VN");
const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const dateTime = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
});
const dateOnly = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" });

const formatDate = (value) => (value ? dateOnly.format(new Date(value)) : "—");
const formatDateTime = (value) => (value ? dateTime.format(new Date(value)) : "—");

// Nhãn và màu của từng nhóm gói. Dùng chung cho cả huy hiệu trong bảng và các
// tab lọc để một gói luôn hiện cùng một màu ở mọi nơi trên trang.
const PLAN_META = {
  monthly: { label: "Gói tháng", tone: "blue" },
  yearly: { label: "Gói năm", tone: "violet" },
  expired: { label: "Đã hết hạn", tone: "amber" },
  free: { label: "Miễn phí", tone: "grey" },
};

// Trạng thái từng gói trong bảng chi tiết (backend trả sẵn chuỗi này).
const STATUS_META = {
  active: { label: "Đang hoạt động", tone: "teal" },
  pending: { label: "Chưa kích hoạt", tone: "grey" },
  expired: { label: "Đã hết hạn", tone: "amber" },
  revoked: { label: "Đã thu hồi", tone: "grey" },
};

// Số ngày còn lại, để admin thấy ai sắp phải gia hạn.
const daysLeft = (expiresAt) => {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt) - new Date();
  return Math.ceil(diff / 86400000);
};

function StatTile({ label, value, note, icon: Icon, tone }) {
  return (
    <article className={`stat-tile${tone ? ` tone-${tone}` : ""}`}>
      <span className="stat-label">
        {Icon && <Icon size={15} />}
        {label}
      </span>
      <strong className="stat-value">{value}</strong>
      {note && <span className="stat-note">{note}</span>}
    </article>
  );
}

function PlanBadge({ plan }) {
  const meta = PLAN_META[plan] ?? PLAN_META.free;
  return <span className={`badge tone-${meta.tone}`}>{meta.label}</span>;
}

// Bảng người dùng trả phí: dùng cho cả nhóm tháng và nhóm năm nên nhận sẵn
// danh sách đã lọc thay vì tự lọc.
//
// Mỗi dòng mở được hộp thoại chi tiết giống bảng danh sách bên dưới: đây mới
// là nơi admin hay làm việc nhất (xem key, gia hạn), nên không bắt họ phải
// tìm lại cùng người đó ở bảng khác.
function PaidTable({ title, note, rows, emptyText, onOpenUser }) {
  return (
    <section className="admin-panel">
      <header className="panel-head">
        <div>
          <h2>{title}</h2>
          {note && <p>{note}</p>}
        </div>
        <span className="panel-count">{number.format(rows.length)} người</span>
      </header>

      {rows.length === 0 ? (
        <p className="panel-empty">{emptyText}</p>
      ) : (
        <div className="table-scroll">
          <table className="admin-table as-cards">
            <thead>
              <tr>
                <th>Người dùng</th>
                <th>Kích hoạt</th>
                <th>Hết hạn</th>
                <th>Còn lại</th>
                <th className="align-right">Đã trả</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => {
                const left = daysLeft(user.expiresAt);
                return (
                  <tr
                    key={user.id}
                    className="row-clickable"
                    tabIndex={0}
                    role="button"
                    aria-label={`Xem gói của ${user.fullName || user.email}`}
                    onClick={() => onOpenUser(user.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpenUser(user.id);
                      }
                    }}
                  >
                    <td data-label="Người dùng">
                      <span className="cell-strong">{user.fullName || "(chưa đặt tên)"}</span>
                      <span className="cell-sub">{user.email}</span>
                    </td>
                    <td data-label="Kích hoạt">{formatDate(user.activatedAt)}</td>
                    <td data-label="Hết hạn">
                      {user.expiresAt ? formatDate(user.expiresAt) : "Không giới hạn"}
                    </td>
                    <td data-label="Còn lại">
                      {left == null ? (
                        "—"
                      ) : (
                        // Dưới 7 ngày thì tô cảnh báo: đây là nhóm cần nhắc gia hạn.
                        <span className={left <= 7 ? "days-left warn" : "days-left"}>
                          {left} ngày
                        </span>
                      )}
                    </td>
                    <td className="align-right" data-label="Đã trả">
                      {currency.format(user.paidTotalVnd)}
                      {user.paidOrders > 1 && (
                        <span className="cell-sub">{user.paidOrders} đơn</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Một dòng gói trong bảng chi tiết. Key sửa được tại chỗ: bấm "Sửa" biến ô key
// thành input, không mở thêm một lớp hộp thoại nữa.
function SubscriptionRow({ sub, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(sub.activationKey ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const status = STATUS_META[sub.status] ?? STATUS_META.pending;

  const open = () => {
    setValue(sub.activationKey ?? "");
    setError("");
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError("");
  };

  const save = async () => {
    const key = value.trim();
    if (key.length < 8) {
      setError("Key phải dài ít nhất 8 ký tự.");
      return;
    }
    if (key === (sub.activationKey ?? "").trim()) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const { data } = await adminApi.updateSubscriptionKey(sub.id, key);
      onSaved(sub.id, data.subscription);
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sub.activationKey ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Trình duyệt không cho phép sao chép.");
    }
  };

  return (
    // Gói đang chạy được tô nhẹ: một người có thể có nhiều gói cũ, admin mở
    // hộp thoại hầu như luôn để làm việc với gói hiện hành.
    <tr className={sub.status === "active" ? "sub-row current" : "sub-row"}>
      <td data-label="Gói">
        <span className="cell-strong">{sub.planName || "(không rõ gói)"}</span>
        {sub.priceVnd != null && (
          <span className="cell-sub">{currency.format(sub.priceVnd)}</span>
        )}
      </td>
      <td data-label="Trạng thái">
        <span className={`badge tone-${status.tone}`}>{status.label}</span>
      </td>
      <td data-label="Kích hoạt">{formatDate(sub.activatedAt)}</td>
      <td data-label="Hết hạn">
        {sub.expiresAt ? formatDate(sub.expiresAt) : "Không giới hạn"}
      </td>
      <td className="key-cell" data-label="Activation key">
        {editing ? (
          <div className="key-edit">
            <input
              ref={inputRef}
              className="key-input"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") save();
                if (event.key === "Escape") cancel();
              }}
              disabled={saving}
              aria-label="Activation key"
            />
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={save}
              disabled={saving}
            >
              {saving ? "Đang lưu..." : "Lưu"}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-xs"
              onClick={cancel}
              disabled={saving}
            >
              Huỷ
            </button>
          </div>
        ) : (
          <div className="key-view">
            <code className="key-text" title={sub.activationKey || ""}>
              {sub.activationKey || "(chưa có key)"}
            </code>
            {sub.activationKey && (
              <button
                type="button"
                className="icon-btn"
                onClick={copy}
                title="Sao chép key"
                aria-label="Sao chép key"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            )}
            <button type="button" className="btn btn-outline btn-xs" onClick={open}>
              <KeyRound size={13} /> Sửa
            </button>
          </div>
        )}
        {error && <span className="key-error">{error}</span>}
      </td>
    </tr>
  );
}

// Hộp thoại chi tiết một người dùng: danh sách gói + sửa key.
function UserDetail({ userId, onClose, onKeyChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const closeRef = useRef(null);

  // userId không đổi trong vòng đời hộp thoại (đóng/mở lại là mount mới), nên
  // busy mặc định true là đủ, không cần set lại trong effect.
  useEffect(() => {
    let cancelled = false;
    adminApi
      .userSubscriptions(userId)
      .then(({ data: payload }) => {
        if (!cancelled) {
          setData(payload);
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
  }, [userId]);

  // Esc để đóng: hộp thoại phủ kín màn hình nên phải có đường thoát bằng bàn phím.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSaved = (subId, updated) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            subscriptions: prev.subscriptions.map((s) =>
              s.id === subId
                ? { ...s, activationKey: updated.activationKey, keyLast4: updated.keyLast4 }
                : s,
            ),
          }
        : prev,
    );
    onKeyChanged?.();
  };

  const subs = data?.subscriptions ?? [];

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết gói của người dùng"
      >
        <header className="modal-head">
          <div>
            <h2>{data?.user?.fullName || "Chi tiết người dùng"}</h2>
            <p>{data?.user?.email}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </header>

        <div className="modal-body">
          {busy && <p className="panel-empty">Đang tải...</p>}

          {error && (
            <p className="form-message error" role="alert">
              {error}
            </p>
          )}

          {!busy && !error && subs.length === 0 && (
            <p className="panel-empty">Người dùng này chưa có gói trả phí nào.</p>
          )}

          {subs.length > 0 && (
            <div className="table-scroll">
              <table className="admin-table as-cards">
                <thead>
                  <tr>
                    <th>Gói</th>
                    <th>Trạng thái</th>
                    <th>Kích hoạt</th>
                    <th>Hết hạn</th>
                    <th>Activation key</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((sub) => (
                    <SubscriptionRow key={sub.id} sub={sub} onSaved={handleSaved} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const FILTERS = [
  { key: "all", label: "Tất cả" },
  { key: "monthly", label: "Gói tháng" },
  { key: "yearly", label: "Gói năm" },
  { key: "expired", label: "Đã hết hạn" },
  { key: "free", label: "Miễn phí" },
];

export default function Admin() {
  const { profile, user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [reloadCount, setReloadCount] = useState(0);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [openUserId, setOpenUserId] = useState(null);

  // Tải lần đầu: chỉ set state trong callback của promise, không set đồng bộ
  // trong thân effect (busy đã mặc định là true).
  useEffect(() => {
    let cancelled = false;
    Promise.all([adminApi.stats(), adminApi.users()])
      .then(([statsRes, usersRes]) => {
        if (cancelled) return;
        setStats(statsRes.data);
        setUsers(Array.isArray(usersRes.data?.users) ? usersRes.data.users : []);
        setError("");
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

  const monthlyUsers = useMemo(
    () => users.filter((u) => u.plan === "monthly"),
    [users],
  );
  const yearlyUsers = useMemo(
    () => users.filter((u) => u.plan === "yearly"),
    [users],
  );

  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((u) => {
      if (filter !== "all" && u.plan !== filter) return false;
      if (!needle) return true;
      return (
        (u.email || "").toLowerCase().includes(needle) ||
        (u.fullName || "").toLowerCase().includes(needle)
      );
    });
  }, [users, query, filter]);

  const subs = stats?.subscriptions;
  const revenue = stats?.revenue;

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
            <RefreshCw size={16} className={busy ? "spin" : undefined} />
            {busy ? "Đang tải..." : "Làm mới"}
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
            <StatTile
              label="Người đăng ký"
              value={number.format(stats.users?.total ?? 0)}
              note={`${number.format(stats.users?.confirmed ?? 0)} đã xác thực email`}
              icon={Users}
            />
            <StatTile
              label="Gói tháng còn hạn"
              value={number.format(subs?.monthly ?? 0)}
              note={revenue ? `Doanh thu ${currency.format(revenue.monthly)}` : undefined}
              icon={CalendarDays}
              tone="blue"
            />
            <StatTile
              label="Gói năm còn hạn"
              value={number.format(subs?.yearly ?? 0)}
              note={revenue ? `Doanh thu ${currency.format(revenue.yearly)}` : undefined}
              icon={CalendarRange}
              tone="violet"
            />
            <StatTile
              label="Tổng doanh thu"
              value={currency.format(revenue?.total ?? 0)}
              note={`${number.format(revenue?.orders ?? 0)} đơn đã thanh toán`}
              tone="teal"
            />
          </div>

          <div className="admin-columns">
            <PaidTable
              title="Người dùng gói tháng"
              note="Sắp hết hạn lên trên · bấm một dòng để xem và sửa key"
              rows={[...monthlyUsers].sort(
                (a, b) => new Date(a.expiresAt ?? 0) - new Date(b.expiresAt ?? 0),
              )}
              emptyText="Chưa có ai đang dùng gói tháng."
              onOpenUser={setOpenUserId}
            />
            <PaidTable
              title="Người dùng gói năm"
              note="Sắp hết hạn lên trên · bấm một dòng để xem và sửa key"
              rows={[...yearlyUsers].sort(
                (a, b) => new Date(a.expiresAt ?? 0) - new Date(b.expiresAt ?? 0),
              )}
              emptyText="Chưa có ai đang dùng gói năm."
              onOpenUser={setOpenUserId}
            />
          </div>

          <section className="admin-panel">
            <header className="panel-head">
              <div>
                <h2>Danh sách người dùng</h2>
                <p>Toàn bộ tài khoản đã đăng ký, mới nhất lên đầu</p>
              </div>
              <div className="panel-tools">
                <label className="search-box">
                  <Search size={15} />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Tìm theo email hoặc tên"
                    aria-label="Tìm người dùng"
                  />
                </label>
                <div className="filter-tabs" role="group" aria-label="Lọc theo gói">
                  {FILTERS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={filter === item.key ? "chip active" : "chip"}
                      aria-pressed={filter === item.key}
                      onClick={() => setFilter(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </header>

            {visibleUsers.length === 0 ? (
              <p className="panel-empty">Không có người dùng nào khớp điều kiện.</p>
            ) : (
              <div className="table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Người dùng</th>
                      <th>Gói</th>
                      <th>Hết hạn</th>
                      <th>Đăng nhập</th>
                      <th>Ngày tạo</th>
                      <th className="align-right">Đã trả</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleUsers.map((row) => (
                      // Cả dòng là nút mở chi tiết. Dùng tabIndex + onKeyDown
                      // thay vì bọc <button> trong <td> để bàn phím cũng mở
                      // được mà không phá cấu trúc bảng.
                      <tr
                        key={row.id}
                        className="row-clickable"
                        tabIndex={0}
                        role="button"
                        aria-label={`Xem gói của ${row.fullName || row.email}`}
                        onClick={() => setOpenUserId(row.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setOpenUserId(row.id);
                          }
                        }}
                      >
                        <td>
                          <span className="cell-strong">
                            {row.fullName || "(chưa đặt tên)"}
                            {row.role === "admin" && (
                              <span className="badge tone-teal">Admin</span>
                            )}
                          </span>
                          <span className="cell-sub">
                            {row.email}
                            {!row.confirmed && " · chưa xác thực"}
                          </span>
                        </td>
                        <td>
                          <PlanBadge plan={row.plan} />
                        </td>
                        <td>
                          {row.plan === "monthly" || row.plan === "yearly"
                            ? row.expiresAt
                              ? formatDate(row.expiresAt)
                              : "Không giới hạn"
                            : "—"}
                        </td>
                        <td>{row.provider === "google" ? "Google" : "Email"}</td>
                        <td>{formatDate(row.createdAt)}</td>
                        <td className="align-right">
                          {row.paidTotalVnd > 0 ? currency.format(row.paidTotalVnd) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="admin-foot">
            Cập nhật lúc {formatDateTime(stats.generatedAt)}
          </p>
        </>
      )}

      {openUserId && (
        <UserDetail
          userId={openUserId}
          onClose={() => setOpenUserId(null)}
          // Sửa key không đổi số liệu nào ở ngoài nên không cần tải lại cả
          // trang; giữ hook này để sau có thêm thao tác khác thì nối vào.
          onKeyChanged={undefined}
        />
      )}
    </div>
  );
}
