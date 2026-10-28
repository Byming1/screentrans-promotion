import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../services/auth';
import { errorMessage } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function AuthConfirm() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { adoptSession } = useAuth();
  const [requestError, setRequestError] = useState('');
  // StrictMode mount component hai lần ở môi trường dev; token_hash chỉ dùng
  // được một lần nên phải chặn lần gọi thứ hai.
  const started = useRef(false);

  const tokenHash = params.get('token_hash');
  const type = params.get('type');

  useEffect(() => {
    if (!tokenHash || started.current) return;
    started.current = true;

    authApi.confirmEmail({ tokenHash, type })
      .then(async ({ data }) => {
        await adoptSession({ accessToken: data.session.access_token, user: data.user });
        navigate('/profile', { replace: true });
      })
      .catch((err) => setRequestError(errorMessage(err)));
  }, [tokenHash, type, adoptSession, navigate]);

  const error = tokenHash
    ? requestError
    : 'Liên kết xác thực không hợp lệ hoặc thiếu thông tin.';

  if (error) {
    return <section className="auth-section"><div className="auth-box">
      <h1>Xác thực không thành công</h1>
      <p className="form-message error" role="alert">{error}</p>
      <Link className="btn btn-primary full" to="/login">Về trang đăng nhập</Link>
    </div></section>;
  }

  return <section className="auth-section"><div className="auth-box">
    <h1>Đang xác thực email...</h1>
    <p role="status">Vui lòng đợi trong giây lát.</p>
  </div></section>;
}
