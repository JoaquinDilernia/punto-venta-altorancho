import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatMoney } from '../lib/labels.js';
import { SOURCE_LABELS, maxReturnable, defaultDestination, shortDate } from '../lib/returns.js';
import { Notice, EmptyState } from './ui.jsx';
import ProductSearch from './ProductSearch.jsx';
import styles from './ReturnPicker.module.css';

const MIN_CHARS = 3;
const OTHER = 'Otro';

// Hoja de "Devolver": cantidad, destino, motivo y valor de la línea.
function ReturnSheet({ line, config, locale, dialog, onConfirm, onCancel }) {
  const manual = line.source === 'manual';
  const cap = manual ? Infinity : maxReturnable(line);
  const reasons = config?.settings?.returnReasons ?? [];
  const destinations = locale?.returnDestinations ?? [];
  const [qty, setQty] = useState(1);
  const [destinationId, setDestinationId] = useState(() => defaultDestination(locale));
  const [reason, setReason] = useState('');
  const [reasonNote, setReasonNote] = useState('');
  const needsNote = reason === OTHER;
  const ready = qty >= 1 && qty <= cap && destinationId && reason && (!needsNote || reasonNote.trim());

  return (
    <div className={`${styles.backdrop} ${dialog ? styles.dialog : ""}`} onClick={(e) => { e.stopPropagation(); onCancel(); }}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Devolver" onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <div>
            <p className={styles.sku}>{line.sku}</p>
            <h2>{line.name}</h2>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onCancel} aria-label="Cerrar">×</button>
        </div>
        <div className="field">
          <span className="field-label">Cantidad</span>
          <div className={styles.qty}>
            <button type="button" className="btn btn-secondary" aria-label="Menos" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>−</button>
            <span className="num">{qty}</span>
            <button type="button" className="btn btn-secondary" aria-label="Más" disabled={qty >= cap} onClick={() => setQty(qty + 1)}>+</button>
          </div>
        </div>
        <label className="field">
          <span className="field-label">Destino</span>
          <select className={`select ${styles.input16}`} value={destinationId} onChange={(e) => setDestinationId(e.target.value)}>
            {destinations.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
        <div className="field">
          <span className="field-label">Motivo</span>
          <div className={styles.reasons}>
            {reasons.map((r) => (
              <button key={r} type="button" className={`btn btn-secondary ${reason === r ? styles.reasonOn : ''}`} aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>
            ))}
          </div>
          {needsNote && (
            <input className={`input ${styles.input16}`} placeholder="Contanos el motivo (obligatorio)" value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} />
          )}
        </div>
        <p className={styles.total}><span>Valor</span><span className="num">{formatMoney(qty * line.unitValue)}</span></p>
        {manual && <p className={styles.hint}>Valor: precio de lista actual</p>}
        <div className={styles.actions}>
          <button type="button" className="btn btn-secondary btn-lg" onClick={onCancel}>Cancelar</button>
          <button type="button" className="btn btn-primary btn-lg" disabled={!ready} onClick={() => onConfirm({ qty, destinationId, reason, reasonNote: reasonNote.trim() })}>Devolver</button>
        </div>
      </div>
    </div>
  );
}

