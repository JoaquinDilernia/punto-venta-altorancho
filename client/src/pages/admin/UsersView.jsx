import { useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { getSession } from '../../lib/session.js';
import { Chip, EmptyState, Notice } from '../../components/ui.jsx';
import { Check, Drawer, useApiData } from './adminParts.jsx';
import styles from './admin.module.css';

const ROLE_LABELS = { vendedor: 'Vendedor', caja: 'Caja', admin: 'Admin', superadmin: 'Super admin' };
const isAdminRole = (role) => role === 'admin' || role === 'superadmin';
const needsLocal = (role) => role === 'vendedor' || role === 'caja';
const EMPTY = { id: null, name: '', role: 'vendedor', localId: '', pin: '', username: '', password: '', active: true };

export default function UsersView() {
  const me = getSession('admin')?.user;
  const iAmSuper = me?.role === 'superadmin';
  const users = useApiData('/admin/users');
  const locales = useApiData('/admin/locales');
  const [filterLocal, setFilterLocal] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const localName = (id) => locales.data?.find((l) => l.id === id)?.name ?? id ?? '—';
  const visible = useMemo(() => (users.data ?? [])
    .filter((u) => !filterLocal || u.localId === filterLocal)
    .filter((u) => !filterRole || u.role === filterRole), [users.data, filterLocal, filterRole]);
  const set = (key) => (value) => setEditing((f) => ({ ...f, [key]: value }));
  // Un admin común no toca a los admin: ni los edita ni los borra.
  const canManage = (u) => iAmSuper || !isAdminRole(u.role);

  function openNew() { setError(''); setNotice(''); setEditing({ ...EMPTY, localId: filterLocal || locales.data?.[0]?.id || '' }); }
  function openEdit(u) {
    setError('');
    setNotice('');
    setEditing({ id: u.id, name: u.name, role: u.role, localId: u.localId ?? '', pin: '', username: u.username ?? '', password: '', active: u.active !== false });
  }

  async function save() {
    const f = editing;
    const body = { name: f.name.trim(), role: f.role, active: f.active };
    if (needsLocal(f.role)) body.localId = f.localId;
    if (f.role === 'vendedor') {
      if (f.pin) body.pin = f.pin;
    } else {
      body.username = f.username.trim().toLowerCase();
      if (f.password) body.password = f.password;
    }
    setSaving(true);
    setError('');
    try {
      if (f.id) await api(`/admin/users/${encodeURIComponent(f.id)}`, { method: 'PATCH', body });
      else await api('/admin/users', { method: 'POST', body });
      setNotice(`${body.name} guardado.`);
      setEditing(null);
      users.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(u) {
    setDeleting(true);
    setNotice('');
    setError('');
    try {
      await api(`/admin/users/${encodeURIComponent(u.id)}`, { method: 'DELETE' });
      setDeleteId(null);
      setNotice(`${u.name} borrado.`);
      users.reload();
    } catch (err) {
      setDeleteId(null);
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={styles.view}>
      <header className={styles.viewHead}>
        <h1 className={styles.viewTitle}>Usuarios</h1>
        <div className={styles.toolbar}>
          <select className="select" aria-label="Filtrar por local" value={filterLocal} onChange={(e) => setFilterLocal(e.target.value)}>
            <option value="">Todos los locales</option>
            {(locales.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select className="select" aria-label="Filtrar por rol" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
            <option value="">Todos los roles</option>
            {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button type="button" className="btn btn-primary" onClick={openNew} disabled={!locales.data}>Nuevo usuario</button>
        </div>
      </header>
      <Notice kind="error">{users.error || locales.error || (!editing ? error : '')}</Notice>
      <Notice kind="success" onClose={notice ? () => setNotice('') : undefined}>{notice}</Notice>
      {users.loading && !users.data && <p className={styles.muted}>Cargando…</p>}
      {users.data && visible.length === 0 && <EmptyState title="No hay usuarios para mostrar">Probá con otro filtro.</EmptyState>}
      {visible.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Nombre</th><th>Rol</th><th>Local</th><th>Usuario</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {visible.map((u) => (
                <tr key={u.id} className={u.active ? '' : styles.rowOff}>
                  <td><strong>{u.name}</strong></td>
                  <td>{ROLE_LABELS[u.role] ?? u.role}</td>
                  <td>{needsLocal(u.role) ? localName(u.localId) : '—'}</td>
                  <td>{u.username ?? (u.role === 'vendedor' ? 'PIN' : '—')}</td>
                  <td><Chip tone={u.active ? 'done' : 'neutral'}>{u.active ? 'Activo' : 'Inactivo'}</Chip></td>
                  <td className={styles.right}>
                    {canManage(u) && (deleteId === u.id ? (
                      <span className={styles.rowActions} style={{ justifyContent: 'flex-end' }}>
                        <span>¿Borrar a {u.name}?</span>
                        <button type="button" className="btn btn-danger btn-sm" disabled={deleting} onClick={() => remove(u)}>Sí, borrar</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleteId(null)}>No</button>
                      </span>
                    ) : (
                      <span className={styles.rowActions} style={{ justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}>Editar</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleteId(u.id)}>Borrar</button>
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Drawer title={editing.id ? `Editar ${editing.name}` : 'Nuevo usuario'} onClose={() => setEditing(null)} onSubmit={save} saving={saving}>
          <Notice kind="error">{error}</Notice>
          <label className="field">
            <span className="field-label">Nombre *</span>
            <input className="input" value={editing.name} onChange={(e) => set('name')(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Rol</span>
            <select className="select" value={editing.role} onChange={(e) => set('role')(e.target.value)}>
              {Object.entries(ROLE_LABELS).filter(([value]) => iAmSuper || !isAdminRole(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {!iAmSuper && <p className={styles.hint}>Solo un super admin puede crear o editar usuarios admin.</p>}
          {needsLocal(editing.role) && (
            <label className="field">
              <span className="field-label">Local *</span>
              <select className="select" value={editing.localId} onChange={(e) => set('localId')(e.target.value)}>
                <option value="">Elegir…</option>
                {(locales.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          )}
          {editing.role === 'vendedor' ? (
            <label className="field">
              <span className="field-label">PIN (4 a 6 números){editing.id ? ' — vacío = no cambia' : ' *'}</span>
              <input className="input num" inputMode="numeric" maxLength={6} value={editing.pin} onChange={(e) => set('pin')(e.target.value.replace(/\D/g, ''))} autoComplete="off" />
            </label>
          ) : (
            <>
              <label className="field">
                <span className="field-label">Usuario *</span>
                <input className="input" value={editing.username} onChange={(e) => set('username')(e.target.value)} autoComplete="off" autoCapitalize="none" />
              </label>
              <label className="field">
                <span className="field-label">Contraseña (mínimo 6){editing.id ? ' — vacía = no cambia' : ' *'}</span>
                <input className="input" type="password" value={editing.password} onChange={(e) => set('password')(e.target.value)} autoComplete="new-password" />
              </label>
            </>
          )}
          <Check label="Usuario activo" checked={editing.active} onChange={set('active')} />
        </Drawer>
      )}
    </div>
  );
}
