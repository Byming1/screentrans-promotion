import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, LockKeyhole, UserRound } from 'lucide-react';
import { logo } from '../../constants/brand';
import { authApi } from '../../services/auth';
import { errorMessage, errorCode } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

export default function AuthForm({ mode }) {
  const register = mode === 'register';
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [values, setValues] = useState({ fullName: '', email: '', password: '', confirmPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const update = (key) => (event) => setValues((prev) => ({ ...prev, [key]: event.target.value }));

  const handleResend = async () => {
    setError(''); setSuccess(''); setBusy(true);
    try {
      const { data } = await authApi.resendConfirmation({ email: values.email.trim() });
      setSuccess(data.message);
      setNeedsConfirmation(false);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
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
        await login(credentials);
        navigate(location.state?.from || '/profile', { replace: true });
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
      {alreadyRegistered && <Link className="btn btn-outline full" to="/login">Đăng nhập ngay</Link>}
      {success && <p className="form-message success" role="status">{success}</p>}
      <button className="btn btn-primary full" disabled={busy} type="submit">{busy ? 'Đang xử lý...' : register ? 'Đăng ký' : 'Đăng nhập'}</button>
    </form>
    <p className="auth-alt">{register ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'} <Link to={register ? '/login' : '/register'}>{register ? 'Đăng nhập' : 'Đăng ký'}</Link></p>
  </div></section>;
}
