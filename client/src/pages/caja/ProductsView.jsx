import { useMemo } from 'react';
import ProductSearch from '../../components/ProductSearch.jsx';
import styles from './caja.module.css';

// Consulta de productos: stock completo y precio por medio de pago. No agrega nada a ningún pedido.
export default function ProductsView({ config }) {
  const payMethods = useMemo(
    () => (config.paymentMethods ?? []).filter((m) => m.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [config],
  );
  return (
    <div className={`${styles.view} ${styles.productsView}`}>
      <header className={styles.viewHead}>
        <h1 className={styles.viewTitle}>Productos</h1>
      </header>
      <ProductSearch payMethods={payMethods} />
    </div>
  );
}
