// Nơi điều hướng tới sau khi đăng nhập thành công (dùng chung cho đăng nhập
// bằng mật khẩu và bằng Google).
//
// `from` là đường dẫn người dùng muốn vào trước khi bị ProtectedRoute chặn.
// Nếu có thì ưu tiên nó — admin bấm vào /checkout/... vẫn tới đúng chỗ đó.
// Không có thì admin về trang quản trị, người dùng thường về trang tài khoản.
export function landingPath(profile, from) {
  if (from) return from;
  return profile?.role === 'admin' ? '/admin' : '/profile';
}
