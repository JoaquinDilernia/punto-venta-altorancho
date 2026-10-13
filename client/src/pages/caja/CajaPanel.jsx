import { getSession } from '../../lib/session.js';
import SidebarShell from '../../components/SidebarShell.jsx';
import { EmptyState } from '../../components/ui.jsx';

// Placeholder: las secciones reales llegan en la Task 18.
const ITEMS = [{ value: 'inicio', label: 'Inicio' }];

export default function CajaPanel() {
  const user = getSession('caja')?.user;
  return (
    <SidebarShell panel="caja" userName={user?.name} items={ITEMS} active="inicio" onSelect={() => {}}>
      <EmptyState title="En construcción" />
    </SidebarShell>
  );
}
