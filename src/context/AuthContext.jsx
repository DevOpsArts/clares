import { createContext, useContext, useState } from 'react'
import { api } from '../services/api.js'

const SESSION_KEY = 'clares_session'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY)
      return raw ? JSON.parse(raw).user : null
    } catch {
      return null
    }
  })

  const login = async (username, password) => {
    try {
      const { token, user } = await api.login(username, password)
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }))
      setCurrentUser(user)
      return { ok: true, user }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  }

  const logout = () => {
    sessionStorage.removeItem(SESSION_KEY)
    setCurrentUser(null)
  }

  return (
    <AuthContext.Provider value={{ currentUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
