import { Link } from 'react-router-dom';
import Brand from './Brand';
export default function Footer() {
  return <footer className="footer"><div className="container footer-grid">
    <div><Brand /><p>Biến rào cản ngôn ngữ thành trải nghiệm liền mạch — ngay trên màn hình của bạn.</p></div>
    <div><strong>Khám phá</strong><Link to="/features">Tính năng</Link><Link to="/pricing">Bảng giá</Link><Link to="/download">Tải ứng dụng</Link></div>
    <div><strong>Tài khoản</strong><Link to="/login">Đăng nhập</Link><Link to="/register">Đăng ký</Link></div>
  </div><div className="container copyright">© 2026 ScreenTrans. Website giới thiệu sản phẩm.</div></footer>;
}
