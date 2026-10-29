// Nơi điều hướng tới sau khi đăng nhập thành công (dùng chung cho đăng nhập
// bằng mật khẩu và bằng Google).
//
// `from` là đường dẫn người dùng muốn vào trước khi bị ProtectedRoute hoặc
// AdminRoute chặn. Nếu có thì ưu tiên nó — admin bấm vào /checkout/... vẫn tới
// đúng chỗ đó. Không có thì admin về trang quản trị, người dùng thường về
// trang tài khoản.

// Đường dẫn chỉ admin vào được.
const ADMIN_ONLY = ['/admin'];

const isAdminOnly = (path) =>
  ADMIN_ONLY.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

// `from` được trình duyệt giữ lại (history state của react-router, và
// sessionStorage trong luồng Google), nên nó có thể là của lần truy cập trước
// hoặc của người dùng khác trong cùng tab. Chỉ nhận đường dẫn nội bộ, và bỏ
// qua nếu người đăng nhập không có quyền vào đó.
const safeFrom = (from, isAdmin) => {
  if (typeof from !== 'string') return null;
  // '//host' bị trình duyệt hiểu là URL tuyệt đối sang domain khác.
  if (!from.startsWith('/') || from.startsWith('//')) return null;
  if (!isAdmin && isAdminOnly(from)) return null;
  return from;
};

export function landingPath(profile, from) {
  const isAdmin = profile?.role === 'admin';
  // Người dùng thường mở /admin khi chưa đăng nhập sẽ bị đẩy về /login kèm
  // from='/admin'; nếu tin from thì họ đăng nhập xong lại rơi vào trang quản
  // trị và chỉ thấy thông báo không có quyền.
  return safeFrom(from, isAdmin) ?? (isAdmin ? '/admin' : '/profile');
}
