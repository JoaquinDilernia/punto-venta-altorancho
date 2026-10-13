import { Routes, Route, Navigate } from 'react-router-dom';
import { getSession } from './lib/session.js';
import VendedorLogin from './pages/VendedorLogin.jsx';
import VendedorPanel from './pages/VendedorPanel.jsx';
import StaffLogin from './pages/StaffLogin.jsx';
import CajaPanel from './pages/caja/CajaPanel.jsx';
import AdminPanel from './pages/admin/AdminPanel.jsx';

const hasSession = (role) => Boolean(getSession(role)?.token);

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/caja" replace />} />
      <Route path="/vendedor" element={hasSession('vendedor') ? <VendedorPanel /> : <VendedorLogin />} />
      <Route path="/caja" element={hasSession('caja') ? <CajaPanel /> : <StaffLogin role="caja" />} />
      <Route path="/admin" element={hasSession('admin') ? <AdminPanel /> : <StaffLogin role="admin" />} />
    </Routes>
  );
}
