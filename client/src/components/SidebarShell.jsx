import logoAlto from '../assets/logo-alto.png';
import { logout } from './ui.jsx';
import styles from './SidebarShell.module.css';

// Layout de escritorio de Caja y Admin: menú a la izquierda, contenido a la
// derecha. `items`: [{ value, label, badge? }].
export default function SidebarShell({ panel, subtitle, userName, items, active, onSelect, extra, children }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <img src={logoAlto} alt="Alto Rancho" className={styles.logo} />
          <div>
            <p className={styles.panel}>{panel}.</p>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
        </div>
        {extra}
        <nav className={styles.nav} aria-label="Secciones">
          {items.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`${styles.item} ${active === item.value ? styles.itemActive : ''}`}
              aria-current={active === item.value ? 'page' : undefined}
              onClick={() => onSelect(item.value)}
            >
              <span>{item.label}</span>
              {item.badge ? <span className={styles.badge}>{item.badge}</span> : null}
            </button>
          ))}
        </nav>
        <div className={styles.footer}>
          <span className={styles.user}>{userName}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>Salir</button>
        </div>
      </aside>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
