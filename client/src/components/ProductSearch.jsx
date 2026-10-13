import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatMoney, priceWith } from '../lib/labels.js';
import { Notice, ProductPhoto } from './ui.jsx';
import StockBadges from './StockBadges.jsx';
import styles from './ProductSearch.module.css';

const MIN_CHARS = 4;
const DEBOUNCE_MS = 300;

// Buscador del vendedor. `payMethods`: medios de pago con descuento (solo
// informativo: el precio a cobrar es el de lista/promo). `onPick(product)`.
export default function ProductSearch({ payMethods, onPick }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);

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
        const found = await api(`/products/search?q=${encodeURIComponent(q)}`);
        if (id === seq.current) { setResults(found); setError(''); }
      } catch (err) {
        if (id === seq.current) { setResults([]); setError(err.message); }
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const short = query.trim().length < MIN_CHARS;

  return (
    <section className={styles.search} aria-label="Buscar productos">
      <input
        className="input"
        type="search"
        inputMode="search"
        autoComplete="off"
        placeholder="Buscar por nombre o SKU (4 letras o más)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <Notice kind="error">{error}</Notice>
      {short && <p className={styles.hint}>Escribí al menos {MIN_CHARS} letras para buscar.</p>}
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
              <button type="button" className="btn btn-primary" onClick={() => onPick(p)}>Agregar</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
