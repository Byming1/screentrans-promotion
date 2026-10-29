import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { finishGoogleLogin } = useAuth();
  const [requestError, setRequestError] = useState('');
  // StrictMode mount component hai lần ở môi trường dev; authorization code
  // chỉ dùng được một lần nên phải chặn lần gọi thứ hai.
  const started = useRef(false);

  const code = params.get('code');
  // Google/Supabase trả lỗi qua query string khi người dùng bấm huỷ hoặc khi
  // provider chưa được cấu hình đúng.
  const providerError = params.get('error_description') || params.get('error');

  useEffect(() => {
    if (!code || providerError || started.current) return;
    started.current = true;

    finishGoogleLogin(code)
      .then((from) => navigate(from, { replace: true }))
      .catch((err) => setRequestError(err.response ? errorMessage(err) : err.message));
  }, [code, providerError, finishGoogleLogin, navigate]);

  const error = providerError
    || (code ? requestError : 'Liên kết đăng nhập không hợp lệ hoặc thiếu thông tin.');

  if (error) {
    return <section className="auth-section"><div className="auth-box">
      <h1>Đăng nhập không thành công</h1>
      <p className="form-message error" role="alert">{error}</p>
      <Link className="btn btn-primary full" to="/login">Về trang đăng nhập</Link>
    </div></section>;
  }

  return <section className="auth-section"><div className="auth-box">
    <h1>Đang đăng nhập...</h1>
    <p role="status">Vui lòng đợi trong giây lát.</p>
  </div></section>;
}
