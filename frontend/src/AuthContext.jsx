import { createContext, useContext, useState, useEffect } from 'react'
import { api } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('smartqx_user')) } catch { return null }
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = sessionStorage.getItem('smartqx_token')
    if (token && !user) {
      api.get('/auth/me')
        .then(r => { setUser(r.data); sessionStorage.setItem('smartqx_user', JSON.stringify(r.data)) })
        .catch(() => { sessionStorage.removeItem('smartqx_token'); sessionStorage.removeItem('smartqx_user') })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const signup = async (name, email, password, role = 'user') => {
    const res = await api.post('/auth/signup', { name, email, password, role })
    sessionStorage.setItem('smartqx_token', res.data.token)
    sessionStorage.setItem('smartqx_user', JSON.stringify(res.data.user))
    setUser(res.data.user)
    return res.data
  }

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    sessionStorage.setItem('smartqx_token', res.data.token)
    sessionStorage.setItem('smartqx_user', JSON.stringify(res.data.user))
    setUser(res.data.user)
    return res.data
  }

  const logout = () => {
    sessionStorage.removeItem('smartqx_token')
    sessionStorage.removeItem('smartqx_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, signup, login, logout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
