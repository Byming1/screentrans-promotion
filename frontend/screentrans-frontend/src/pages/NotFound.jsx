import { Link } from 'react-router-dom';
export default function NotFound() { return <div className="container missing"><h1>Không tìm thấy trang</h1><Link className="btn btn-primary" to="/">Quay về trang chủ</Link></div>; }
