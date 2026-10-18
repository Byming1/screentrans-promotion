import { Link } from "react-router-dom";
import { Laptop, CircleHelp, ArrowRight } from "lucide-react";
export default function DownloadPage() {
  return (
    <>
      <div className="page-top">
        <div className="container">
          <span className="eyebrow">TẢI XUỐNG</span>
          <h1>Bắt đầu với ScreenTrans trên Windows</h1>
          <p>
            Ứng dụng Windows kết nối đến máy chủ để nhận diện và dịch nội dung
            màn hình.
          </p>
        </div>
      </div>
      <section className="section">
        <div className="container download-wrap">
          <div className="download-icon">
            <Laptop size={54} />
          </div>
          <div>
            <span className="pill">Ứng dụng dành cho Windows</span>
            <h2>ScreenTrans Desktop</h2>
            <p>
              Trang này sẽ cung cấp bộ cài chính thức khi nhóm công bố bản phát
              hành. Hiện chưa cấu hình đường dẫn tải xuống.
            </p>
            <div className="notice">
              <CircleHelp size={19} /> Chưa có URL tải bản cài được xác minh.
            </div>
            <Link className="btn btn-primary" to="/">
              Về trang chủ <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
