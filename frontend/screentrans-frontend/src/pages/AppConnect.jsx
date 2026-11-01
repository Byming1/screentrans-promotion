import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Laptop, Check, X, LogIn, UserRound } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { api, errorMessage } from "../services/api";

export default function AppConnect() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get("user_code") || "");
  const [request, setRequest] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const from = `/app/connect?user_code=${encodeURIComponent(code)}`;
  const valid = /^[A-Z2-7]{4}-[A-Z2-7]{4}$/.test(code);
  useEffect(() => {
    if (!user || !valid) return;
    let active = true;
    api.get("/desktop/request", { params: { user_code: code } }).then(({ data }) => {
      if (active) { setRequest(data); setError(""); }
    }).catch((err) => { if (active) setError(errorMessage(err)); });
    return () => { active = false; };
  }, [user, code, valid]);
  async function decide(approve) {
    setBusy(true); setError("");
    try {
      await api.post("/desktop/approve", { user_code: code, approve });
      setResult(approve ? "Thiết bị đã được xác nhận. Bạn có thể quay lại ScreenTrans." : "Đã từ chối thiết bị.");
      setRequest(null);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <section className="auth-section"><div className="auth-box">
    <Laptop size={36} aria-hidden="true" />
    <h1>Đăng nhập ScreenTrans Desktop</h1>
    {loading ? <p role="status">Đang xác thực...</p> : !user ? <>
      <Link className="btn btn-primary full" to="/login" state={{ from }}><LogIn size={18} /> Đăng nhập</Link>
      <Link className="btn btn-outline full" to="/register" state={{ from }}><UserRound size={18} /> Tạo tài khoản</Link>
    </> : <>
      <p>{user.email}</p>
      <label>Mã thiết bị<input className="desktop-device-code" value={code} maxLength={9}
        onChange={(event) => { setCode(event.target.value.toUpperCase()); setRequest(null); setResult(""); setError(""); }}
        placeholder="XXXX-XXXX" autoComplete="off" spellCheck={false} /></label>
      {request && !result && <>
        <p><strong>{request.device_name}</strong></p>
        <p>Chỉ xác nhận nếu bạn vừa yêu cầu đăng nhập trên thiết bị này.</p>
        <button className="btn btn-primary full" disabled={busy || !valid} onClick={() => decide(true)}><Check size={18} /> Cho phép đăng nhập</button>
        <button className="btn btn-outline full" disabled={busy} onClick={() => decide(false)}><X size={18} /> Từ chối</button>
      </>}
      {!valid && <p>Nhập mã thiết bị hợp lệ.</p>}
      {result && <p className="form-message success" role="status">{result}</p>}
      {error && <p className="form-message error" role="alert">{error}</p>}
    </>}
  </div></section>;
}
