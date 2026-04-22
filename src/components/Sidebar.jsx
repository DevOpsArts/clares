import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { api } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import './Sidebar.css'

const HomeIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
)
const CatalogIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
  </svg>
)
const AdminIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>
  </svg>
)
const UsersIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)
const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
)

export default function Sidebar({ onClose }) {
  const { currentUser } = useAuth()
  const isAdmin         = currentUser?.role === 'admin'
  const navigate        = useNavigate()

  const [catalogs, setCatalogs]         = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [newSlug, setNewSlug]           = useState('')
  const [newLabel, setNewLabel]         = useState('')
  const [addError, setAddError]         = useState('')
  const [addLoading, setAddLoading]     = useState(false)

  useEffect(() => {
    api.getCatalogTypes().then(setCatalogs).catch(() => {})
  }, [])

  async function handleAddCatalog(e) {
    e.preventDefault()
    setAddError('')
    setAddLoading(true)
    try {
      const created = await api.addCatalogType(newSlug.trim(), newLabel.trim())
      setCatalogs((prev) => [...prev, created])
      setShowAddModal(false)
      setNewSlug('')
      setNewLabel('')
      navigate(`/catalog/${created.slug}`)
    } catch (err) {
      setAddError(err.message)
    } finally {
      setAddLoading(false)
    }
  }

  async function handleDeleteCatalog(slug) {
    if (!window.confirm(`Delete catalog "${slug}"? Items of this type will remain in the database.`)) return
    try {
      await api.deleteCatalogType(slug)
      setCatalogs((prev) => prev.filter((c) => c.slug !== slug))
    } catch (err) {
      alert(err.message)
    }
  }

  function autoSlug(label) {
    return label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '')
  }

  return (
    <>
      <aside className="sidebar">
        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Navigation</div>

          <NavLink to="/home" className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link--active' : ''}`} onClick={onClose}>
            <HomeIcon /> Dashboard
          </NavLink>

          <div className="sidebar-section-label sidebar-section-label--catalogs">
            Catalogs
          </div>

          {catalogs.map((c) => (
            <div key={c.slug} className="sidebar-catalog-row">
              <NavLink
                to={`/catalog/${c.slug}`}
                className={({ isActive }) => `sidebar-link sidebar-link--catalog${isActive ? ' sidebar-link--active' : ''}`}
                onClick={onClose}
              >
                <CatalogIcon /> {c.label}
              </NavLink>
              {isAdmin && !c.is_builtin && (
                <button
                  className="sidebar-catalog-delete"
                  title={`Delete ${c.label}`}
                  onClick={() => handleDeleteCatalog(c.slug)}
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          ))}

          {isAdmin && (
            <button className="sidebar-add-catalog" onClick={() => setShowAddModal(true)}>
              <PlusIcon /> Add Catalog
            </button>
          )}

          {isAdmin && (
            <div className="sidebar-bottom">
              <div className="sidebar-divider" />
              <div className="sidebar-section-label">Settings</div>
              <NavLink to="/users" className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link--active' : ''}`} onClick={onClose}>
                <UsersIcon /> User Management
              </NavLink>
              <NavLink to="/admin" className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link--active' : ''}`} onClick={onClose}>
                <AdminIcon /> Admin
              </NavLink>
            </div>
          )}
        </nav>
      </aside>

      {/* ── Add Catalog Modal ── */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add Catalog Type</h2>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            {addError && <div className="form-error">{addError}</div>}
            <form onSubmit={handleAddCatalog} className="renewal-form">
              <div className="form-group">
                <label>Display Name <span className="req">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. API Keys"
                  value={newLabel}
                  onChange={(e) => {
                    setNewLabel(e.target.value)
                    if (!newSlug || newSlug === autoSlug(newLabel)) {
                      setNewSlug(autoSlug(e.target.value))
                    }
                  }}
                  required
                  maxLength={100}
                />
              </div>
              <div className="form-group">
                <label>Slug <span className="req">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. api_keys"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value.toLowerCase())}
                  required
                  maxLength={50}
                  pattern="[a-z0-9_-]+"
                  title="Lowercase letters, numbers, dashes and underscores only"
                />
                <span className="form-hint">Lowercase letters, numbers, - and _ only</span>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={addLoading}>
                  {addLoading ? 'Adding…' : 'Add Catalog'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
