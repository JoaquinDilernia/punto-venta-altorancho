import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import styles from './admin.module.css';

export const isSuper = (user) => user?.role === 'superadmin';

// Carga un GET al montar y expone recargar. Sólo vale la última respuesta.
export function useApiData(path) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const data = await api(path);
      if (id === seq.current) setState({ data, error: '', loading: false });
    } catch (err) {
      if (id === seq.current) setState({ data: null, error: err.message, loading: false });
    }
  }, [path]);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

// Menú de ids de Odoo: siempre muestra el nombre. `nameOf` saca el texto de cada opción.
export function OdooSelect({ label, options, value, onChange, nameOf = (o) => o.name, empty, required }) {
  const list = [...(options ?? [])].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'es'));
  const known = value == null || list.some((o) => o.id === value);
  return (
    <label className="field">
      <span className="field-label">{label}{required ? ' *' : ''}</span>
      <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}>
        {(empty || value == null) && <option value="">{empty ?? 'Elegir…'}</option>}
        {!known && <option value={value}>Ya no existe en Odoo (hay que elegir otro)</option>}
        {list.map((o) => <option key={o.id} value={o.id}>{nameOf(o)}</option>)}
      </select>
    </label>
  );
}

export function Check({ label, checked, onChange, disabled }) {
  return (
    <label className={styles.check}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// Panel lateral de edición. Cierra con Escape.
export function Drawer({ title, onClose, onSubmit, saving, submitLabel = 'Guardar', children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <form className={styles.drawer} role="dialog" aria-label={title} onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        <div className={styles.drawerHead}>
          <h2 className={styles.drawerTitle}>{title}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cerrar</button>
        </div>
        <div className={styles.drawerBody}>{children}</div>
        <div className={styles.drawerFoot}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : submitLabel}</button>
        </div>
      </form>
    </>
  );
}

export const slugify = (text) => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// Número con coma decimal para precargar campos tipeables.
export const numberText = (n) => (n == null ? '' : String(n).replace('.', ','));
