import styles from './StockBadges.module.css';

function Badge({ label, qty, text }) {
  const empty = qty === 0;
  return <span className={`${styles.badge} ${empty ? styles.empty : ''}`}>{label} {text ?? qty}</span>;
}

// Stock por depósito. En 0 el chip se apaga pero el número se sigue leyendo.
export default function StockBadges({ stock, compact = false }) {
  if (!stock) return null;
  return (
    <div className={styles.row}>
      {stock.local && <Badge label="Local" qty={stock.local.stock} />}
      {stock.local && <Badge label="Exhib." qty={stock.local.exhibicion} />}
      <Badge label="Rolón" qty={stock.rolon} />
      <Badge label="Web" qty={stock.web.unlimited ? 1 : (stock.web.qty ?? 0)} text={stock.web.unlimited ? 'hay' : undefined} />
      {!compact && stock.otros.length > 0 && (
        <span className={styles.others}>Otros: {stock.otros.map((o) => `${o.name} ${o.qty}`).join(' · ')}</span>
      )}
    </div>
  );
}
