import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Clock, Copy, QrCode, ShieldCheck, Users, Zap, Lock, BarChart3, ArrowRight, TrendingUp } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { api, getWebSocketURL } from '../api'
import { useAuth } from '../AuthContext'

const ACCESS_ROLES = [
  { value: 'general',  label: 'General',  desc: 'Standard FIFO with fairness aging.' },
  { value: 'priority', label: 'Priority', desc: 'Elevated class — balanced with fairness.' },
  { value: 'vip',      label: 'VIP',      desc: 'Fast-lane, still governed by PID control.' },
]

const WORKFLOW = [
  { label: 'Identity Registered',       desc: 'Account verified and access class selected.' },
  { label: 'Joined Adaptive Queue',     desc: 'Placed into the PID-controlled queue.' },
  { label: 'Tracking Live Position',    desc: 'ETA and safety mode updating in real-time.' },
  { label: 'QR Ticket Ready at Gate',   desc: 'Present your signed QR ticket for scanning.' },
  { label: 'Admitted — Entry Logged',   desc: 'Gate validated and audit trail recorded.' },
]

const fadeUp = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } }

function ProbabilityBar({ probability, etaMins }) {
  return (
    <div className="prob-card">
      <div className="prob-header">
        <span className="prob-label">Entry Probability</span>
        <strong className="prob-value">{probability}%</strong>
      </div>
      <div className="prob-bar-track">
        <motion.div
          className="prob-bar-fill"
          initial={{ width: 0 }}
          animate={{ width: `${probability}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          style={{
            background: probability >= 90 ? 'var(--green)' : probability >= 70 ? 'var(--cyan)' : 'var(--amber)'
          }}
        />
      </div>
      <p className="prob-note">
        {probability >= 90
          ? `You have a ${probability}% chance of entering within ${etaMins} minutes.`
          : `Estimated entry within ${etaMins} min. PID is adapting admission rate.`}
      </p>
    </div>
  )
}

export default function UserQueue() {
  const { user } = useAuth()
  const [accessRole,    setAccessRole]    = useState('general')
  const [queueStatus,   setQueueStatus]   = useState(null)
  const [loading,       setLoading]       = useState(false)
  const [copyLabel,     setCopyLabel]     = useState('Copy Token')
  const [activeStep,    setActiveStep]    = useState(0)
  const [admitted,      setAdmitted]      = useState(false)
  const [events,        setEvents]        = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const emailRef = useRef(user?.email)

  useEffect(() => {
    api.get('/events/active').then(res => {
      setEvents(res.data)
      if (res.data.length > 0) setSelectedEvent(res.data[0].id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (selectedEvent && user?.email) {
      fetchPosition()
    }
  }, [selectedEvent, user])

  // Determine active workflow step from state
  useEffect(() => {
    if (admitted)      { setActiveStep(4); return }
    if (queueStatus)   { setActiveStep(2); return }
    setActiveStep(0)
  }, [queueStatus, admitted])

  // WebSocket for live updates
  useEffect(() => {
    if (!queueStatus && !admitted) return
    const ws = new WebSocket(getWebSocketURL())
    ws.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data)
        if (d.type === 'user_admitted' && d.admitted_email === emailRef.current) {
          setAdmitted(true)
          setActiveStep(4)
          return
        }
        if (['queue_joined', 'system_state', 'user_admitted'].includes(d.type)) {
          if (queueStatus) fetchPosition()
        }
      } catch {}
    }
    return () => ws.close()
  }, [queueStatus, admitted])

  const fetchPosition = async () => {
    try {
      const res = await api.get(`/position?email=${encodeURIComponent(user.email)}&event_id=${selectedEvent}`)
      setQueueStatus(res.data)
      // Step 3 once in queue: if ticket is in hand and step was 2, move to 3
      if (res.data.token) setActiveStep(prev => Math.max(prev, 2))
    } catch {}
  }

  const joinQueue = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/join-queue', { role: accessRole, event_id: selectedEvent })
      setActiveStep(1)
      setTimeout(async () => {
        await fetchPosition()
        setActiveStep(2)
      }, 500)
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to join queue.')
    } finally { setLoading(false) }
  }

  const copyToken = async () => {
    if (!queueStatus?.token) return
    try {
      await navigator.clipboard.writeText(queueStatus.token)
      setCopyLabel('Copied!')
      setActiveStep(prev => Math.max(prev, 3)) // step 4: QR ready at gate
    } catch { setCopyLabel('Copy failed') }
    setTimeout(() => setCopyLabel('Copy Token'), 2000)
  }

  const tel = queueStatus?.telemetry ?? {}
  const riskCls = tel.risk_level === 'critical' ? 'pill pill-red' : tel.risk_level === 'watch' ? 'pill pill-amber' : 'pill pill-green'

  return (
    <div className="page-shell">
      <div className="page-grid">

        {/* LEFT: Workflow tracker */}
        <motion.section className="panel hero-panel" {...fadeUp}>
          <div className="eyebrow">Smart-QX · Admission Workflow</div>
          <h1 className="headline">
            Welcome, <span>{user?.name?.split(' ')[0]}</span>
          </h1>
          <p className="subhead">
            Your real-time admission dashboard. Each step below updates automatically
            as you progress through the Smart-QX queue system.
          </p>

          {/* 5-step real-time tracker */}
          <div className="inset-panel" style={{ marginTop: 22 }}>
            <div className="section-label">Live Workflow Progress</div>
            <div className="workflow-list" style={{ marginTop: 14 }}>
              {WORKFLOW.map((step, i) => (
                <motion.div
                  key={step.label}
                  layout
                  className={`workflow-step ${i === activeStep ? 'is-active' : ''} ${i < activeStep ? 'is-complete' : ''}`}
                >
                  <span className="step-index">
                    {i < activeStep ? <CheckCircle2 size={16}/> : i + 1}
                  </span>
                  <div>
                    <strong>{step.label}</strong>
                    <p>
                      {i === activeStep ? '● Currently active.' : i < activeStep ? '✓ Completed.' : step.desc}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Live telemetry mini-bar */}
          {queueStatus && (
            <div className="insight-grid" style={{ marginTop: 16 }}>
              <article className="insight-card">
                <div className="insight-icon"><Users size={17}/></div>
                <div>
                  <strong>Crowd State</strong>
                  <p>Density {tel.crowd_density ?? 0}% · Risk: <em>{tel.risk_level || 'stable'}</em></p>
                </div>
              </article>
              <article className="insight-card">
                <div className="insight-icon"><Zap size={17}/></div>
                <div>
                  <strong>Admission Rate</strong>
                  <p>{queueStatus.entry_rate ?? '—'} persons/min (PID-controlled)</p>
                </div>
              </article>
            </div>
          )}
        </motion.section>

        {/* RIGHT: Action panel */}
        <AnimatePresence mode="wait">

          {/* Admitted State */}
          {admitted && (
            <motion.section key="admitted" className="panel action-panel"
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
              <div className="section-label">Step 5 of 5 — Admitted</div>
              <div className="validation-result is-success" style={{ marginTop: 16 }}>
                <CheckCircle2 size={64}/>
                <h2>Entry Granted!</h2>
                <p>You've been admitted. Your entry has been logged in the audit trail.</p>
              </div>
              <div className="button-row" style={{ marginTop: 20 }}>
                <button className="button-secondary" onClick={() => { setQueueStatus(null); setAdmitted(false); setActiveStep(0) }}>
                  Join Another Queue
                </button>
              </div>
            </motion.section>
          )}

          {/* Live Ticket */}
          {!admitted && queueStatus && (
            <motion.section key="ticket" className="panel action-panel"
              initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>

              <div className="section-label">Step 3 of 5 — Live Queue Ticket</div>
              <h2 className="panel-title">You're in the Queue</h2>
              <p className="panel-copy">
                Your signed QR ticket is active. Position and ETA update live via WebSocket.
              </p>

              <div className="status-pills" style={{ marginTop: 12 }}>
                <span className="pill pill-accent">{queueStatus.access_role?.toUpperCase()}</span>
                <span className="pill pill-accent">{queueStatus.flow_mode}</span>
                <span className={riskCls}>Risk: {tel.risk_level || 'stable'}</span>
                <span className="pill">{tel.network_mode || 'online'}</span>
              </div>

              {/* Entry probability bar */}
              <ProbabilityBar
                probability={queueStatus.entry_probability ?? 90}
                etaMins={queueStatus.confidence_mins}
              />

              <div className="ticket-layout">
                <div className="qr-card">
                  <div className="qr-topline">
                    <span className="ticket-chip"><QrCode size={14}/> #{queueStatus.ticket_id}</span>
                    <span className="ticket-chip"><ShieldCheck size={14}/> JWT Signed</span>
                  </div>
                  <div className="qr-surface">
                    <QRCodeSVG value={queueStatus.token || 'smartqx'} size={190}/>
                  </div>
                  <button className="button-secondary" onClick={copyToken}>
                    <Copy size={15}/> {copyLabel}
                  </button>
                </div>

                <div className="metric-grid">
                  <article className="metric-card">
                    <span className="metric-label">Queue Position</span>
                    <strong className="metric-value" style={{ color: 'var(--cyan)' }}>#{queueStatus.position}</strong>
                    <p className="metric-note">of {queueStatus.total_in_queue} in queue</p>
                  </article>
                  <article className="metric-card">
                    <span className="metric-label">90% Entry Window</span>
                    <strong className="metric-value">{queueStatus.confidence_mins}<span style={{ fontSize:'1rem', fontWeight:400 }}> min</span></strong>
                    <p className="metric-note">Base ETA: {queueStatus.eta_minutes} min</p>
                  </article>
                  <article className="metric-card">
                    <span className="metric-label">Fairness Boost</span>
                    <strong className="metric-value" style={{ color:'var(--green)' }}>+{queueStatus.aging_boost}</strong>
                    <p className="metric-note">Anti-starvation aging applied</p>
                  </article>
                  <article className="metric-card">
                    <span className="metric-label">Gate Load</span>
                    <strong className="metric-value">{tel.gate_load ?? 0}<span style={{ fontSize:'1rem', fontWeight:400 }}>%</span></strong>
                    <p className="metric-note">Live pressure from telemetry</p>
                  </article>
                </div>
              </div>

              <div className="button-row" style={{ marginTop: 18 }}>
                <button className="button-secondary" onClick={() => setQueueStatus(null)}>
                  Leave Queue
                </button>
              </div>
            </motion.section>
          )}

          {/* Join Form */}
          {!admitted && !queueStatus && (
            <motion.section key="join" className="panel action-panel" {...fadeUp} transition={{ delay: 0.1 }}>
              <div className="section-label">Step 1 of 5 — Join Queue</div>
              <h2 className="panel-title">Select Your Access Class</h2>
              <p className="panel-copy">
                You're signed in as <strong>{user?.email}</strong>. Choose your access tier
                and join the adaptive queue. A signed QR ticket will be issued instantly.
              </p>

              <form className="form-grid" onSubmit={joinQueue}>
                <div className="field">
                  <span>Access Class</span>
                  <div className="role-grid">
                    {ACCESS_ROLES.map(r => (
                      <button key={r.value} type="button"
                        className={`role-card ${accessRole === r.value ? 'is-selected' : ''}`}
                        onClick={() => setAccessRole(r.value)}
                      >
                        <strong>{r.label}</strong>
                        <p>{r.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <span>Select Event</span>
                  {events.length === 0 ? (
                    <div className="metric-note">No active events currently available.</div>
                  ) : (
                    <select
                      className="input-control"
                      value={selectedEvent || ''}
                      onChange={(e) => setSelectedEvent(Number(e.target.value))}
                      required
                    >
                      {events.map((evt) => (
                        <option key={evt.id} value={evt.id}>
                          {evt.name} {evt.venue && `— ${evt.venue}`}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="inset-panel" style={{ marginTop: 0 }}>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                      <p className="metric-label">Joining as</p>
                      <strong style={{ color: 'var(--cyan)' }}>{user?.name}</strong>
                    </div>
                    <div>
                      <p className="metric-label">Email</p>
                      <strong style={{ fontSize: '0.88rem' }}>{user?.email}</strong>
                    </div>
                  </div>
                </div>

                <div className="button-row">
                  <button type="submit" className="button-primary" disabled={loading || !selectedEvent}>
                    {loading ? 'Issuing Ticket…' : 'Issue Ticket & Join Queue'}
                    {!loading && <ArrowRight size={16}/>}
                  </button>
                </div>
              </form>
            </motion.section>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}