// `onPick(purchase, purchaseLine, values)`; `variant`: 'sheet' (celular) o 'dialog'.
export default function ReturnPicker({ config, localId, busy, onPick, onClose, variant = 'sheet' }) {
  const locale = (config?.locales ?? []).find((l) => l.id === localId);
  const [mode, setMode] = useState('search'); // search | purchase | manual
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [purchase, setPurchase] = useState(null);
  const [sheetLine, setSheetLine] = useState(null);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function search(e) {
    e?.preventDefault();
    const q = query.trim();
    if (q.length < MIN_CHARS) return;
    const id = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const r = await api(`/returns/search?q=${encodeURIComponent(q)}`);
      if (id !== seq.current) return;
      setResults(r.purchases ?? []);
      setErrors(r.errors ?? []);
    } catch (err) {
      if (id !== seq.current) return;
      setResults(null);
      setErrors([]);
      setError(err.message);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }

  async function openPurchase(p) {
    const id = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const r = await api(`/returns/purchases/${encodeURIComponent(p.source)}/${encodeURIComponent(p.purchaseId)}`);
      if (id !== seq.current) return;
      setPurchase(r);
      setMode('purchase');
    } catch (err) {
      if (id === seq.current) setError(err.message);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }

  async function pickManual(product) {
    const id = ++seq.current;
    setError('');
    try {
      const line = await api(`/returns/manual-product/${encodeURIComponent(product.productId)}`);
      if (id === seq.current) setSheetLine(line);
    } catch (err) {
      if (id === seq.current) setError(err.message);
    }
  }

  function confirm(values) {
    const line = sheetLine;
    setSheetLine(null);
    onPick({ source: line.source, purchaseId: line.purchaseId, purchaseLineId: line.purchaseLineId, productId: line.productId }, line, values);
  }

  const back = () => { seq.current += 1; setMode('search'); setPurchase(null); setError(''); setLoading(false); };

  return (
    <div className={`${styles.backdrop} ${variant === 'dialog' ? styles.dialog : ''}`} onClick={onClose}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Devolver un producto" onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <h2>{mode === 'manual' ? 'Devolución sin ticket' : mode === 'purchase' ? `Compra ${purchase?.label ?? ''}` : 'Buscar la compra'}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <Notice kind="error">{error}</Notice>

        {mode === 'search' && (
          <>
            <form className={styles.searchRow} onSubmit={search}>
              <input
                className="input"
                type="search"
                inputMode="search"
                autoComplete="off"
                aria-label="DNI/CUIT o número de compra"
                placeholder="DNI/CUIT o número de compra"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={loading || query.trim().length < MIN_CHARS}>Buscar</button>
            </form>
            <button type="button" className="btn btn-secondary" onClick={() => { setMode('manual'); setError(''); }}>Sin ticket</button>
            {errors.map((m) => <Notice key={m} kind="info">{m}</Notice>)}
            {loading && <p className={styles.hint}>Buscando…</p>}
            {!loading && results && results.length === 0 && <EmptyState title="No encontramos compras">Revisá el DNI/CUIT o el número.</EmptyState>}
            {results && results.length > 0 && (
              <ul className={styles.list}>
                {results.map((p) => (
                  <li key={`${p.source}-${p.purchaseId}`}>
                    <button type="button" className={styles.item} disabled={loading} onClick={() => openPurchase(p)}>
                      <span className={styles.itemTop}><span>{SOURCE_LABELS[p.source] ?? p.source} {p.label}</span><span className="num">{formatMoney(p.total)}</span></span>
                      <span className={styles.meta}>{shortDate(p.date)} · {p.partnerName}{p.invoiceName ? ` · Factura ${p.invoiceName}` : ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {mode === 'purchase' && purchase && (
          <>
            <button type="button" className="btn btn-ghost" onClick={back}>← Volver a la búsqueda</button>
            <p className={styles.meta}>{SOURCE_LABELS[purchase.source] ?? purchase.source} · {shortDate(purchase.date)} · {purchase.partnerName}</p>
            {purchase.pending?.length > 0 && (
              <Notice kind="info">
                Todavía no se entregó: {purchase.pending.map((p) => `${p.qty} × ${p.name}`).join(', ')} — eso se anula, no se devuelve.
              </Notice>
            )}
            <ul className={styles.list}>
              {purchase.lines.map((l) => {
                const max = maxReturnable(l);
                return (
                  <li key={l.purchaseLineId} className={`${styles.line} ${max === 0 ? styles.lineDone : ''}`}>
                    <div className={styles.lineMain}>
                      <p className={styles.name}>{l.name}</p>
                      <p className={styles.sku}>{l.sku}</p>
                      <p className={styles.meta}>Compró {l.qtyBought} · devolvió {l.qtyReturnedBefore}</p>
                      <p className={`${styles.meta} num`}>Se reintegra {formatMoney(l.unitValue)} c/u</p>
                      {max === 0 && <p className={styles.meta}>Ya se devolvió todo</p>}
                    </div>
                    <button type="button" className="btn btn-secondary" disabled={max === 0 || busy} onClick={() => setSheetLine(l)}>Devolver</button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {mode === 'manual' && (
          <>
            <button type="button" className="btn btn-ghost" onClick={back}>← Volver a la búsqueda</button>
            <ProductSearch payMethods={[]} localId={localId} onPick={pickManual} />
          </>
        )}
      </div>
      {sheetLine && <ReturnSheet dialog={variant === "dialog"} line={sheetLine} config={config} locale={locale} onConfirm={confirm} onCancel={() => setSheetLine(null)} />}
    </div>
  );
}
