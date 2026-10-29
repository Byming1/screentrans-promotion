import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

// Chỉ là lớp chặn cho giao diện; quyền thật được backend kiểm tra ở mỗi
// request nên sửa role trong trình duyệt không lấy được dữ liệu.
export default function AdminRoute({ children }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="admin-shell" role="status">Đang xác thực...</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  if (profile?.role !== 'admin') {
    return <div className="admin-shell">
      <h1>Không có quyền truy cập</h1>
      <p className="form-message error" role="alert">Trang này chỉ dành cho quản trị viên.</p>
      <Link className="btn btn-outline" to="/">Về trang chủ</Link>
    </div>;
  }

  return children;
}
