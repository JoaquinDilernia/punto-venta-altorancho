import { useEffect, useState } from 'react';
import logoAlto from '../assets/logo-alto.png';
import { logout } from './ui.jsx';
import styles from './SidebarShell.module.css';

// Layout de escritorio de Caja y Admin: menú a la izquierda, contenido a la
// derecha. En pantallas angostas (tablet, celular) el menú se esconde detrás
// de una barra superior y se abre como panel. `items`: [{ value, label, badge? }].
export default function SidebarShell({ panel, subtitle, userName, items, active, onSelect, extra, children }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const current = items.find((i) => i.value === active);
  const pending = items.reduce((sum, i) => sum + (Number(i.badge) || 0), 0);

  function select(value) {
    onSelect(value);
    setOpen(false);
    window.scrollTo({ top: 0 });
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <button
          type="button"
          className={styles.menuBtn}
          aria-label="Abrir menú"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          {pending > 0 && <span className={styles.menuDot} aria-hidden="true" />}
        </button>
        <img src={logoAlto} alt="Alto Rancho" className={styles.topLogo} />
        <span className={styles.topPanel}>{panel}.</span>
        <span className={styles.topCurrent}>{current?.label}</span>
      </header>

      {open && <div className={styles.scrim} onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`} aria-label="Menú">
        <div className={styles.brand}>
          <img src={logoAlto} alt="Alto Rancho" className={styles.logo} />
          <div className={styles.brandText}>
            <p className={styles.panel}>{panel}.</p>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          <button type="button" className={`btn btn-ghost btn-icon btn-sm ${styles.closeBtn}`} aria-label="Cerrar menú" onClick={() => setOpen(false)}>×</button>
        </div>
        {extra}
        <nav className={styles.nav} aria-label="Secciones">
          {items.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`${styles.item} ${active === item.value ? styles.itemActive : ''}`}
              aria-current={active === item.value ? 'page' : undefined}
              onClick={() => select(item.value)}
            >
              <span>{item.label}</span>
              {item.badge ? <span className={`${styles.badge} num`}>{item.badge}</span> : null}
            </button>
          ))}
        </nav>
        <div className={styles.footer}>
          <span className={styles.avatar} aria-hidden="true">{(userName ?? '?').trim().charAt(0).toUpperCase()}</span>
          <span className={styles.user}>{userName}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>Salir</button>
        </div>
      </aside>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
