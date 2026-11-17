import { useCallback, useEffect, useRef, useState } from 'react';
import BarcodeScanner from './BarcodeScanner.jsx';
import { api } from '../lib/api.js';
import { formatMoney, priceWith } from '../lib/labels.js';
import { Notice, ProductPhoto } from './ui.jsx';
import StockBadges from './StockBadges.jsx';
import styles from './ProductSearch.module.css';

const MIN_CHARS = 4;
const DEBOUNCE_MS = 300;

// Buscador del vendedor. `payMethods`: medios de pago con descuento (solo
// informativo: el precio a cobrar es el de lista/promo). `onPick(product)`.
// Sin `onPick` es solo consulta (sin botón Agregar). `pickLabel`: texto del botón.
export default function ProductSearch({ payMethods, onPick, localId = null, pickLabel = 'Agregar' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const seq = useRef(0);
  const onScanned = useCallback((code) => { setScanning(false); setQuery(code); }, []);

  useEffect(() => {
    const q = query.trim();
    const id = ++seq.current; // invalida cualquier búsqueda anterior en vuelo
    if (q.length < MIN_CHARS) {
      setResults([]);
      setLoading(false);
      setError('');
      return undefined;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const found = await api(`/products/search?q=${encodeURIComponent(q)}${localId ? `&localId=${encodeURIComponent(localId)}` : ""}`);
        if (id === seq.current) { setResults(found); setError(''); }
      } catch (err) {
        if (id === seq.current) { setResults([]); setError(err.message); }
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, localId]);

  const short = query.trim().length < MIN_CHARS;

  return (
    <section className={styles.search} aria-label="Buscar productos">
      <div className={styles.searchBox}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          className="input"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          aria-label="Buscar productos"
          placeholder="Buscar por nombre, SKU o código"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className={`btn btn-ghost ${styles.scanBtn}`} onClick={() => setScanning(true)} aria-label="Leer código de barras con la cámara" title="Leer código de barras">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M17 8v8" />
          </svg>
        </button>
      </div>
      {scanning && <BarcodeScanner onDetected={onScanned} onClose={() => setScanning(false)} />}
      <Notice kind="error">{error}</Notice>
      {short && <p className={styles.hint}>{query.trim() ? `Seguí escribiendo: ${MIN_CHARS} letras o más.` : `Escribí al menos ${MIN_CHARS} letras del nombre o el SKU.`}</p>}
      {!short && loading && <p className={styles.hint}>Buscando…</p>}
      {!short && !loading && !error && results.length === 0 && <p className={styles.hint}>No se encontraron productos.</p>}
      <ul className={styles.list}>
        {results.map((p) => {
          const promo = p.promoPrice != null && p.promoPrice < p.fullPrice;
          return (
            <li key={p.productId} className={styles.item}>
              <ProductPhoto key={p.templateId} templateId={p.templateId} alt={p.name} size={72} />
              <div className={styles.body}>
                <p className={styles.sku}>{p.sku}</p>
                <p className={styles.name}>{p.name}</p>
                <p className={styles.price}>
                  <strong className="num">{formatMoney(p.basePrice)}</strong>
                  {promo && <s className={`${styles.full} num`}>{formatMoney(p.fullPrice)}</s>}
                </p>
                {payMethods.length > 0 && (
                  <p className={styles.methods}>
                    {payMethods.map((m) => (
                      <span key={m.id} className="num">{m.label} {formatMoney(priceWith(p.basePrice, m.discountPct))}</span>
                    ))}
                  </p>
                )}
                <StockBadges stock={p.stock} />
              </div>
              {onPick && <button type="button" className="btn btn-primary" onClick={() => onPick(p)}>{pickLabel}</button>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
