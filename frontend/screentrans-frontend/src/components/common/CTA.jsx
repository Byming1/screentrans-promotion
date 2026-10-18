import { Link } from 'react-router-dom';
import { ArrowRight, Download } from 'lucide-react';
export default function CTA() {
  return <section className="container"><div className="cta-panel"><div><span className="eyebrow light">SẴN SÀNG TRẢI NGHIỆM?</span><h2>Khám phá thế giới không còn rào cản ngôn ngữ</h2><p>Tải ScreenTrans cho Windows và trải nghiệm dịch thuật trực tiếp trên màn hình.</p></div><Link className="btn btn-white" to="/download"><Download size={18}/> Đến trang tải xuống <ArrowRight size={17}/></Link></div></section>;
}
