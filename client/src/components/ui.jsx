import { useEffect, useRef, useState } from 'react';
import { productImageUrl } from '../lib/api.js';
import { clearSession } from '../lib/session.js';
import logoAlto from '../assets/logo-alto.png';
import logoAltorancho from '../assets/logo-altorancho.png';
import { ORDER_STATUS } from '../lib/labels.js';
import styles from './ui.module.css';

export function logout() {
  clearSession();
  window.location.reload();
}

// Encabezado del panel Vendedor: logo reducido, nombre del panel en
// minúscula con punto (como la marca), pestañas opcionales y salir.
export function AppHeader({ panel, userName, tabs, activeTab, onTabChange }) {
  // En el celular las pestañas se deslizan de costado: la activa queda a la vista.
  const activeRef = useRef(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [activeTab]);

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <img src={logoAlto} alt="Alto Rancho" className={styles.brandLogo} />
        <span className={styles.panelName}>{panel}.</span>
      </div>
      {tabs && (
        <nav className={styles.tabs} aria-label="Secciones">
          {tabs.map(t => (
            <button
              key={t.value}
              ref={activeTab === t.value ? activeRef : undefined}
              type="button"
              className={`${styles.tab} ${activeTab === t.value ? styles.tabActive : ''}`}
              aria-current={activeTab === t.value ? 'page' : undefined}
              onClick={() => onTabChange(t.value)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}
      <div className={styles.headerEnd}>
        {userName && <span className={styles.userName}>{userName}</span>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>Salir</button>
      </div>
    </header>
  );
}

export function Chip({ tone = 'neutral', large = false, children }) {
  return <span className={`${styles.chip} ${large ? styles.chipLg : ''} ${styles[`tone-${tone}`]}`}>{children}</span>;
}

export function OrderStatusChip({ status, large }) {
  const meta = ORDER_STATUS[status] ?? { label: status, tone: 'neutral' };
  return <Chip tone={meta.tone} large={large}>{meta.label}</Chip>;
}

export function Notice({ kind = 'info', children, onClose }) {
  if (!children) return null;
  return (
    <div className={`${styles.notice} ${styles[`notice-${kind}`]}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onClose && <button type="button" className={styles.noticeClose} onClick={onClose} aria-label="Cerrar aviso">×</button>}
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>{title}</p>
      {children && <p>{children}</p>}
    </div>
  );
}

export function LoginShell({ title, hint, onSubmit, children }) {
  return (
    <div className={styles.loginPage}>
      <form className={styles.loginCard} onSubmit={onSubmit}>
        <img src={logoAltorancho} alt="Alto Rancho" className={styles.loginLogo} />
        <h1 className={styles.loginTitle}>{title}</h1>
        {hint && <p className={styles.loginHint}>{hint}</p>}
        {children}
      </form>
    </div>
  );
}

export const uiStyles = styles;

// Foto cuadrada del producto (la de Odoo, servida por el backend). Si no
// tiene foto, un recuadro neutro del mismo tamaño para que las listas no
// salten. `size` en px; con `fill` ocupa el ancho del contenedor.
export function ProductPhoto({ templateId, alt = '', size = 64, fill = false }) {
  const [failed, setFailed] = useState(false);
  const box = fill ? undefined : { width: size, height: size };
  if (failed || !templateId) {
    return (
      <span className={`${styles.photo} ${styles.photoEmpty} ${fill ? styles.photoFill : ''}`} style={box} aria-hidden="true">
        <svg viewBox="0 0 24 24" width="40%" height="40%" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="1.8" />
          <path d="M21 16l-5-5-8 8" />
        </svg>
      </span>
    );
  }
  return (
    <img
      className={`${styles.photo} ${fill ? styles.photoFill : ''}`}
      style={box}
      src={productImageUrl(templateId)}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
