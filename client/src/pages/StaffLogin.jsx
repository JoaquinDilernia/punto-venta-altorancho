import { useState } from 'react';
import { api } from '../lib/api.js';
import { saveSession } from '../lib/session.js';
import { LoginShell, Notice } from '../components/ui.jsx';

// Login de caja y admin con usuario y contraseña. `role` define qué sesión
// guarda; el backend rechaza si el usuario no tiene ese rol al usar el panel.
export default function StaffLogin({ role }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await api('/auth/login', { method: 'POST', body: { username, password } });
      const allowed = role === 'admin' ? ['admin', 'superadmin'] : ['caja', 'admin', 'superadmin'];
      if (!allowed.includes(user.role)) throw new Error(role === 'admin' ? 'Tu usuario no es de administración' : 'Tu usuario no es de caja');
      saveSession(role, token, user);
      window.location.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginShell title={`${role}.`} hint="Ingresá tu usuario y contraseña." onSubmit={handleSubmit}>
      <input className="input" autoComplete="username" placeholder="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
      <input className="input" type="password" autoComplete="current-password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
      <Notice kind="error">{error}</Notice>
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={loading || !username || !password}>
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
    </LoginShell>
  );
}
