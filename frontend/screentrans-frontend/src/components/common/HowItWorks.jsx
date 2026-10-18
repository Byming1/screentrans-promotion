import { Monitor, Sparkles, Languages } from 'lucide-react';
import SectionTitle from './SectionTitle';
export default function HowItWorks() {
  const steps = [
    { n: '01', icon: Monitor, title: 'Chọn cửa sổ', desc: 'Chọn game, truyện hoặc website cần dịch và thiết lập vùng nhận diện.' },
    { n: '02', icon: Sparkles, title: 'AI xử lý', desc: 'ScreenTrans nhận diện văn bản bằng OCR và gửi nội dung tới hệ thống dịch.' },
    { n: '03', icon: Languages, title: 'Xem bản dịch', desc: 'Kết quả tiếng Việt xuất hiện ngay ở khu vực văn bản trên màn hình.' },
  ];
  return <section className="section section-tint"><div className="container"><SectionTitle eyebrow="ĐƠN GIẢN, THUẬN TIỆN" title="Chỉ 3 bước để bắt đầu" subtitle="Tập trung vào nội dung yêu thích, để ScreenTrans hỗ trợ phần ngôn ngữ." /><div className="steps">{steps.map(({ n, icon: Icon, title, desc }) => <div className="step" key={n}><span className="step-num">{n}</span><div className="step-icon"><Icon size={27}/></div><h3>{title}</h3><p>{desc}</p></div>)}</div></div></section>;
}
