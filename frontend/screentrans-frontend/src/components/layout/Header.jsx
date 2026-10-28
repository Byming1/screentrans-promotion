import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Download, Menu, X } from 'lucide-react';
import Brand from './Brand';
import { useAuth } from '../../contexts/AuthContext';

export default function Header() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = [ { to: '/', label: 'Trang chủ', end: true }, { to: '/features', label: 'Tính năng' }, { to: '/pricing', label: 'Bảng giá' }, { to: '/download', label: 'Tải xuống' } ];
  function signOut() { logout(); setOpen(false); navigate('/'); }
  return <header className="site-header"><div className="container nav-wrap"><Brand />
    <button className="mobile-menu" type="button" onClick={() => setOpen(!open)} aria-label={open ? 'Đóng menu' : 'Mở menu'} aria-expanded={open}>{open ? <X size={22}/> : <Menu size={22}/>}</button>
    <nav className={open ? 'nav-links open' : 'nav-links'} aria-label="Điều hướng chính">
      {links.map(({ to, label, end }) => <NavLink key={to} end={end} to={to} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>{label}</NavLink>)}
      {user ? <><Link className="nav-login" to="/profile" onClick={() => setOpen(false)}>Tài khoản</Link><button type="button" className="nav-login nav-signout" onClick={signOut}>Đăng xuất</button></> : <><Link className="nav-login" to="/login" onClick={() => setOpen(false)}>Đăng nhập</Link><Link className="btn btn-outline nav-register" to="/register" onClick={() => setOpen(false)}>Đăng ký</Link></>}
      <Link className="btn btn-primary nav-cta" to="/download" onClick={() => setOpen(false)}><Download size={16}/> Tải ứng dụng</Link>
    </nav>
  </div></header>;
}
