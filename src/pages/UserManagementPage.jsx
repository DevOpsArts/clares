import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import './UserManagementPage.css'

const ROLE_LABELS = { admin: 'Admin', viewer: 'Viewer' }

const EMPTY_FORM = {
  username: '', password: '', display_name: '', email: '', role: 'viewer',
}

function RoleBadge({ role }) {
  return (
    <span className={`role-badge role-badge--${role}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  )
}

function StatusBadge({ active }) {
  return (
    <span className={`status-badge ${active ? 'status-badge--active' : 'status-badge--inactive'}`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

export default function UserManagementPage() {
  const { currentUser } = useAuth()
  const isAdmin         = currentUser?.role === 'admin'

  const [users, setUsers]                 = useState([])
  const [catalogs, setCatalogs]           = useState([])
  const [loading, setLoading]             = useState(true)
  const [pageError, setPageError]         = useState('')
  const [permsKey, setPermsKey]            = useState(0)

  // Add user
  const [showAdd, setShowAdd]             = useState(false)
  const [addForm, setAddForm]             = useState(EMPTY_FORM)
  const [addError, setAddError]           = useState('')
  const [addSaving, setAddSaving]         = useState(false)

  // Edit user + permissions
  const [editUser, setEditUser]           = useState(null)
  const [editForm, setEditForm]           = useState({})
  const [editPerms, setEditPerms]         = useState([])   // [{ catalog_slug, role }]
  const [editError, setEditError]         = useState('')
  const [editSaving, setEditSaving]       = useState(false)
  const [permsLoading, setPermsLoading]   = useState(false)

  const loadAll = useCallback(async () => {
    try {
      setLoading(true)
      setPageError('')
      const [u, c] = await Promise.all([api.getUsers(), api.getCatalogTypes()])
      setUsers(u)
      setCatalogs(c)
    } catch (e) {
      setPageError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Add user ──
  async function handleAdd(e) {
    e.preventDefault()
    setAddError('')
    setAddSaving(true)
    try {
      const created = await api.createUser(addForm)
      setUsers((prev) => [...prev, created])
      setShowAdd(false)
      setAddForm(EMPTY_FORM)
    } catch (e) {
      setAddError(e.message)
    } finally {
      setAddSaving(false)
    }
  }

  // ── Open edit modal ──
  async function openEdit(user) {
    setEditUser(user)
    setEditForm({
      display_name: user.display_name || '',
      email:        user.email || '',
      role:         user.role,
      is_active:    user.is_active,
      password:     '',
    })
    setEditError('')
    setPermsLoading(true)
    try {
      const perms = await api.getUserPermissions(user.id)
      setEditPerms(perms)
    } catch {
      setEditPerms([])
    } finally {
      setPermsLoading(false)
    }
  }

  // ── Permission toggles ──
  function getPermRole(slug) {
    return editPerms.find((p) => p.catalog_slug === slug)?.role || null
  }

  function togglePerm(slug, role) {
    const current = getPermRole(slug)
    if (current === role) {
      // remove
      setEditPerms((prev) => prev.filter((p) => p.catalog_slug !== slug))
    } else {
      // set or replace
      setEditPerms((prev) => [
        ...prev.filter((p) => p.catalog_slug !== slug),
        { catalog_slug: slug, role },
      ])
    }
  }

  // ── Save edit ──
  async function handleEditSave(e) {
    e.preventDefault()
    setEditError('')
    setEditSaving(true)
    try {
      const updatePayload = {
        display_name: editForm.display_name,
        email:        editForm.email,
        role:         editForm.role,
        is_active:    editForm.is_active,
      }
      if (editForm.password) updatePayload.password = editForm.password

      const [updated] = await Promise.all([
        api.updateUser(editUser.id, updatePayload),
        api.saveUserPermissions(editUser.id, editPerms),
      ])
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
      setEditUser(null)
      // Force CatalogAccessSummary to re-fetch
      setPermsKey((k) => k + 1)
    } catch (e) {
      setEditError(e.message)
    } finally {
      setEditSaving(false)
    }
  }

  if (!isAdmin) {
    return <div className="um-page"><p className="um-denied">Admin access required.</p></div>
  }
  if (loading) return <div className="um-page"><div className="um-loading">Loading…</div></div>

  return (
    <div className="um-page">
      <div className="um-header">
        <div>
          <h1 className="um-title">User Management</h1>
          <p className="um-subtitle">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-add" onClick={() => { setAddForm(EMPTY_FORM); setAddError(''); setShowAdd(true) }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add User
        </button>
      </div>

      {pageError && <div className="form-error" style={{ marginBottom: '1rem' }}>{pageError}</div>}

      {/* ── Users table ── */}
      <div className="um-table-wrap">
        <table className="um-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Display Name</th>
              <th>Email</th>
              <th>Global Role</th>
              <th>Status</th>
              <th>Catalog Access</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={!u.is_active ? 'um-row--inactive' : ''}>
                <td className="cell-username">{u.username}</td>
                <td>{u.display_name || '—'}</td>
                <td>{u.email || '—'}</td>
                <td><RoleBadge role={u.role} /></td>
                <td><StatusBadge active={u.is_active} /></td>
                <td>
                  <CatalogAccessSummary userId={u.id} key={`${u.id}-${permsKey}`} />
                </td>
                <td>
                  <button className="btn-icon btn-icon--edit" title="Edit" onClick={() => openEdit(u)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Add User Modal ── */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add User</h2>
              <button className="modal-close" onClick={() => setShowAdd(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            {addError && <div className="form-error" style={{ marginBottom: '0.75rem' }}>{addError}</div>}
            <form onSubmit={handleAdd} className="renewal-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Username <span className="req">*</span></label>
                  <input type="text" placeholder="john.doe" value={addForm.username}
                    onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                    required maxLength={100} />
                </div>
                <div className="form-group">
                  <label>Password <span className="req">*</span></label>
                  <input type="password" placeholder="Min. 8 characters" value={addForm.password}
                    onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                    required minLength={8} maxLength={200} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Display Name</label>
                  <input type="text" placeholder="John Doe" value={addForm.display_name}
                    onChange={(e) => setAddForm({ ...addForm, display_name: e.target.value })}
                    maxLength={100} />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" placeholder="john@example.com" value={addForm.email}
                    onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Global Role <span className="req">*</span></label>
                <select value={addForm.role} onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}>
                  <option value="viewer">Viewer — read-only access to all catalogs</option>
                  <option value="admin">Admin — full access + admin settings</option>
                </select>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={addSaving}>
                  {addSaving ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit User Modal ── */}
      {editUser && (
        <div className="modal-overlay" onClick={() => setEditUser(null)}>
          <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Edit User — <span style={{ fontWeight: 400 }}>{editUser.username}</span></h2>
              <button className="modal-close" onClick={() => setEditUser(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {editError && <div className="form-error" style={{ marginBottom: '0.75rem' }}>{editError}</div>}

            <form onSubmit={handleEditSave} className="renewal-form">
              {/* ── Basic info ── */}
              <div className="um-section-label">Basic Info</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Display Name</label>
                  <input type="text" value={editForm.display_name}
                    onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                    maxLength={100} />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Global Role</label>
                  <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={editForm.is_active ? 'active' : 'inactive'}
                    onChange={(e) => setEditForm({ ...editForm, is_active: e.target.value === 'active' })}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive (cannot log in)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Reset Password <span className="form-hint">(leave blank to keep current)</span></label>
                <input type="password" placeholder="New password (min. 8 characters)" value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  minLength={editForm.password ? 8 : undefined} maxLength={200} />
              </div>

              {/* ── Catalog permissions ── */}
              <div className="um-section-label" style={{ marginTop: '0.75rem' }}>
                Catalog Permissions
                <span className="um-section-hint">Overrides global role for specific catalogs</span>
              </div>

              {permsLoading ? (
                <div className="um-perms-loading">Loading permissions…</div>
              ) : (
                <div className="um-perms-grid">
                  <div className="um-perms-header">
                    <span>Catalog</span>
                    <span>No Access</span>
                    <span>View</span>
                    <span>Admin</span>
                  </div>
                  {catalogs.map((c) => {
                    const current = getPermRole(c.slug)
                    return (
                      <div key={c.slug} className="um-perms-row">
                        <span className="um-perms-catalog">{c.label}</span>
                        {/* No access */}
                        <label className="um-perms-cell">
                          <input type="radio" name={`perm-${c.slug}`}
                            checked={current === null}
                            onChange={() => setEditPerms((prev) => prev.filter((p) => p.catalog_slug !== c.slug))} />
                        </label>
                        {/* View */}
                        <label className="um-perms-cell">
                          <input type="radio" name={`perm-${c.slug}`}
                            checked={current === 'view'}
                            onChange={() => togglePerm(c.slug, 'view')} />
                        </label>
                        {/* Admin */}
                        <label className="um-perms-cell">
                          <input type="radio" name={`perm-${c.slug}`}
                            checked={current === 'admin'}
                            onChange={() => togglePerm(c.slug, 'admin')} />
                        </label>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setEditUser(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={editSaving}>
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// Inline component to show compact catalog access chips per user row
function CatalogAccessSummary({ userId }) {
  const [perms, setPerms] = useState(null)

  useEffect(() => {
    api.getUserPermissions(userId)
      .then(setPerms)
      .catch(() => setPerms([]))
  }, [userId])

  if (perms === null) return <span className="um-perms-loading-inline">…</span>
  if (perms.length === 0) return <span className="um-no-perms">Default</span>

  return (
    <div className="um-access-chips">
      {perms.map((p) => (
        <span key={p.catalog_slug} className={`um-access-chip um-access-chip--${p.role}`}>
          {p.catalog_slug} · {p.role}
        </span>
      ))}
    </div>
  )
}
