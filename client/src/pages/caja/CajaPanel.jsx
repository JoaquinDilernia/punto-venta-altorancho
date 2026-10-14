import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { getSession } from '../../lib/session.js';
import SidebarShell from '../../components/SidebarShell.jsx';
import { Notice } from '../../components/ui.jsx';
import QueueView from './QueueView.jsx';
import OrderDetail from './OrderDetail.jsx';
import NewOrderView from './NewOrderView.jsx';
import CashDayView from './CashDayView.jsx';
import HistoryView from './HistoryView.jsx';
import ProductsView from './ProductsView.jsx';

const REFRESH_MS = 15 * 1000;
const LOCAL_KEY = 'pos_caja_local';
const isAdminRole = (role) => role === 'admin' || role === 'superadmin';
const BACK_LABELS = { pedidos: 'Volver a pedidos', historial: 'Volver al historial' };

export default function CajaPanel() {
  const user = getSession('caja')?.user;
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState('');
  const [view, setView] = useState('pedidos');
  const [orderId, setOrderId] = useState(null); // pedido abierto en "pedidos" o "historial"
  const [queue, setQueue] = useState([]);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [queueError, setQueueError] = useState('');
  const [chosenLocal, setChosenLocal] = useState(() => localStorage.getItem(LOCAL_KEY));
  const seq = useRef(0);

  // Admin: elige el local (se recuerda). Caja: siempre el suyo y no se manda localId.
  const admin = isAdminRole(user?.role);
  const locales = config?.locales ?? [];
  const localId = admin
    ? (locales.some((l) => l.id === chosenLocal) ? chosenLocal : (locales[0]?.id ?? null))
    : (user?.localId ?? null);
  const scope = admin ? localId : null; // lo que viaja al backend

  useEffect(() => {
    let alive = true;
    api('/config')
      .then((cfg) => alive && setConfig(cfg))
      .catch((err) => alive && setConfigError(err.message));
    return () => { alive = false; };
  }, []);

  // La cola se refresca cada 15 s y al volver a la pestaña; sólo vale la última respuesta.
  const loadQueue = useCallback(async () => {
    const id = ++seq.current;
    try {
      const found = await api(`/orders/queue${scope ? `?localId=${encodeURIComponent(scope)}` : ''}`);
      if (id !== seq.current) return;
      setQueue(found);
      setQueueError('');
    } catch (err) {
      if (id === seq.current) setQueueError(`No se pudo cargar la cola: ${err.message}`);
    } finally {
      if (id === seq.current) setQueueLoaded(true);
    }
  }, [scope]);

  useEffect(() => {
    loadQueue();
    const interval = setInterval(loadQueue, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') loadQueue(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', loadQueue);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', loadQueue);
    };
  }, [loadQueue]);

  function chooseLocal(id) {
    localStorage.setItem(LOCAL_KEY, id);
    setChosenLocal(id);
    setQueue([]);
    setQueueLoaded(false);
    setOrderId(null);
  }
  function select(next) {
    setView(next);
    setOrderId(null);
  }
  function openOrder(nextView, id) {
    setView(nextView);
    setOrderId(id);
  }

  const localName = locales.find((l) => l.id === localId)?.name;
  const items = [
    { value: 'pedidos', label: 'Pedidos', badge: queue.length },
    { value: 'nuevo', label: 'Nuevo pedido' },
    { value: 'caja', label: 'Caja del día' },
    { value: 'historial', label: 'Historial' },
    { value: 'productos', label: 'Productos' },
  ];

  let body;
  if (configError) body = <Notice kind="error">{`No se pudo cargar la configuración: ${configError}`}</Notice>;
  else if (!config) body = <p>Cargando…</p>;
  else if (!localId) body = <Notice kind="error">Tu usuario no tiene un local asignado.</Notice>;
  else {
    const detail = orderId && (view === 'pedidos' || view === 'historial');
    body = (
      <div key={localId}>
        {detail && (
          <OrderDetail
            key={orderId}
            localId={localId}
            orderId={orderId}
            config={config}
            backLabel={BACK_LABELS[view]}
            onBack={() => setOrderId(null)}
            onGoCash={() => select('caja')}
            onChanged={loadQueue}
          />
        )}
        {view === 'pedidos' && !orderId && (
          <QueueView queue={queue} loaded={queueLoaded} error={queueError} onRefresh={loadQueue} onOpen={(id) => openOrder('pedidos', id)} />
        )}
        {/* Siempre montado: conserva el carrito y lo tipeado al cambiar de sección. */}
        <div hidden={view !== 'nuevo'}>
          <NewOrderView config={config} localId={localId} scope={scope} onSubmitted={(id) => { loadQueue(); openOrder('pedidos', id); }} />
        </div>
        {view === 'caja' && <CashDayView config={config} scope={scope} />}
        {view === 'historial' && !orderId && <HistoryView config={config} scope={scope} onOpen={(id) => openOrder('historial', id)} />}
        {view === 'productos' && <ProductsView config={config} scope={scope} />}
      </div>
    );
  }

  return (
    <SidebarShell panel="caja" subtitle={localName} userName={user?.name} items={items} active={view} onSelect={select} extra={admin && locales.length > 0 && (
      <label className="field" style={{ padding: '0 6px' }}>
        <span className="field-label">Local</span>
        <select className="select select-sm" value={localId ?? ''} onChange={(e) => chooseLocal(e.target.value)}>
          {locales.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
    )}>
      {body}
    </SidebarShell>
  );
}
