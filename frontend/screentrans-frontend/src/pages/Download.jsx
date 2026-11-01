import { Link } from "react-router-dom";
import { Laptop, CircleHelp, Download, UserRound } from "lucide-react";
import release from "../desktop-release.json";

export default function DownloadPage() {
  const available = release.published && release.url?.startsWith("https://github.com/Byming1/screentrans-promotion/releases/download/");
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
            <span className="pill">Windows x64 · {release.channel} {release.version}</span>
            <h2>ScreenTrans Desktop</h2>
            <p>
              Windows 10 (build {release.minimumWindowsBuild} trở lên) hoặc Windows 11,
              bộ xử lý Intel / AMD 64-bit. Bộ cài {(release.bytes / 1024 / 1024).toFixed(1)} MB.
            </p>
            <div className="notice">
              <CircleHelp size={19} />
              <span>
                Bản beta{!release.signed ? " chưa ký số" : ""}.
                {release.nativeWindowsTestSummary || (!release.nativeWindowsTested && " Chưa kiểm thử capture/overlay trên Windows thật.")}
                {release.loginMode === "activation-code" && " Phiên bản này vẫn cần mã kích hoạt."}
              </span>
            </div>
            {available ? (
              <a className="btn btn-primary" href={release.url}>
                <Download size={17} /> Tải bộ cài {release.version}
              </a>
            ) : (
              <button className="btn btn-primary" disabled>
                <Download size={17} /> Chưa công bố bộ cài
              </button>
            )}
            <Link className="btn btn-outline" to="/register">
              <UserRound size={17} /> Tạo tài khoản
            </Link>
            <p className="fine-print download-checksum">SHA-256: <code>{release.sha256}</code></p>
          </div>
        </div>
      </section>
    </>
  );
}
