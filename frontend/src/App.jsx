import { Suspense, lazy } from 'react'
import { Route, Routes, NavLink, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import { LogOut } from 'lucide-react'

const LoginPage      = lazy(() => import('./pages/LoginPage'))
const UserQueue      = lazy(() => import('./pages/UserQueue'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const GateScanner    = lazy(() => import('./pages/GateScanner'))

function Loader() {
  return (
    <div className="loader-screen">
      <div className="loader-badge">Smart-QX</div>
      <h1>Loading admission system…</h1>
    </div>
  )
}

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth()
  if (loading) return <Loader />
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />
  return children
}

function Topbar() {
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  if (!user) return null

  return (
    <nav className="topbar">
      <div className="topbar-brand">
        <div className="topbar-logo">QX</div>
        <span className="topbar-name">Smart-QX</span>
      </div>
      <div className="topbar-nav">
        {user.role === 'user' && (
          <NavLink to="/" end className={({ isActive }) => 'topbar-link' + (isActive ? ' is-active' : '')}>
            Queue Portal
          </NavLink>
        )}
        {isAdmin && (
          <NavLink to="/admin" className={({ isActive }) => 'topbar-link' + (isActive ? ' is-active' : '')}>
            Admin Dashboard
          </NavLink>
        )}
        {isAdmin && (
          <NavLink to="/scanner" className={({ isActive }) => 'topbar-link' + (isActive ? ' is-active' : '')}>
            Gate Scanner
          </NavLink>
        )}
        <div className="topbar-user">
          <span className="topbar-user-name">{user.name}</span>
          <span className="topbar-user-role">{user.role}</span>
        </div>
        <button className="topbar-link" onClick={handleLogout} style={{ cursor: 'pointer', background: 'none', border: 'none' }}>
          <LogOut size={15}/> Logout
        </button>
      </div>
    </nav>
  )
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) return <Loader />

  return (
    <>
      <Topbar />
      <Suspense fallback={<Loader />}>
        <Routes>
          <Route path="/login" element={user ? <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace /> : <LoginPage />} />
          <Route path="/" element={<ProtectedRoute><UserQueue /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
          <Route path="/scanner" element={<ProtectedRoute><GateScanner /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
