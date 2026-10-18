import { Link } from 'react-router-dom';
import { ArrowRight, Check, Download, Sparkles, ChevronRight, Zap } from 'lucide-react';
import { logo } from '../constants/brand';
import WindowPreview from '../components/common/WindowPreview';
import SectionTitle from '../components/common/SectionTitle';
import FeatureGrid from '../components/common/FeatureGrid';
import HowItWorks from '../components/common/HowItWorks';
import CTA from '../components/common/CTA';
export default function Home() {
  return <><section className="hero"><div className="container hero-grid"><div className="hero-copy">
    <div className="pill"><Sparkles size={15}/> Trợ lý dịch màn hình với AI</div>
    <h1>Hiểu mọi nội dung.<br/><span>Ngay trên màn hình.</span></h1>
    <p>ScreenTrans giúp bạn dịch văn bản trong game, truyện tranh và website sang tiếng Việt — hiển thị trực tiếp bằng lớp phủ thông minh.</p>
    <div className="hero-actions"><Link className="btn btn-primary btn-lg" to="/download"><Download size={18}/> Tải cho Windows</Link><Link className="btn btn-outline btn-lg" to="/features">Khám phá tính năng <ArrowRight size={18}/></Link></div>
    <div className="hero-points"><span><Check size={16}/> Hỗ trợ Windows</span><span><Check size={16}/> OCR + AI Translation</span><span><Check size={16}/> Overlay trực tiếp</span></div>
  </div><div className="hero-visual"><div className="hero-orb orb-one"/><div className="hero-orb orb-two"/><div className="logo-float"><img src={logo} alt="Biểu tượng ứng dụng ScreenTrans" /></div><WindowPreview /><div className="floating-note"><Zap size={16}/> Dịch ngay trên ứng dụng</div></div></div></section>
  <section className="section"><div className="container"><SectionTitle eyebrow="VÌ SAO LÀ SCREENTRANS?" title="Một ứng dụng, nhiều trải nghiệm" subtitle="Không cần sao chép từng đoạn văn bản hay liên tục chuyển qua công cụ dịch khác."/><FeatureGrid limit={3}/><div className="section-more"><Link to="/features">Xem tất cả tính năng <ChevronRight size={17}/></Link></div></div></section>
  <HowItWorks/><section className="section"><div className="container split-section"><div><span className="eyebrow">TRẢI NGHIỆM LIỀN MẠCH</span><h2>Bản dịch ở đúng nơi bạn cần</h2><p>ScreenTrans sử dụng nhận diện chữ và dịch thuật AI để đặt bản dịch tại vùng nội dung gốc. Lớp phủ hỗ trợ xuyên chuột, giúp bạn tiếp tục tương tác với cửa sổ đang sử dụng.</p><Link to="/features" className="text-link">Tìm hiểu công nghệ <ArrowRight size={17}/></Link></div><div className="split-preview"><WindowPreview/></div></div></section><CTA/></>;
}
