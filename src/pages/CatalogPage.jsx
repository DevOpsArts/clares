import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import './CatalogPage.css'

function daysUntil(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(dateStr) - today) / (1000 * 60 * 60 * 24))
}
function urgencyClass(days) {
  if (days < 0)   return 'expired'
  if (days <= 14) return 'critical'
  if (days <= 30) return 'warning'
  return 'ok'
}
function StatusChip({ days }) {
  const cls = urgencyClass(days)
  const label =
    days < 0  ? `Expired ${Math.abs(days)}d ago` :
    days === 0 ? 'Expires today' : `${days}d left`
  return <span className={`status-chip status-chip--${cls}`}>{label}</span>
}

const EMPTY_FORM = {
  name: '', environment: '', expiry_date: '', owner: '', notes: '',
  email_enabled: false, reminder_days_before: 30, reminder_count: 3,
}

// ── CSV parsing ──────────────────────────────────────────────
const CSV_HEADERS = ['name','environment','expiry_date','owner','notes','email_enabled','reminder_days_before','reminder_count']
const CSV_TEMPLATE = CSV_HEADERS.join(',') + '\n' +
  'example.com,Production,2026-12-31,owner@example.com,Sample note,false,30,3'

function parseCsv(text) {
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return { error: 'CSV must have a header row and at least one data row' }

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''))
  const nameIdx  = headers.indexOf('name')
  const expiryIdx = headers.indexOf('expiry_date')
  if (nameIdx === -1 || expiryIdx === -1) {
    return { error: 'CSV must have "name" and "expiry_date" columns' }
  }

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    const row  = {}
    headers.forEach((h, idx) => { row[h] = cols[idx] ?? '' })
    rows.push(row)
  }
  return { rows }
}

