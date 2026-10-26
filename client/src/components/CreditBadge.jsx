import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatMoney } from '../lib/labels.js';
import { Chip } from './ui.jsx';

// `emptyText`: qué mostrar si el cliente no tiene saldo (por defecto, nada).
export default function CreditBadge({ doc, emptyText = null }) {
  const [credit, setCredit] = useState(null);
  const digits = String(doc ?? '').replace(/\D/g, '');
  useEffect(() => {
    let alive = true;
    setCredit(null);
    if (digits.length < 7) return undefined;
    api(`/credits?doc=${digits}`).then((r) => alive && setCredit(r)).catch(() => {});
    return () => { alive = false; };
  }, [digits]);
  if (!credit?.balance) return credit && emptyText ? <Chip>{emptyText}</Chip> : null;
  const first = credit.credits?.[0];
  const raw = first?.expiresAt;
  const date = raw ? new Date(raw._seconds ? raw._seconds * 1000 : raw) : null;
  const due = date && !Number.isNaN(date.getTime())
    ? `vence ${date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}`
    : 'sin vencimiento';
  return <Chip tone="done">Tiene {formatMoney(credit.balance)} a favor ({due})</Chip>;
}
