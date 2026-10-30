import SectionTitle from './SectionTitle';

// Video demo host trên Cloudinary, không nằm trong repo: file 27MB nếu commit
// sẽ phình lịch sử git vĩnh viễn và mỗi lần clone đều phải tải lại. Cloudinary
// cũng tự transcode và phát qua CDN, nhẹ hơn nhiều so với bắt Vercel serve
// một file mp4 thô.
//
// Đặt VITE_DEMO_VIDEO_URL để trỏ tới video; thiếu biến này thì cả section ẩn
// đi, trang chủ vẫn chạy bình thường (xem Home.jsx).
const DEMO_SRC = import.meta.env.VITE_DEMO_VIDEO_URL;

// Ảnh poster: Cloudinary sinh thumbnail bằng cách đổi đuôi `.mp4` thành `.jpg`
// trên cùng URL. Chỉ làm vậy với URL của Cloudinary để không tạo link chết khi
// video được host ở nơi khác.
const posterFor = (src) =>
  /res\.cloudinary\.com/.test(src) && src.endsWith('.mp4')
    ? `${src.slice(0, -4)}.jpg`
    : undefined;

export default function DemoVideo() {
  if (!DEMO_SRC) return null;

  return (
    <section className="section section-tint">
      <div className="container">
        <SectionTitle
          eyebrow="XEM THỬ"
          title="ScreenTrans hoạt động thế nào?"
          subtitle="Một phút để thấy toàn bộ quy trình: chọn cửa sổ, nhận diện văn bản và đọc bản dịch ngay tại chỗ."
        />
        <div className="demo-frame">
          {/*
            Không autoplay: video nặng nên chỉ tải khi người dùng thực sự bấm
            phát. preload="metadata" đủ để trình duyệt biết thời lượng và dựng
            thanh điều khiển, không kéo cả file.
          */}
          <video
            controls
            playsInline
            preload="metadata"
            poster={posterFor(DEMO_SRC)}
          >
            <source src={DEMO_SRC} type="video/mp4" />
            Trình duyệt của bạn không phát được video này.{' '}
            <a href={DEMO_SRC}>Tải video demo</a>.
          </video>
        </div>
      </div>
    </section>
  );
}
