import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogIn, UserPlus, ArrowRight, Shield, Users, Zap, BarChart3 } from 'lucide-react'
import { useAuth } from '../AuthContext'

const fadeUp = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } }

const HIGHLIGHTS = [
  { icon: <Zap size={18}/>,       title: 'PID-Controlled Admission', desc: 'Entry rate adapts in real-time based on live crowd telemetry and gate pressure.' },
  { icon: <Shield size={18}/>,    title: 'Signed QR Tickets',        desc: 'JWT-secured tokens for tamper-proof, offline-capable gate validation.' },
  { icon: <Users size={18}/>,     title: 'Fair Queue Scheduling',    desc: 'Aging boosts prevent starvation — no one waits forever behind VIPs.' },
  { icon: <BarChart3 size={18}/>, title: 'Live Analytics',           desc: 'Real-time metrics, entry probability, and crowd safety modes.' },
]

export default function LoginPage() {
  const [mode, setMode]       = useState('login') // 'login' | 'signup'
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole]       = useState('user')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const { login, signup } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      let data
      if (mode === 'signup') {
        data = await signup(name, email, password, role)
      } else {
        data = await login(email, password)
      }
      navigate(data.user.role === 'admin' ? '/admin' : '/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Authentication failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-shell">
      <div className="page-grid">

        {/* LEFT: Branding */}
        <motion.section className="panel hero-panel" {...fadeUp}>
          <div className="eyebrow">Smart-QX Platform</div>
          <h1 className="headline">
            Intelligent<br /><span>Crowd Admission</span>
          </h1>
          <p className="subhead">
            Smart-QX uses PID control theory, real-time telemetry, and cryptographic tokens
            to manage venue admission — adaptively, fairly, and securely.
          </p>

          <div className="feature-grid">
            {HIGHLIGHTS.map(h => (
              <article key={h.title} className="feature-card">
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, color:'var(--cyan)' }}>
                  {h.icon}
                  <h3 style={{ margin:0 }}>{h.title}</h3>
                </div>
                <p>{h.desc}</p>
              </article>
            ))}
          </div>
        </motion.section>

        {/* RIGHT: Auth Form */}
        <motion.section className="panel action-panel" {...fadeUp} transition={{ delay: 0.1 }}>
          <div className="auth-toggle">
            <button
              className={`auth-tab ${mode === 'login' ? 'is-active' : ''}`}
              onClick={() => { setMode('login'); setError('') }}
            >
              <LogIn size={16}/> Sign In
            </button>
            <button
              className={`auth-tab ${mode === 'signup' ? 'is-active' : ''}`}
              onClick={() => { setMode('signup'); setError('') }}
            >
              <UserPlus size={16}/> Create Account
            </button>
          </div>

          <h2 className="panel-title" style={{ marginTop: 20 }}>
            {mode === 'login' ? 'Welcome Back' : 'Create Your Account'}
          </h2>
          <p className="panel-copy">
            {mode === 'login'
              ? 'Sign in to access the queue portal, admin dashboard, or gate scanner.'
              : 'Register as a visitor to join queues, or as an admin to manage events and gates.'}
          </p>

          {error && (
            <div className="auth-error">
              {error}
            </div>
          )}

          <form className="form-grid" onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <label className="field">
                <span>Full Name</span>
                <input className="input-control" value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Aarav Singh" required />
              </label>
            )}

            <label className="field">
              <span>Email Address</span>
              <input className="input-control" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" required />
            </label>

            <label className="field">
              <span>Password</span>
              <input className="input-control" type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required minLength={4} />
            </label>

            {mode === 'signup' && (
              <div className="field">
                <span>Account Type</span>
                <div className="role-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <button type="button" className={`role-card ${role === 'user' ? 'is-selected' : ''}`}
                    onClick={() => setRole('user')}>
                    <strong><Users size={15} style={{ verticalAlign: 'middle', marginRight: 6 }}/>Visitor</strong>
                    <p>Join queues, track position, and receive signed QR tickets for gate entry.</p>
                  </button>
                  <button type="button" className={`role-card ${role === 'admin' ? 'is-selected' : ''}`}
                    onClick={() => setRole('admin')}>
                    <strong><Shield size={15} style={{ verticalAlign: 'middle', marginRight: 6 }}/>Admin</strong>
                    <p>Create events, authorize gates, control PID settings, and monitor analytics.</p>
                  </button>
                </div>
              </div>
            )}

            <div className="button-row">
              <button type="submit" className="button-primary" disabled={loading} style={{ flex: 1 }}>
                {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
                {!loading && <ArrowRight size={16}/>}
              </button>
            </div>
          </form>

          <p className="auth-switch">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}>
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </motion.section>
      </div>
    </div>
  )
}
