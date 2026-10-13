import { getSession } from '../lib/session.js';
import { AppHeader, EmptyState } from '../components/ui.jsx';

// Placeholder: se reescribe en la Task 17.
export default function VendedorPanel() {
  const user = getSession('vendedor')?.user;
  return (
    <>
      <AppHeader panel="vendedor" userName={user?.name} />
      <EmptyState title="En construcción" />
    </>
  );
}
