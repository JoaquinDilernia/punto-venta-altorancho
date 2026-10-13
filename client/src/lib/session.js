// Una sesión por panel (vendedor, caja, admin): entrar a Caja en otra
// pestaña no pisa la sesión del vendedor. Las rutas van con hash: /#/caja.
export function roleForRoute() {
  const hash = window.location.hash;
  if (hash.startsWith('#/vendedor')) return 'vendedor';
  if (hash.startsWith('#/admin')) return 'admin';
  return 'caja';
}

const key = (role) => `pos_session_${role}`;

export function getSession(role = roleForRoute()) {
  try {
    return JSON.parse(localStorage.getItem(key(role))) ?? null;
  } catch {
    return null;
  }
}

export function saveSession(role, token, user) {
  localStorage.setItem(key(role), JSON.stringify({ token, user }));
}

export function clearSession(role = roleForRoute()) {
  localStorage.removeItem(key(role));
}
