import { useMemo, useState } from 'react';
import { formatMoney } from '../../lib/labels.js';
import { formatTime } from '../../lib/format.js';
import { EmptyState, Notice, OrderStatusChip } from '../../components/ui.jsx';
import { activeLinesOf } from './lineParts.jsx';
import styles from './caja.module.css';

// Cola de pedidos que mandaron los vendedores. La lista y su refresco (cada
// 15 s y al volver a la pestaña) viven en CajaPanel, que también la usa para el
// contador del menú.
export default function QueueView({ queue, loaded, error, onRefresh, onOpen }) {
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = queue.filter((o) => !q
      || (o.number ?? '').toLowerCase().includes(q)
      || (o.customer?.name ?? '').toLowerCase().includes(q)
      || (o.customer?.docNumber ?? '').includes(q));
    // Los "Con error" primero; el resto conserva el orden de envío.
    return [...matches.filter((o) => o.status === 'error'), ...matches.filter((o) => o.status !== 'error')];
  }, [queue, search]);

  return (
    <div className={styles.view}>
      <header className={styles.viewHead}>
        <h1 className={styles.viewTitle}>Pedidos en caja</h1>
        <div className={styles.toolbar}>
          <input className={`input ${styles.searchInput}`} type="search" placeholder="Buscar por número o cliente" aria-label="Buscar pedido" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="button" className="btn btn-secondary" onClick={onRefresh}>Actualizar</button>
        </div>
      </header>

      <Notice kind="error">{error}</Notice>
      {loaded && queue.length === 0 && <EmptyState title="No hay pedidos esperando">Cuando un vendedor mande un pedido a caja aparece acá.</EmptyState>}
      {loaded && queue.length > 0 && visible.length === 0 && <EmptyState title="Ningún pedido coincide con la búsqueda" />}

      <ul className={styles.queue}>
        {visible.map((o) => {
          const count = activeLinesOf(o).reduce((sum, l) => sum + l.qty, 0);
          return (
            <li key={o.id}>
              <button type="button" className={`${styles.queueItem} ${o.status === 'error' ? styles.queueError : ''}`} onClick={() => onOpen(o.id)}>
                <span className={`${styles.queueNumber} num`}>{o.number}</span>
                <span className={styles.queueMain}>
                  <strong>{o.customer?.name ?? 'Sin cliente'}</strong>
                  <span className={styles.muted}>{o.sellerName} · {count} {count === 1 ? 'producto' : 'productos'}</span>
                  {o.status === 'error' && o.errorDetail && <span className={styles.queueErrorText}>{o.errorDetail}</span>}
                </span>
                <span className={`${styles.muted} num`}>{formatTime(o.sentAt ?? o.createdAt)}</span>
                <span className={`${styles.queueAmount} num`}>{o.totals?.total != null ? formatMoney(o.totals.total) : ''}</span>
                <OrderStatusChip status={o.status} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