export default function CatalogPage() {
  const { type }        = useParams()
  const navigate        = useNavigate()
  const { currentUser } = useAuth()
  const isAdmin         = currentUser?.role === 'admin'

  const [catalogLabel, setCatalogLabel]   = useState(type)
  const [entries, setEntries]             = useState([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState('')

  // Form state
  const [showForm, setShowForm]           = useState(false)
  const [form, setForm]                   = useState(EMPTY_FORM)
  const [editId, setEditId]               = useState(null)
  const [saving, setSaving]               = useState(false)
  const [formError, setFormError]         = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // Bulk upload state
  const [showBulk, setShowBulk]           = useState(false)
  const [csvRows, setCsvRows]             = useState(null)
  const [csvError, setCsvError]           = useState('')
  const [bulkSaving, setBulkSaving]       = useState(false)
  const [bulkResult, setBulkResult]       = useState(null)

  // Load catalog label
  useEffect(() => {
    api.getCatalogTypes()
      .then((types) => {
        const found = types.find((t) => t.slug === type)
        if (!found) { navigate('/home'); return }
        setCatalogLabel(found.label)
      })
      .catch(() => {})
  }, [type, navigate])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const data = await api.getRenewalsByType(type)
      setEntries(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [type])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setShowForm(true)
  }
  function openEdit(row) {
    setEditId(row.id)
    setForm({
      name:                 row.name,
      environment:          row.environment || '',
      expiry_date:          row.expiry_date?.slice(0, 10) || '',
      owner:                row.owner || '',
      notes:                row.notes || '',
      email_enabled:        !!row.email_enabled,
      reminder_days_before: row.reminder_days_before ?? 30,
      reminder_count:       row.reminder_count ?? 3,
    })
    setFormError('')
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    setSaving(true)
    try {
      const payload = { ...form, type }
      if (editId) await api.updateRenewal(editId, payload)
      else        await api.createRenewal(payload)
      await load()
      setShowForm(false)
    } catch (e) {
      setFormError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    try {
      await api.deleteRenewal(id)
      setDeleteConfirm(null)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  // ── Bulk upload ──
  function handleFileChange(e) {
    setCsvError('')
    setCsvRows(null)
    setBulkResult(null)
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = parseCsv(ev.target.result)
      if (result.error) { setCsvError(result.error); return }
      setCsvRows(result.rows)
    }
    reader.readAsText(file)
  }

  async function handleBulkImport() {
    if (!csvRows?.length) return
    setBulkSaving(true)
    setCsvError('')
    try {
      const rows = csvRows.map((r) => ({ ...r, type }))
      const result = await api.bulkCreateRenewals(rows)
      setBulkResult(result)
      setCsvRows(null)
      await load()
    } catch (e) {
      setCsvError(e.message)
    } finally {
      setBulkSaving(false)
    }
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `clares-${type}-template.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const expiringCount = entries.filter((r) => { const d = daysUntil(r.expiry_date); return d >= 0 && d <= 30 }).length
  const expiredCount  = entries.filter((r) => daysUntil(r.expiry_date) < 0).length

  return (
    <div className="catalog-page">
      {/* ── Header ── */}
      <div className="catalog-header">
        <div>
          <h1 className="catalog-title">{catalogLabel}</h1>
          <p className="catalog-subtitle">
            {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}
            {expiringCount > 0 && <span className="catalog-badge-warning"> · {expiringCount} expiring soon</span>}
            {expiredCount  > 0 && <span className="catalog-badge-danger"> · {expiredCount} expired</span>}
          </p>
        </div>
        {isAdmin && (
          <div className="catalog-header-actions">
            <button className="btn-secondary" onClick={() => { setShowBulk((v) => !v); setBulkResult(null); setCsvRows(null); setCsvError('') }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Bulk Upload
            </button>
            <button className="btn-add" onClick={openAdd}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Entry
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* ── Bulk Upload panel ── */}
      {showBulk && isAdmin && (
        <div className="bulk-panel">
          <div className="bulk-panel-header">
            <h3>Bulk Upload via CSV</h3>
            <button className="bulk-template-btn" onClick={downloadTemplate}>
              ↓ Download Template
            </button>
          </div>
          <p className="bulk-hint">
            CSV columns: <code>name</code>, <code>environment</code>, <code>expiry_date</code> (YYYY-MM-DD),
            <code>owner</code> (email for reminders), <code>notes</code>, <code>email_enabled</code> (true/false),
            <code>reminder_days_before</code>, <code>reminder_count</code>.
            The <code>type</code> column will be auto-set to <strong>{type}</strong>.
          </p>
          <input type="file" accept=".csv,text/csv" className="bulk-file-input" onChange={handleFileChange} />
          {csvError && <div className="form-error">{csvError}</div>}
          {csvRows && (
            <>
              <div className="bulk-preview-label">{csvRows.length} row(s) parsed — preview:</div>
              <div className="bulk-preview-wrap">
                <table className="bulk-preview-table">
                  <thead>
                    <tr>
                      {CSV_HEADERS.map((h) => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(0, 10).map((r, i) => (
                      <tr key={i}>
                        {CSV_HEADERS.map((h) => <td key={h}>{r[h] ?? ''}</td>)}
                      </tr>
                    ))}
                    {csvRows.length > 10 && (
                      <tr><td colSpan={CSV_HEADERS.length} className="bulk-preview-more">…and {csvRows.length - 10} more rows</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="bulk-import-actions">
                <button className="btn-secondary" onClick={() => { setCsvRows(null); setBulkResult(null) }}>Clear</button>
                <button className="btn-add" onClick={handleBulkImport} disabled={bulkSaving}>
                  {bulkSaving ? 'Importing…' : `Import ${csvRows.length} row(s)`}
                </button>
              </div>
            </>
          )}
          {bulkResult && (
            <div className="bulk-success">
              ✓ Successfully imported {bulkResult.inserted} row(s).
            </div>
          )}
        </div>
      )}

      {/* ── Table ── */}
      {loading ? (
        <div className="catalog-loading">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="catalog-empty">
          No entries yet.{isAdmin && ' Click "Add Entry" to get started.'}
        </div>
      ) : (
        <div className="renewals-table-wrap">
          <table className="renewals-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Environment</th>
                <th>Expiry Date</th>
                <th>Status</th>
                <th>Owner / Email</th>
                <th>Email Reminder</th>
                <th>Notes</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {entries.map((r) => {
                const days = daysUntil(r.expiry_date)
                return (
                  <tr key={r.id} className={`renewal-row renewal-row--${urgencyClass(days)}`}>
                    <td className="cell-name">{r.name}</td>
                    <td>{r.environment || '—'}</td>
                    <td className="cell-date">{r.expiry_date?.slice(0, 10)}</td>
                    <td><StatusChip days={days} /></td>
                    <td>{r.owner || '—'}</td>
                    <td>
                      {r.email_enabled
                        ? <span className="reminder-chip reminder-chip--on">{r.reminder_days_before}d before · ×{r.reminder_count}</span>
                        : <span className="reminder-chip reminder-chip--off">Off</span>
                      }
                    </td>
                    <td className="cell-notes">{r.notes || '—'}</td>
                    {isAdmin && (
                      <td className="cell-actions">
                        <button className="btn-icon btn-icon--edit" title="Edit" onClick={() => openEdit(r)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button className="btn-icon btn-icon--delete" title="Delete" onClick={() => setDeleteConfirm(r.id)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add / Edit form modal ── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editId ? 'Edit Entry' : `Add ${catalogLabel} Entry`}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            {formError && <div className="form-error">{formError}</div>}
            <form onSubmit={handleSubmit} className="renewal-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Name <span className="req">*</span></label>
                  <input type="text" placeholder="e.g. *.example.com" value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required maxLength={300} />
                </div>
                <div className="form-group">
                  <label>Expiry Date <span className="req">*</span></label>
                  <input type="date" value={form.expiry_date}
                    onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Environment</label>
                  <input type="text" placeholder="e.g. Production, QA" value={form.environment}
                    onChange={(e) => setForm({ ...form, environment: e.target.value })} maxLength={100} />
                </div>
                <div className="form-group">
                  <label>Owner Email</label>
                  <input type="text" placeholder="owner@example.com" value={form.owner}
                    onChange={(e) => setForm({ ...form, owner: e.target.value })} maxLength={200} />
                </div>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea rows={2} value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={2000} />
              </div>

              {/* ── Email reminder settings ── */}
              <div className="reminder-section">
                <div className="reminder-section-header">
                  <span className="reminder-section-title">Email Reminder</span>
                  <label className="toggle">
                    <input type="checkbox" checked={form.email_enabled}
                      onChange={(e) => setForm({ ...form, email_enabled: e.target.checked })} />
                    <span className="toggle-slider" />
                  </label>
                </div>
                {form.email_enabled && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Remind <span className="req">*</span></label>
                      <div className="input-suffix-wrap">
                        <input type="number" min={1} max={365} value={form.reminder_days_before}
                          onChange={(e) => setForm({ ...form, reminder_days_before: parseInt(e.target.value, 10) || 30 })}
                          required />
                        <span className="input-suffix">days before expiry</span>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Repeat <span className="req">*</span></label>
                      <div className="input-suffix-wrap">
                        <input type="number" min={1} max={10} value={form.reminder_count}
                          onChange={(e) => setForm({ ...form, reminder_count: parseInt(e.target.value, 10) || 3 })}
                          required />
                        <span className="input-suffix">time(s)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal modal--sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete Entry</h2>
            </div>
            <p style={{ margin: '0 0 1.5rem', color: '#374151' }}>Are you sure you want to delete this entry? This cannot be undone.</p>
            <div className="form-actions">
              <button className="btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn-danger" onClick={() => handleDelete(deleteConfirm)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
