import { Route, Routes } from 'react-router-dom';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import ProtectedRoute from './components/common/ProtectedRoute';
import Home from './pages/Home';
import Features from './pages/Features';
import Pricing from './pages/Pricing';
import Download from './pages/Download';
import Login from './pages/Login';
import Register from './pages/Register';
import AuthConfirm from './pages/AuthConfirm';
import Profile from './pages/Profile';
import Checkout from './pages/Checkout';
import NotFound from './pages/NotFound';

export default function App() {
  return <><Header/><main><Routes>
    <Route path="/" element={<Home/>}/><Route path="/features" element={<Features/>}/>
    <Route path="/pricing" element={<Pricing/>}/><Route path="/download" element={<Download/>}/>
    <Route path="/login" element={<Login/>}/><Route path="/register" element={<Register/>}/>
    <Route path="/auth/confirm" element={<AuthConfirm/>}/>
    <Route path="/profile" element={<ProtectedRoute><Profile/></ProtectedRoute>}/>
    <Route path="/checkout/:planCode" element={<ProtectedRoute><Checkout/></ProtectedRoute>}/>
    <Route path="*" element={<NotFound/>}/>
  </Routes></main><Footer/></>;
}
