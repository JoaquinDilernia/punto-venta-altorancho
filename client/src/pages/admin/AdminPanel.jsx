import { getSession } from '../../lib/session.js';
import SidebarShell from '../../components/SidebarShell.jsx';
import { EmptyState } from '../../components/ui.jsx';

// Placeholder: las secciones reales llegan en la Task 19.
const ITEMS = [{ value: 'inicio', label: 'Inicio' }];

export default function AdminPanel() {
  const user = getSession('admin')?.user;
  return (
    <SidebarShell panel="admin" userName={user?.name} items={ITEMS} active="inicio" onSelect={() => {}}>
      <EmptyState title="En construcción" />
    </SidebarShell>
  );
}
