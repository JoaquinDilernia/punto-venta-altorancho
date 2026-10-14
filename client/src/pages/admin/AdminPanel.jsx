import { useState } from 'react';
import { getSession } from '../../lib/session.js';
import SidebarShell from '../../components/SidebarShell.jsx';
import AdminStatsView from './AdminStatsView.jsx';
import AdminHistoryView from './AdminHistoryView.jsx';
import CashSessionsView from './CashSessionsView.jsx';
import PromotionsView from './PromotionsView.jsx';
import PaymentMethodsView from './PaymentMethodsView.jsx';
import UsersView from './UsersView.jsx';
import LocalesView from './LocalesView.jsx';
import SettingsView from './SettingsView.jsx';

const ITEMS = [
  { value: 'estadisticas', label: 'Estadísticas' },
  { value: 'historial', label: 'Historial' },
  { value: 'cajas', label: 'Cajas' },
  { value: 'promociones', label: 'Promociones' },
  { value: 'medios', label: 'Medios de pago' },
  { value: 'usuarios', label: 'Usuarios' },
  { value: 'locales', label: 'Locales' },
  { value: 'ajustes', label: 'Ajustes' },
];

const VIEWS = {
  estadisticas: AdminStatsView,
  historial: AdminHistoryView,
  cajas: CashSessionsView,
  promociones: PromotionsView,
  medios: PaymentMethodsView,
  usuarios: UsersView,
  locales: LocalesView,
  ajustes: SettingsView,
};

export default function AdminPanel() {
  const user = getSession('admin')?.user;
  const [view, setView] = useState('estadisticas');
  const View = VIEWS[view];
  return (
    <SidebarShell panel="admin" userName={user?.name} items={ITEMS} active={view} onSelect={setView}>
      <View key={view} />
    </SidebarShell>
  );
}
