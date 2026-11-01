import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, LockKeyhole, UserRound } from 'lucide-react';
import { logo } from '../../constants/brand';
import { authApi } from '../../services/auth';
import { errorMessage, errorCode } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { landingPath } from '../../utils/authRedirect';

// Logo Google theo đúng màu thương hiệu; lucide-react không có icon này.
function GoogleIcon() {
  return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2.1 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.3z"/>
    <path fill="#34A853" d="M24 46c6 0 11-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.4v5.7C8 41.1 15.4 46 24 46z"/>
    <path fill="#FBBC05" d="M11.7 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.4C2.9 17.1 2 20.4 2 24s.9 6.9 2.4 9.9l7.3-5.7z"/>
    <path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 8 6.9 4.4 14.1l7.3 5.7c1.7-5.2 6.6-9 12.3-9z"/>
  </svg>;
}

export default function AuthForm({ mode }) {
  const register = mode === 'register';
  const navigate = useNavigate();
  const location = useLocation();
  const { login, startGoogleLogin } = useAuth();
  const [values, setValues] = useState({ fullName: '', email: '', password: '', confirmPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const update = (key) => (event) => setValues((prev) => ({ ...prev, [key]: event.target.value }));
  // Đánh dấu đang chờ chuyển trang sang Google, để biết có nên mở lại nút khi
  // người dùng quay lại trang này hay không.
  const redirecting = useRef(false);

  // Khi chuyển sang Google, trang này có thể được trình duyệt giữ trong bfcache.
  // Nếu người dùng bấm Back / thoát giữa lúc chọn tài khoản, trang quay lại với
  // state cũ nên `busy` vẫn bật và nút bị vô hiệu hoá mãi. Mở lại nút khi trang
  // được hiển thị trở lại (pageshow khi phục hồi, hoặc tab/trang hiện lại).
  useEffect(() => {
    const release = () => {
      if (!redirecting.current) return; // tránh mở nút khi form mật khẩu đang gửi
      redirecting.current = false;
      setBusy(false);
    };
    const onPageShow = (event) => { if (event.persisted) release(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') release(); };
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('popstate', release);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('popstate', release);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const handleResend = async () => {
    setError(''); setSuccess(''); setBusy(true);
    try {
      const { data } = await authApi.resendConfirmation({ email: values.email.trim() });
      setSuccess(data.message);
      setNeedsConfirmation(false);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };

  const handleGoogleLogin = async () => {
    setError(''); setSuccess(''); setNeedsConfirmation(false); setAlreadyRegistered(false); setBusy(true);
    redirecting.current = true;
    try {
      // Thành công thì trang chuyển sang Google, không cần tắt busy.
      await startGoogleLogin(location.state?.from);
    } catch (err) {
      setError(err.response ? errorMessage(err) : err.message);
      redirecting.current = false;
      setBusy(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(''); setSuccess(''); setNeedsConfirmation(false); setAlreadyRegistered(false);
    if (register && values.fullName.trim().length < 2) { setError('Vui lòng nhập họ tên hợp lệ.'); return; }
    if (register && values.password !== values.confirmPassword) { setError('Mật khẩu xác nhận không khớp.'); return; }
    if (register && values.password.length < 8) { setError('Mật khẩu phải có ít nhất 8 ký tự.'); return; }
    setBusy(true);
    try {
      const credentials = { email: values.email.trim(), password: values.password };
      if (register) {
        const { data } = await authApi.register({ ...credentials, fullName: values.fullName.trim() });
        setSuccess(data.emailConfirmationRequired
          ? 'Đã gửi yêu cầu đăng ký. Hãy kiểm tra email để xác nhận tài khoản trước khi đăng nhập.'
          : 'Đăng ký thành công! Bạn có thể đăng nhập.');
        setValues((prev) => ({ ...prev, password: '', confirmPassword: '' }));
      } else {
        const { profile } = await login(credentials);
        navigate(landingPath(profile, location.state?.from), { replace: true });
      }
    } catch (err) {
      setError(errorMessage(err));
      const code = errorCode(err);
      if (code === 'email_not_confirmed') setNeedsConfirmation(true);
      if (code === 'email_already_registered') setAlreadyRegistered(true);
    }
    finally { setBusy(false); }
  };

  return <section className="auth-section"><div className="auth-box">
    <div className="auth-logo"><img src={logo} alt="ScreenTrans" /></div>
    <h1>{register ? 'Tạo tài khoản' : 'Chào mừng trở lại!'}</h1>
    <p>{register ? 'Đăng ký tài khoản ScreenTrans.' : 'Đăng nhập tài khoản ScreenTrans của bạn.'}</p>
    <form onSubmit={handleSubmit}>
      {register && <label>Họ và tên<div className="input-wrap"><UserRound size={18}/><input value={values.fullName} onChange={update('fullName')} placeholder="Nhập họ tên" autoComplete="name" required minLength={2}/></div></label>}
      <label>Email<div className="input-wrap"><Mail size={18}/><input type="email" value={values.email} onChange={update('email')} placeholder="you@example.com" autoComplete="email" required/></div></label>
      <label>Mật khẩu<div className="input-wrap"><LockKeyhole size={18}/><input type="password" value={values.password} onChange={update('password')} placeholder="Tối thiểu 8 ký tự" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 8 : undefined}/></div></label>
      {register && <label>Xác nhận mật khẩu<div className="input-wrap"><LockKeyhole size={18}/><input type="password" value={values.confirmPassword} onChange={update('confirmPassword')} autoComplete="new-password" required minLength={8}/></div></label>}
      {error && <p className="form-message error" role="alert">{error}</p>}
      {needsConfirmation && <button className="btn btn-outline full" disabled={busy} type="button" onClick={handleResend}>Gửi lại email xác thực</button>}
      {alreadyRegistered && <Link className="btn btn-outline full" to="/login" state={location.state}>Đăng nhập ngay</Link>}
      {success && <p className="form-message success" role="status">{success}</p>}
      <button className="btn btn-primary full" disabled={busy} type="submit">{busy ? 'Đang xử lý...' : register ? 'Đăng ký' : 'Đăng nhập'}</button>
    </form>
    <div className="auth-divider"><span>hoặc</span></div>
    <button className="btn btn-outline full auth-google" disabled={busy} type="button" onClick={handleGoogleLogin}>
      <GoogleIcon /> {register ? 'Đăng ký với Google' : 'Đăng nhập với Google'}
    </button>
    <p className="auth-alt">{register ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'} <Link to={register ? '/login' : '/register'} state={location.state}>{register ? 'Đăng nhập' : 'Đăng ký'}</Link></p>
  </div></section>;
}
