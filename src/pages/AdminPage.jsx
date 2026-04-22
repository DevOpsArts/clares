import { useState, useEffect } from 'react'
import { api } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import './AdminPage.css'

const EMPTY_SMTP = {
  host: '', port: 587, secure: false,
  username: '', password: '', from_email: '', from_name: 'CLARES',
}

export default function AdminPage() {
  const { currentUser } = useAuth()
  const isAdmin         = currentUser?.role === 'admin'

  const [smtp, setSmtp]               = useState(EMPTY_SMTP)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [testing, setTesting]         = useState(false)
  const [sending, setSending]         = useState(false)
  const [saveMsg, setSaveMsg]         = useState('')
  const [testMsg, setTestMsg]         = useState('')
  const [testOk, setTestOk]           = useState(null)
  const [sendMsg, setSendMsg]         = useState('')
  const [sendOk, setSendOk]           = useState(null)
  const [error, setError]             = useState('')

  useEffect(() => {
    if (!isAdmin) return
    api.getSmtpConfig()
      .then((cfg) => setSmtp({ ...EMPTY_SMTP, ...cfg }))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [isAdmin])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setSaveMsg('')
    setError('')
    try {
      await api.saveSmtpConfig(smtp)
      setSaveMsg('Settings saved.')
      setTimeout(() => setSaveMsg(''), 3000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestMsg('')
    setTestOk(null)
    try {
      const res = await api.testSmtpConnection()
      setTestMsg(res.message || 'Connection successful!')
      setTestOk(true)
    } catch (e) {
      setTestMsg(e.message)
      setTestOk(false)
    } finally {
      setTesting(false)
    }
  }

  async function handleSendReminders() {
    if (!window.confirm('Send reminder emails for all enabled items within their reminder window?')) return
    setSending(true)
    setSendMsg('')
    setSendOk(null)
    try {
      const res = await api.sendReminders()
      setSendMsg(res.message || 'Done.')
      setSendOk(true)
    } catch (e) {
      setSendMsg(e.message)
      setSendOk(false)
    } finally {
      setSending(false)
    }
  }

  if (!isAdmin) {
    return <div className="admin-page"><p className="admin-denied">Admin access required.</p></div>
  }

  if (loading) return <div className="admin-page"><div className="admin-loading">Loading…</div></div>

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1 className="admin-title">Admin Settings</h1>
        <p className="admin-subtitle">Configure SMTP and manage reminder dispatch.</p>
      </div>

      {/* ── SMTP config ── */}
      <section className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <div>
            <h2 className="admin-card-title">SMTP Settings</h2>
            <p className="admin-card-sub">Used for sending email reminders to item owners.</p>
          </div>
        </div>

        {error && <div className="form-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        <form onSubmit={handleSave} className="admin-form">
          <div className="form-row">
            <div className="form-group">
              <label>SMTP Host <span className="req">*</span></label>
              <input type="text" placeholder="smtp.example.com" value={smtp.host}
                onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Port</label>
              <input type="number" min={1} max={65535} value={smtp.port}
                onChange={(e) => setSmtp({ ...smtp, port: parseInt(e.target.value, 10) || 587 })} />
            </div>
          </div>

          <div className="form-group">
            <label className="toggle-label">
              <span>Use TLS / Secure connection</span>
              <label className="toggle">
                <input type="checkbox" checked={!!smtp.secure}
                  onChange={(e) => setSmtp({ ...smtp, secure: e.target.checked })} />
                <span className="toggle-slider" />
              </label>
            </label>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Username</label>
              <input type="text" placeholder="smtp_user@example.com" value={smtp.username}
                onChange={(e) => setSmtp({ ...smtp, username: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" placeholder="••••••••" value={smtp.password}
                onChange={(e) => setSmtp({ ...smtp, password: e.target.value })} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>From Email <span className="req">*</span></label>
              <input type="email" placeholder="noreply@example.com" value={smtp.from_email}
                onChange={(e) => setSmtp({ ...smtp, from_email: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>From Name</label>
              <input type="text" placeholder="CLARES" value={smtp.from_name}
                onChange={(e) => setSmtp({ ...smtp, from_name: e.target.value })} />
            </div>
          </div>

          <div className="admin-form-actions">
            <button type="button" className="btn-secondary" onClick={handleTest} disabled={testing || !smtp.host}>
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>

          {saveMsg && <div className="admin-msg admin-msg--ok">{saveMsg}</div>}
          {testMsg && (
            <div className={`admin-msg admin-msg--${testOk ? 'ok' : 'err'}`}>
              {testOk ? '✓' : '✗'} {testMsg}
            </div>
          )}
        </form>
      </section>

      {/* ── Send reminders ── */}
      <section className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-icon admin-card-icon--green">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3z"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </div>
          <div>
            <h2 className="admin-card-title">Send Reminder Emails</h2>
            <p className="admin-card-sub">
              Triggers an email for every enabled item currently within its reminder window.
              The owner email is taken from the "Owner Email" field on each entry.
            </p>
          </div>
        </div>

        <button className="btn-primary" onClick={handleSendReminders} disabled={sending} style={{ marginTop: '0.5rem' }}>
          {sending ? 'Sending…' : 'Send Reminders Now'}
        </button>

        {sendMsg && (
          <div className={`admin-msg admin-msg--${sendOk ? 'ok' : 'err'}`} style={{ marginTop: '0.75rem' }}>
            {sendOk ? '✓' : '✗'} {sendMsg}
          </div>
        )}
      </section>
    </div>
  )
}
