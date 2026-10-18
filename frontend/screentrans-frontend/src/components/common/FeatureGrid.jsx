import { Gamepad2, BookOpen, Globe2, MousePointer2, ScanText, ShieldCheck } from 'lucide-react';
const features = [
  { icon: Gamepad2, title: 'Dịch trong game', desc: 'Hiểu hội thoại, nhiệm vụ và hướng dẫn bằng tiếng Việt khi chơi game.' },
  { icon: BookOpen, title: 'Đọc truyện dễ dàng', desc: 'Hỗ trợ đọc manga, manhwa và webtoon có nội dung ngoại ngữ.' },
  { icon: Globe2, title: 'Website & tài liệu', desc: 'Tiếp cận nội dung quốc tế mà không phải liên tục chuyển ứng dụng.' },
  { icon: MousePointer2, title: 'Overlay thuận tiện', desc: 'Bản dịch xuất hiện tại vị trí văn bản, hạn chế gián đoạn thao tác.' },
  { icon: ScanText, title: 'OCR kết hợp AI', desc: 'Nhận diện chữ từ hình ảnh rồi chuyển sang bản dịch tiếng Việt.' },
  { icon: ShieldCheck, title: 'Không cần cài model AI', desc: 'Quá trình xử lý AI thực hiện ở máy chủ, đơn giản hóa cài đặt.' },
];

export default function FeatureGrid({ limit }) {
  return <div className="feature-grid">{features.slice(0, limit ?? features.length).map(({ icon: Icon, title, desc }) => <div className="feature-card" key={title}><span className="icon-box"><Icon size={25} /></span><h3>{title}</h3><p>{desc}</p></div>)}</div>;
}
