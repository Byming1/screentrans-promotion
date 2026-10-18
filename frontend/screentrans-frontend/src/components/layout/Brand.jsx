import { Link } from 'react-router-dom';
import { logo } from '../../constants/brand';
export default function Brand() {
  return <Link className="brand" to="/" aria-label="ScreenTrans - trang chủ">
    <img src={logo} alt="Logo ScreenTrans" />
    <span>Screen<span className="brand-blue">Trans</span></span>
  </Link>;
}
