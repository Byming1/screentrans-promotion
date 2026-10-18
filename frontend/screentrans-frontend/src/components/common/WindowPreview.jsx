import { ArrowRight, Languages, ScanText } from 'lucide-react';
export default function WindowPreview() {
  return <div className="preview-shell" aria-label="Minh họa bản dịch hiển thị đè lên nội dung trên màn hình">
    <div className="preview-toolbar"><div className="traffic"><i/><i/><i/></div><span>ScreenTrans • Translation Preview</span><span className="online-dot">● Trực tuyến</span></div>
    <div className="preview-body">
      <div className="preview-tag"><ScanText size={15}/> Đang nhận diện văn bản</div>
      <div className="bubble source">Welcome to your next adventure!</div>
      <div className="bubble translation"><span className="mini-tag"><Languages size={13} /> Bản dịch tiếng Việt</span><strong>Chào mừng đến với cuộc phiêu lưu tiếp theo của bạn!</strong></div>
      <div className="preview-foot"><span><span className="pulse-dot" /> Overlay đang bật</span><span>EN <ArrowRight size={12}/> VI</span></div>
    </div>
  </div>;
}
