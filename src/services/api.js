const SESSION_KEY = 'clares_session'

function getToken() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw).token : null
  } catch {
    return null
  }
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }

  const res = await fetch(`/api${path}`, { ...options, headers })

  if (res.status === 401 && path !== '/auth/login') {
    sessionStorage.removeItem(SESSION_KEY)
    window.location.replace('/login')
    throw new Error('SESSION_EXPIRED')
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

export const api = {
  // ── Auth ──────────────────────────────────────────────────
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  // ── Renewals ──────────────────────────────────────────────
  getRenewals:        ()         => request('/renewals'),
  getRenewalsByType:  (type)     => request(`/renewals/type/${type}`),
  createRenewal:      (data)     => request('/renewals', { method: 'POST', body: JSON.stringify(data) }),
  updateRenewal:      (id, data) => request(`/renewals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRenewal:      (id)       => request(`/renewals/${id}`, { method: 'DELETE' }),
  bulkCreateRenewals: (rows)     => request('/renewals/bulk', { method: 'POST', body: JSON.stringify({ rows }) }),

  // ── Catalog types ─────────────────────────────────────────
  getCatalogTypes:   ()              => request('/catalog-types'),
  addCatalogType:    (slug, label)   => request('/catalog-types', { method: 'POST', body: JSON.stringify({ slug, label }) }),
  deleteCatalogType: (slug)          => request(`/catalog-types/${slug}`, { method: 'DELETE' }),

  // ── Admin / SMTP ──────────────────────────────────────────
  getSmtpConfig:       ()     => request('/admin/smtp'),
  saveSmtpConfig:      (data) => request('/admin/smtp', { method: 'PUT', body: JSON.stringify(data) }),
  testSmtpConnection:  ()     => request('/admin/smtp/test', { method: 'POST' }),
  sendTestEmail:       (to)   => request('/admin/smtp/test-email', { method: 'POST', body: JSON.stringify({ to }) }),
  sendReminders:       ()     => request('/admin/send-reminders', { method: 'POST' }),

  // ── User management ───────────────────────────────────────
  getUsers:           ()           => request('/admin/users'),
  createUser:         (data)       => request('/admin/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser:         (id, data)   => request(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getUserPermissions: (id)         => request(`/admin/users/${id}/permissions`),
  saveUserPermissions:(id, perms)  => request(`/admin/users/${id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions: perms }) }),
}

