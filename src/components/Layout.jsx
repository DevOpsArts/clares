import { useState } from 'react'
import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Sidebar from './Sidebar.jsx'
import RenewalAlertModal from './RenewalAlertModal.jsx'
import ClaresLogo from './ClaresLogo.jsx'
import './Layout.css'

export default function Layout() {
  const { currentUser, logout } = useAuth()
  const navigate = useNavigate()
  const isAdmin = currentUser?.role === 'admin'
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
          <div className="layout-user-menu">
            <button className="layout-user-trigger">
              <span className="layout-nav-user">
                {currentUser?.displayName || currentUser?.username}
              </span>
              <svg className="layout-user-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            <div className="layout-user-dropdown">
              {isAdmin && (
                <>
                  <button className="layout-dropdown-item" onClick={() => navigate('/admin')}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                    SMTP Settings
                  </button>
                  <button className="layout-dropdown-item" onClick={() => navigate('/users')}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    User Management
                  </button>
                  <div className="layout-dropdown-divider" />
                </>
              )}
              <button className="layout-dropdown-item layout-dropdown-item--danger" onClick={logout}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Sign Out
              </button>
            </div>
          </div>
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

