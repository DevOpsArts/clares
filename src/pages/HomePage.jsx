import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api.js'
import './HomePage.css'

const THRESHOLD = 90   // show items expiring within this many days

function daysUntil(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(dateStr) - today) / (1000 * 60 * 60 * 24))
}

function urgencyClass(days) {
  if (days < 0)   return 'expired'
  if (days <= 14) return 'critical'
  if (days <= 30) return 'warning'
  return 'upcoming'
}

const PALETTE = [
  { bg: '#dbeafe', fg: '#1d4ed8' },
  { bg: '#f3e8ff', fg: '#7c3aed' },
  { bg: '#fef9c3', fg: '#854d0e' },
  { bg: '#dcfce7', fg: '#15803d' },
  { bg: '#ffedd5', fg: '#c2410c' },
  { bg: '#fce7f3', fg: '#9d174d' },
]
const _slugCache = {}
function slugColor(slug) {
  if (!_slugCache[slug]) {
    let h = 0
    for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) & 0xffff
    _slugCache[slug] = PALETTE[h % PALETTE.length]
  }
  return _slugCache[slug]
}

function TypeBadge({ type, label }) {
  const { bg, fg } = slugColor(type)
  return (
    <span className="renewal-badge" style={{ background: bg, color: fg }}>
      {label || type}
    </span>
  )
}

function StatusChip({ days }) {
  const cls   = urgencyClass(days)
  const label =
    days < 0    ? `Expired ${Math.abs(days)}d ago` :
    days === 0  ? 'Expires today' :
    `${days}d left`
  return <span className={`status-chip status-chip--${cls}`}>{label}</span>
}

const SECTIONS = [
  { key: 'expired',  label: 'Expired',              color: '#dc2626', bg: '#fef2f2', test: d => d < 0 },
  { key: 'critical', label: 'Critical  (≤ 14 days)', color: '#f97316', bg: '#fff7ed', test: d => d >= 0 && d <= 14 },
  { key: 'warning',  label: 'Warning  (15 – 30 days)',color: '#d97706', bg: '#fffbeb', test: d => d > 14 && d <= 30 },
  { key: 'upcoming', label: `Upcoming  (31 – ${THRESHOLD} days)`, color: '#0ea5e9', bg: '#f0f9ff', test: d => d > 30 && d <= THRESHOLD },
]

export default function HomePage() {
  const [renewals, setRenewals]         = useState([])
  const [catalogTypes, setCatalogTypes] = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [data, types] = await Promise.all([
        api.getRenewals(),
        api.getCatalogTypes(),
      ])
      setRenewals(data)
      setCatalogTypes(types)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const typeMap = Object.fromEntries(catalogTypes.map(t => [t.slug, t.label]))

  // Items needing attention (within threshold or expired)
  const attention = renewals
    .map(r => ({ ...r, _days: daysUntil(r.expiry_date) }))
    .filter(r => r._days <= THRESHOLD)
    .sort((a, b) => a._days - b._days)

  const totalCount    = renewals.length
  const expiredCount  = renewals.filter(r => daysUntil(r.expiry_date) < 0).length
  const criticalCount = renewals.filter(r => { const d = daysUntil(r.expiry_date); return d >= 0 && d <= 14 }).length
  const warningCount  = renewals.filter(r => { const d = daysUntil(r.expiry_date); return d > 14 && d <= 30 }).length

  return (
    <div className="home-page">
      {/* ── Header ── */}
      <div className="home-header">
        <div>
          <h1 className="home-title">Dashboard</h1>
          <p className="home-subtitle">Items requiring attention in the next {THRESHOLD} days</p>
        </div>
      </div>

      {/* ── Top stat bar ── */}
      <div className="home-stats">
        <div className="stat-card">
          <span className="stat-value">{totalCount}</span>
          <span className="stat-label">Total tracked</span>
        </div>
        {catalogTypes.map(ct => (
          <div key={ct.slug} className="stat-card">
            <span className="stat-value">{renewals.filter(r => r.type === ct.slug).length}</span>
            <span className="stat-label">{ct.label}</span>
          </div>
        ))}
        <div className="stat-card stat-card--warning">
          <span className="stat-value">{warningCount + criticalCount}</span>
          <span className="stat-label">Expiring ≤ 30d</span>
        </div>
        <div className="stat-card stat-card--danger">
          <span className="stat-value">{expiredCount}</span>
          <span className="stat-label">Expired</span>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <div className="home-loading">Loading…</div>
      ) : attention.length === 0 ? (
        <div className="home-all-good">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <polyline points="9 12 11 14 15 10"/>
          </svg>
          <p>All items are healthy — nothing expiring within the next {THRESHOLD} days.</p>
        </div>
      ) : (
        <div className="attention-sections">
          {SECTIONS.map(sec => {
            const rows = attention.filter(r => sec.test(r._days))
            if (rows.length === 0) return null
            return (
              <div key={sec.key} className="attention-section">
                <div className="section-heading" style={{ borderLeftColor: sec.color }}>
                  <span className="section-title" style={{ color: sec.color }}>{sec.label}</span>
                  <span className="section-count" style={{ background: sec.bg, color: sec.color }}>{rows.length}</span>
                </div>
                <div className="renewals-table-wrap">
                  <table className="renewals-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Name</th>
                        <th>Environment</th>
                        <th>Expiry Date</th>
                        <th>Status</th>
                        <th>Owner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.id} className={`renewal-row renewal-row--${urgencyClass(r._days)}`}>
                          <td><TypeBadge type={r.type} label={typeMap[r.type] || r.type} /></td>
                          <td className="cell-name">{r.name}</td>
                          <td>{r.environment || '—'}</td>
                          <td className="cell-date">{r.expiry_date?.slice(0, 10)}</td>
                          <td><StatusChip days={r._days} /></td>
                          <td>{r.owner || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
