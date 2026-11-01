import { Route, Routes } from 'react-router-dom';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import ProtectedRoute from './components/common/ProtectedRoute';
import AdminRoute from './components/common/AdminRoute';
import Home from './pages/Home';
import Features from './pages/Features';
import Pricing from './pages/Pricing';
import Download from './pages/Download';
import Login from './pages/Login';
import Register from './pages/Register';
import AuthConfirm from './pages/AuthConfirm';
import AuthCallback from './pages/AuthCallback';
import Profile from './pages/Profile';
import Checkout from './pages/Checkout';
import Admin from './pages/Admin';
import NotFound from './pages/NotFound';
import AppConnect from './pages/AppConnect';

// Trang quảng bá: có Header/Footer của người dùng thường.
function SiteLayout() {
  return <><Header/><main><Routes>
    <Route path="/" element={<Home/>}/><Route path="/features" element={<Features/>}/>
    <Route path="/pricing" element={<Pricing/>}/><Route path="/download" element={<Download/>}/>
    <Route path="/login" element={<Login/>}/><Route path="/register" element={<Register/>}/>
    <Route path="/auth/confirm" element={<AuthConfirm/>}/>
    <Route path="/auth/callback" element={<AuthCallback/>}/>
    <Route path="/app/connect" element={<AppConnect/>}/>
    <Route path="/profile" element={<ProtectedRoute><Profile/></ProtectedRoute>}/>
    <Route path="/checkout/:planCode" element={<ProtectedRoute><Checkout/></ProtectedRoute>}/>
    <Route path="*" element={<NotFound/>}/>
  </Routes></main><Footer/></>;
}

export default function App() {
  // /admin nằm ngoài SiteLayout: trang quản trị không dùng nav, CTA tải app hay
  // footer của trang quảng bá.
  return <Routes>
    <Route path="/admin" element={<AdminRoute><Admin/></AdminRoute>}/>
    <Route path="*" element={<SiteLayout/>}/>
  </Routes>;
}
