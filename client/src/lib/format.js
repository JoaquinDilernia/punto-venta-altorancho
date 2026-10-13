// Fechas del backend: los Timestamp de Firestore llegan como { _seconds, _nanoseconds }
// (o { seconds, nanoseconds }); también se aceptan ISO y milisegundos.
import { currentMonth } from './labels.js';

export function toMs(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  const seconds = value._seconds ?? value.seconds;
  if (seconds == null) return null;
  return seconds * 1000 + Math.floor((value._nanoseconds ?? value.nanoseconds ?? 0) / 1e6);
}

const TZ = 'America/Argentina/Buenos_Aires';
const dateTime = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
const time = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });

export const formatDateTime = (value) => { const ms = toMs(value); return ms == null ? '—' : dateTime.format(ms); };
export const formatTime = (value) => { const ms = toMs(value); return ms == null ? '—' : time.format(ms); };

// Mes actual y los `count - 1` anteriores: [{ value: '2026-10', label: 'octubre 2026' }].
export function monthOptions(count = 6) {
  const [year, month] = currentMonth().split('-').map(Number);
  const label = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    return { value: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, label: label.format(d) };
  });
}

export const round2 = (n) => Math.round(n * 100) / 100;
