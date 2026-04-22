import { useState, useEffect } from 'react'
import { api } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import './RenewalAlertModal.css'

const DISMISSED_KEY = 'clares_renewal_alert_dismissed'

function daysUntil(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(dateStr) - today) / (1000 * 60 * 60 * 24))
}

const TYPE_LABEL = { ssl: 'SSL Cert', secret: 'Secret', license: 'License' }
const TYPE_COLOR = { ssl: 'ram-badge--ssl', secret: 'ram-badge--secret', license: 'ram-badge--license' }

function urgencyClass(days) {
  if (days < 0)   return 'ram-row--expired'
  if (days <= 7)  return 'ram-row--critical'
  if (days <= 30) return 'ram-row--warning'
  return ''
}

function chipLabel(days) {
  if (days < 0)   return `Expired ${Math.abs(days)}d ago`
  if (days === 0) return 'Expires today'
  return `${days}d left`
}

function chipClass(days) {
  if (days < 0)   return 'ram-chip--expired'
  if (days <= 7)  return 'ram-chip--critical'
  if (days <= 30) return 'ram-chip--warning'
  return 'ram-chip--ok'
}

export default function RenewalAlertModal() {
  const { currentUser } = useAuth()
  const [visible, setVisible]   = useState(false)
  const [renewals, setRenewals] = useState([])
  const [loading, setLoading]   = useState(true)

  const isAdmin = currentUser?.role === 'admin'

  useEffect(() => {
    if (!isAdmin) return
    if (sessionStorage.getItem(DISMISSED_KEY)) return

    api.getRenewals()
      .then((data) => {
        const urgent = data.filter((r) => daysUntil(r.expiry_date) <= 30)
        setRenewals(urgent)
        if (urgent.length > 0) setVisible(true)
      })
      .catch(() => { /* fail silently */ })
      .finally(() => setLoading(false))
  }, [isAdmin])

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1')
    setVisible(false)
  }

  if (!visible || loading) return null

  const expired  = renewals.filter((r) => daysUntil(r.expiry_date) < 0)
  const critical = renewals.filter((r) => { const d = daysUntil(r.expiry_date); return d >= 0 && d <= 7 })
  const warning  = renewals.filter((r) => { const d = daysUntil(r.expiry_date); return d > 7 && d <= 30 })

  return (
    <div className="ram-overlay" role="dialog" aria-modal="true" aria-labelledby="ram-title">
      <div className="ram-modal">
        {/* Header */}
        <div className="ram-header">
          <div className="ram-header-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div>
            <h2 className="ram-title" id="ram-title">Renewal Alerts</h2>
            <p className="ram-subtitle">
              {renewals.length} item{renewals.length !== 1 ? 's' : ''} need{renewals.length === 1 ? 's' : ''} attention
            </p>
          </div>
          <button className="ram-close" onClick={dismiss} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Summary pills */}
        <div className="ram-summary">
          {expired.length  > 0 && <span className="ram-summary-pill ram-summary-pill--expired">{expired.length} Expired</span>}
          {critical.length > 0 && <span className="ram-summary-pill ram-summary-pill--critical">{critical.length} Critical (≤7d)</span>}
          {warning.length  > 0 && <span className="ram-summary-pill ram-summary-pill--warning">{warning.length} Expiring ≤30d</span>}
        </div>

        {/* Table */}
        <div className="ram-table-wrap">
          <table className="ram-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Name</th>
                <th>Environment</th>
                <th>Expiry Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {renewals.map((r) => {
                const days = daysUntil(r.expiry_date)
                return (
                  <tr key={r.id} className={`ram-row ${urgencyClass(days)}`}>
                    <td>
                      <span className={`ram-badge ${TYPE_COLOR[r.type] ?? ''}`}>
                        {TYPE_LABEL[r.type] ?? r.type}
                      </span>
                    </td>
                    <td className="ram-cell-name">{r.name}</td>
                    <td>{r.environment || '—'}</td>
                    <td className="ram-cell-date">{r.expiry_date?.slice(0, 10)}</td>
                    <td>
                      <span className={`ram-chip ${chipClass(days)}`}>{chipLabel(days)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="ram-footer">
          <span className="ram-footer-hint">Review the full list on the Home page.</span>
          <button className="ram-btn-close" onClick={dismiss}>Got it, close</button>
        </div>
      </div>
    </div>
  )
}
