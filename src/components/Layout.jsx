import { useState } from 'react'
import { Outlet, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Sidebar from './Sidebar.jsx'
import RenewalAlertModal from './RenewalAlertModal.jsx'
import ClaresLogo from './ClaresLogo.jsx'
import './Layout.css'

export default function Layout() {
  const { currentUser, logout } = useAuth()
  // Start open on desktop, closed on mobile
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768)

  return (
    <div className="layout">
      {/* ── Top nav ── */}
      <header className="layout-nav">
        <div className="layout-nav-left">
          <button
            className={`layout-hamburger${sidebarOpen ? ' layout-hamburger--open' : ''}`}
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            {sidebarOpen ? (
              // X / close icon when open
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6"  x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            ) : (
              // Hamburger when closed
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6"  x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            )}
          </button>
          <Link to="/home" className="layout-nav-brand">
            <ClaresLogo size={28} variant="dark" />
            <span className="layout-nav-title">CLARES</span>
          </Link>
        </div>

        <div className="layout-nav-right">
          <span className="layout-nav-user">
            {currentUser?.displayName || currentUser?.username}
            {currentUser?.role === 'admin' && (
              <span className="layout-nav-role">admin</span>
            )}
          </span>
          <button className="layout-nav-logout" onClick={logout} title="Sign out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign out
          </button>
        </div>
      </header>

      {/* ── Body: sidebar + content ── */}
      <div className="layout-body">
        {/* Mobile overlay — tap to close */}
        {sidebarOpen && (
          <div className="layout-sidebar-overlay" onClick={() => setSidebarOpen(false)} />
        )}

        <aside className={`layout-sidebar${sidebarOpen ? ' layout-sidebar--open' : ''}`}>
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </aside>

        <main className="layout-main">
          <Outlet />
        </main>
      </div>

      {/* ── Renewal alert (shown once per session for admins) ── */}
      <RenewalAlertModal />
    </div>
  )
}

