import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import ClaresLogo from './ClaresLogo.jsx'
import './Login.css'

export default function Login() {
  const { login, currentUser } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  if (currentUser) {
    navigate('/home', { replace: true })
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await login(username, password)
    setLoading(false)
    if (!result.ok) {
      setError(result.error || 'Invalid username or password.')
      return
    }
    navigate('/home', { replace: true })
  }

  return (
    <div className="lp-root">
      <div className="lp-card">

        {/* ── Left panel ── */}
        <div className="lp-left">
          {/* decorative circles */}
          <div className="lp-circle lp-circle--tl" />
          <div className="lp-circle lp-circle--br" />

          <div className="lp-left-content">
            {/* Logo */}
            <div className="lp-logo">
              <ClaresLogo size={36} variant="light" />
              <span className="lp-logo-name">CLARES</span>
            </div>

            <p className="lp-left-eyebrow">Compliance License &amp; Asset Reminder Engine System</p>
            <h1 className="lp-left-title">Welcome</h1>
            <p className="lp-left-sub">Your compliance renewal tracker — stay ahead of every expiry.</p>
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="lp-right">
          <h2 className="lp-right-title">Welcome</h2>
          <p className="lp-right-sub">Login to your account to continue</p>

          <form onSubmit={handleSubmit} noValidate className="lp-form">
            <input
              type="text"
              className="lp-input"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              required
            />
            <input
              type="password"
              className="lp-input"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
            />

            {error && <p className="lp-error" role="alert">{error}</p>}

            <button type="submit" className="lp-btn" disabled={loading}>
              {loading ? 'SIGNING IN…' : 'LOG IN'}
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}
