import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, AlertTriangle, Gauge, Shield, TimerReset, Waves, Radio, Cpu, Users,
         CalendarPlus, DoorOpen, Trash2, Plus, CheckCircle2, TrendingUp, Clock } from 'lucide-react'
import { api, getWebSocketURL } from '../api'

const DEFAULTS = {
  queue_size: 0, entry_rate: 0, target: 100,
  queue_backend: '—', database_backend: '—',
  queue_preview: [],
  telemetry: { crowd_density: 0, gate_load: 0, network_mode: 'online', emergency_override: false, risk_score: 0, risk_level: 'stable', flow_mode: 'Normal Flow' },
  role_mix: { general: 0, priority: 0, vip: 0, staff: 0 },
  events: [], anomaly_count: 0,
  analytics: { admitted_today: 0, total_joined_today: 0, avg_wait_minutes: 0, peak_queue_size: 0 },
}

const fadeUp = (delay = 0) => ({ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { delay } })

function RiskBadge({ level }) {
  const cls = level === 'critical' ? 'pill pill-red' : level === 'watch' ? 'pill pill-amber' : 'pill pill-green'
  return <span className={cls}>{level?.charAt(0).toUpperCase() + level?.slice(1)}</span>
}

function StatusDot({ mode }) {
  const color = mode === 'online' ? 'var(--green)' : mode === 'degraded' ? 'var(--amber)' : 'var(--red)'
  return <span className="status-dot" style={{ '--dot-color': color }} />
}

export default function AdminDashboard() {
  const [dash, setDash]       = useState(DEFAULTS)
  const [controls, setControls] = useState({ target: 100, crowd_density: 34, gate_load: 22, network_mode: 'online', emergency_override: false })

  // Event management state
  const [events, setEvents]         = useState([])
  const [eventForm, setEventForm]   = useState({ name: '', venue: '', event_date: '', max_capacity: 500 })
  const [eventLoading, setEventLoading] = useState(false)

  // Gate management state
  const [gates, setGates]           = useState([])
  const [gateForm, setGateForm]     = useState({ gate_number: '', pin_code: '', label: '', event_id: '' })
  const [gateLoading, setGateLoading] = useState(false)

  const [activeTab, setActiveTab]   = useState('metrics') // metrics | events | gates | analytics
  const [selectedEvent, setSelectedEvent] = useState(null)

  useEffect(() => {
    loadEvents()
    loadGates()
  }, [])

  useEffect(() => {
    if (events.length > 0 && selectedEvent === null) {
      setSelectedEvent(events[0].id)
    }
  }, [events])

  useEffect(() => {
    const load = async () => {
      try {
        const url = `/admin/dashboard${selectedEvent ? '?event_id=' + selectedEvent : ''}`
        const r = await api.get(url)
        setDash(r.data)
        setControls({ target: r.data.target, crowd_density: r.data.telemetry.crowd_density, gate_load: r.data.telemetry.gate_load, network_mode: r.data.telemetry.network_mode, emergency_override: r.data.telemetry.emergency_override })
      } catch {}
    }
    load()

    const ws = new WebSocket(getWebSocketURL())
    ws.onmessage = (ev) => {
      const d = JSON.parse(ev.data)
      if (d.type === 'system_state' && (!selectedEvent || d.event_id === selectedEvent)) {
        setDash(d)
      }
    }
    return () => ws.close()
  }, [selectedEvent])

  const loadEvents = async () => {
    try { const r = await api.get('/admin/events'); setEvents(r.data) } catch {}
  }
  const loadGates = async () => {
    try { const r = await api.get('/admin/gates'); setGates(r.data) } catch {}
  }

  const createEvent = async (e) => {
    e.preventDefault(); setEventLoading(true)
    try {
      await api.post('/admin/events', { ...eventForm, max_capacity: Number(eventForm.max_capacity) })
      setEventForm({ name: '', venue: '', event_date: '', max_capacity: 500 })
      await loadEvents()
    } catch (err) { alert(err.response?.data?.detail || 'Failed to create event') }
    finally { setEventLoading(false) }
  }

  const deleteEvent = async (id) => {
    if (!confirm('Delete this event?')) return
    try { await api.delete(`/admin/events/${id}`); await loadEvents() } catch {}
  }

  const createGate = async (e) => {
    e.preventDefault(); setGateLoading(true)
    try {
      await api.post('/admin/gates', { ...gateForm, event_id: gateForm.event_id ? Number(gateForm.event_id) : null })
      setGateForm({ gate_number: '', pin_code: '', label: '', event_id: '' })
      await loadGates()
    } catch (err) { alert(err.response?.data?.detail || 'Failed to create gate') }
    finally { setGateLoading(false) }
  }

  const deleteGate = async (id) => {
    if (!confirm('Deauthorize this gate?')) return
    try { await api.delete(`/admin/gates/${id}`); await loadGates() } catch {}
  }

  const applyTarget = async () => {
    try { await api.post(`/admin/settings?target=${controls.target}`); const r = await api.get('/admin/dashboard'); setDash(r.data) } catch {}
  }

  const applyTelemetry = async () => {
    try {
      await api.post('/admin/telemetry', { crowd_density: Number(controls.crowd_density), gate_load: Number(controls.gate_load), network_mode: controls.network_mode, emergency_override: controls.emergency_override })
      const r = await api.get('/admin/dashboard'); setDash(r.data)
    } catch {}
  }

  const tel = dash.telemetry || DEFAULTS.telemetry
  const analytics = dash.analytics || DEFAULTS.analytics

  const TABS = [
    { id: 'metrics',   label: 'Live Metrics' },
    { id: 'events',    label: 'Events' },
    { id: 'gates',     label: 'Gates' },
    { id: 'analytics', label: 'Analytics' },
  ]

  return (
    <div className="page-shell">

      {/* Hero */}
      <motion.section className="panel hero-panel" {...fadeUp()}>
        <div className="eyebrow">Admin · System Command Center</div>
        <h1 className="headline">Admin <span>Dashboard</span></h1>
        <p className="subhead">
          Manage events, authorize gates, control PID admission settings, and monitor live telemetry — all in real-time.
        </p>
        <div className="status-pills">
          <StatusDot mode={tel.network_mode}/>
          <span className="pill pill-accent">{tel.flow_mode}</span>
          <span className="pill">{tel.network_mode}</span>
          <RiskBadge level={tel.risk_level}/>
          {dash.anomaly_count > 0
            ? <span className="pill pill-red">{dash.anomaly_count} Anomaly Alert{dash.anomaly_count > 1 ? 's' : ''}</span>
            : <span className="pill pill-green">No Anomalies</span>}
          <span className="pill pill-green">{analytics.admitted_today} Admitted Today</span>
        </div>
        <div style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: '0.88rem', color: 'var(--ink-2)' }}>Filter Dashboard by Event:</span>
          <select 
            className="input-control" 
            style={{ width: 250, padding: '6px 12px', minHeight: 36 }}
            value={selectedEvent || ''} 
            onChange={e => setSelectedEvent(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— Global Overview —</option>
            {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
        </div>
      </motion.section>

      {/* Tab Bar */}
      <div className="admin-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`admin-tab-btn ${activeTab === t.id ? 'is-active' : ''}`}
            onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* ── METRICS TAB ── */}
      {activeTab === 'metrics' && (
        <div className="admin-grid">
          <motion.section className="panel" {...fadeUp(0.05)} layout>
            <div className="section-label">Live System Metrics</div>
            <div className="stat-grid">
              <article className="stat-tile">
                <span className="metric-label">Queue Size</span>
                <strong className="metric-value">{dash.queue_size}</strong>
                <p className="metric-note">Users waiting for admission</p>
              </article>
              <article className="stat-tile">
                <span className="metric-label">Entry Rate</span>
                <strong className="metric-value">{dash.entry_rate}<span style={{fontSize:'1rem',fontWeight:400}}>/min</span></strong>
                <p className="metric-note">PID-controlled throughput</p>
              </article>
              <article className="stat-tile">
                <span className="metric-label">Risk Score</span>
                <strong className="metric-value" style={{ color: tel.risk_level==='critical'?'var(--red)':tel.risk_level==='watch'?'var(--amber)':'var(--green)' }}>
                  {tel.risk_score}
                </strong>
                <p className="metric-note">Crowd density + gate load</p>
              </article>
              <article className="stat-tile">
                <span className="metric-label">Target Capacity</span>
                <strong className="metric-value">{dash.target}</strong>
                <p className="metric-note">PID setpoint</p>
              </article>
            </div>

            <div className="insight-grid" style={{ marginTop: 16 }}>
              <article className="insight-card"><div className="insight-icon"><Cpu size={17}/></div><div><strong>Queue Engine</strong><p>{dash.queue_backend}</p></div></article>
              <article className="insight-card"><div className="insight-icon"><Shield size={17}/></div><div><strong>Database</strong><p style={{wordBreak:'break-all',fontSize:'0.75rem'}}>{dash.database_backend}</p></div></article>
              <article className="insight-card"><div className="insight-icon"><Users size={17}/></div><div><strong>Role Mix</strong><p>General {dash.role_mix.general} · Priority {dash.role_mix.priority} · VIP {dash.role_mix.vip}</p></div></article>
              <article className="insight-card"><div className="insight-icon"><Activity size={17}/></div><div><strong>Flow Mode</strong><p>{tel.flow_mode}</p></div></article>
            </div>
          </motion.section>

          <motion.section className="panel" {...fadeUp(0.1)} layout>
            <div className="section-label">PID & Telemetry Controls</div>
            <div className="control-stack">
              <label className="field">
                <span>Target Crowd Capacity</span>
                <input className="range-control" type="range" min="0" max={Math.max(dash.target + 200, 500)} value={controls.target}
                  onChange={e => setControls(c => ({ ...c, target: Number(e.target.value) }))}/>
                <strong className="range-value">{controls.target} persons</strong>
              </label>
              <button className="button-secondary" onClick={applyTarget}><TimerReset size={15}/> Apply Target</button>
              <div className="divider"/>
              <label className="field">
                <span>Crowd Density</span>
                <input className="range-control" type="range" min="0" max="100" value={controls.crowd_density}
                  onChange={e => setControls(c => ({ ...c, crowd_density: Number(e.target.value) }))}/>
                <strong className="range-value">{controls.crowd_density}%</strong>
              </label>
              <label className="field">
                <span>Gate Load</span>
                <input className="range-control" type="range" min="0" max="100" value={controls.gate_load}
                  onChange={e => setControls(c => ({ ...c, gate_load: Number(e.target.value) }))}/>
                <strong className="range-value">{controls.gate_load}%</strong>
              </label>
              <label className="field">
                <span>Network Condition</span>
                <select className="input-control" value={controls.network_mode}
                  onChange={e => setControls(c => ({ ...c, network_mode: e.target.value }))}>
                  <option value="online">Online — Full connectivity</option>
                  <option value="degraded">Degraded — Partial connectivity</option>
                  <option value="offline">Offline — Local continuity mode</option>
                </select>
              </label>
              <label className="toggle-row">
                <input type="checkbox" checked={controls.emergency_override}
                  onChange={e => setControls(c => ({ ...c, emergency_override: e.target.checked }))}/>
                <div><strong>Emergency Override</strong><p>Force maximum protective throttle regardless of other signals.</p></div>
              </label>
              <button className="button-primary" onClick={applyTelemetry}><Waves size={15}/> Apply Telemetry</button>
            </div>
          </motion.section>

          <motion.section className="panel" {...fadeUp(0.15)} layout>
            <div className="section-label">Queue Preview — Fair Scheduler</div>
            <div className="list-stack">
              {dash.queue_preview.length === 0
                ? <div className="empty-state">No active queue entries. Visitors join from the Queue Portal.</div>
                : dash.queue_preview.map((item, idx) => (
                  <article key={`${item.email}-${item.ticket_id}`} className="queue-row">
                    <div style={{display:'flex',justifyContent:'space-between'}}>
                      <div><strong>#{idx+1} · {item.name}</strong><p>{item.email}</p></div>
                    </div>
                    <div className="queue-meta">
                      <span className="pill pill-accent">{item.access_role}</span>
                      <span className="pill">Wait: {item.wait_minutes}m</span>
                      <span className={item.aging_boost > 0 ? 'pill pill-green' : 'pill'}>Boost +{item.aging_boost}</span>
                      <span className="pill">Priority {item.effective_priority}</span>
                    </div>
                  </article>
                ))}
            </div>
          </motion.section>

          <motion.section className="panel" {...fadeUp(0.2)} layout>
            <div className="section-label">Audit Trail</div>
            <div className="list-stack">
              {dash.events.length === 0
                ? <div className="empty-state">Events will appear here as admission actions occur.</div>
                : dash.events.map(ev => (
                  <article key={ev.id} className={`audit-row severity-${ev.severity}`}>
                    <div className="audit-topline">
                      <strong>{ev.event_type.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</strong>
                      <span>{new Date(ev.created_at).toLocaleTimeString()}</span>
                    </div>
                    <p>{ev.details}</p>
                    <div className="audit-meta">
                      <span>{ev.actor_email||'system'}</span><span>·</span>
                      <span style={{textTransform:'capitalize'}}>{ev.actor_role||'workflow'}</span><span>·</span>
                      <span style={{textTransform:'uppercase',fontSize:'0.72rem',color:ev.severity==='error'?'var(--red)':ev.severity==='warning'?'var(--amber)':'var(--ink-3)'}}>{ev.severity}</span>
                    </div>
                  </article>
                ))}
            </div>
          </motion.section>
        </div>
      )}

      {/* ── EVENTS TAB ── */}
      {activeTab === 'events' && (
        <div className="admin-grid">
          <motion.section className="panel" {...fadeUp()}>
            <div className="section-label">Create New Event</div>
            <h2 className="panel-title" style={{marginTop:12}}>Add Event</h2>
            <form className="form-grid" onSubmit={createEvent}>
              <label className="field"><span>Event Name</span>
                <input className="input-control" value={eventForm.name} onChange={e=>setEventForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Tech Summit 2026" required/>
              </label>
              <label className="field"><span>Venue</span>
                <input className="input-control" value={eventForm.venue} onChange={e=>setEventForm(f=>({...f,venue:e.target.value}))} placeholder="e.g. NSEC Auditorium"/>
              </label>
              <label className="field"><span>Event Date</span>
                <input className="input-control" type="date" value={eventForm.event_date} onChange={e=>setEventForm(f=>({...f,event_date:e.target.value}))}/>
              </label>
              <label className="field"><span>Max Capacity</span>
                <input className="input-control" type="number" min="1" value={eventForm.max_capacity} onChange={e=>setEventForm(f=>({...f,max_capacity:e.target.value}))} required/>
              </label>
              <div className="button-row">
                <button type="submit" className="button-primary" disabled={eventLoading}>
                  <Plus size={15}/> {eventLoading ? 'Creating…' : 'Create Event'}
                </button>
              </div>
            </form>
          </motion.section>

          <motion.section className="panel" {...fadeUp(0.1)}>
            <div className="section-label">All Events ({events.length})</div>
            <div className="list-stack">
              {events.length === 0
                ? <div className="empty-state">No events created yet. Add your first event on the left.</div>
                : events.map(ev => (
                  <article key={ev.id} className="queue-row" style={{position:'relative'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                      <div>
                        <strong>{ev.name}</strong>
                        <p>{ev.venue} {ev.event_date && `· ${ev.event_date}`}</p>
                      </div>
                      <button className="btn-icon-danger" onClick={() => deleteEvent(ev.id)} title="Delete event">
                        <Trash2 size={15}/>
                      </button>
                    </div>
                    <div className="queue-meta" style={{marginTop:10}}>
                      <span className="pill pill-accent">Capacity: {ev.max_capacity}</span>
                      <span className={`pill ${ev.status==='active'?'pill-green':'pill-amber'}`}>{ev.status}</span>
                    </div>
                  </article>
                ))}
            </div>
          </motion.section>
        </div>
      )}

      {/* ── GATES TAB ── */}
      {activeTab === 'gates' && (
        <div className="admin-grid">
          <motion.section className="panel" {...fadeUp()}>
            <div className="section-label">Authorize New Gate</div>
            <h2 className="panel-title" style={{marginTop:12}}>Add Gate</h2>
            <form className="form-grid" onSubmit={createGate}>
              <label className="field"><span>Gate Number</span>
                <input className="input-control" value={gateForm.gate_number} onChange={e=>setGateForm(f=>({...f,gate_number:e.target.value}))} placeholder="e.g. GATE-01" required/>
              </label>
              <label className="field"><span>Gate Label</span>
                <input className="input-control" value={gateForm.label} onChange={e=>setGateForm(f=>({...f,label:e.target.value}))} placeholder="e.g. North Entrance"/>
              </label>
              <label className="field"><span>PIN Code (Gate operator uses this to authenticate)</span>
                <input className="input-control" type="password" value={gateForm.pin_code} onChange={e=>setGateForm(f=>({...f,pin_code:e.target.value}))} placeholder="4–8 digit PIN" required minLength={4}/>
              </label>
              <label className="field"><span>Linked Event (optional)</span>
                <select className="input-control" value={gateForm.event_id} onChange={e=>setGateForm(f=>({...f,event_id:e.target.value}))}>
                  <option value="">— No linked event —</option>
                  {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                </select>
              </label>
              <div className="button-row">
                <button type="submit" className="button-primary" disabled={gateLoading}>
                  <DoorOpen size={15}/> {gateLoading ? 'Authorizing…' : 'Authorize Gate'}
                </button>
              </div>
            </form>
          </motion.section>

          <motion.section className="panel" {...fadeUp(0.1)}>
            <div className="section-label">Authorized Gates ({gates.length})</div>
            <div className="list-stack">
              {gates.length === 0
                ? <div className="empty-state">No gates authorized yet. Add your first gate on the left.</div>
                : gates.map(g => (
                  <article key={g.id} className="queue-row">
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                      <div>
                        <strong>{g.gate_number} {g.label && `— ${g.label}`}</strong>
                        <p>{g.event_id ? `Linked to event #${g.event_id}` : 'No linked event'}</p>
                      </div>
                      <button className="btn-icon-danger" onClick={() => deleteGate(g.id)} title="Deauthorize gate">
                        <Trash2 size={15}/>
                      </button>
                    </div>
                    <div className="queue-meta" style={{marginTop:10}}>
                      <span className={`pill ${g.is_active ? 'pill-green' : 'pill-red'}`}>
                        {g.is_active ? '● Active' : '○ Inactive'}
                      </span>
                    </div>
                  </article>
                ))}
            </div>
          </motion.section>
        </div>
      )}

      {/* ── ANALYTICS TAB ── */}
      {activeTab === 'analytics' && (
        <div className="admin-grid">
          <motion.section className="panel" style={{gridColumn:'1/-1'}} {...fadeUp()}>
            <div className="section-label">Today's Analytics</div>
            <div className="stat-grid" style={{marginTop:16}}>
              <article className="stat-tile">
                <span className="metric-label">Admitted Today</span>
                <strong className="metric-value" style={{color:'var(--green)'}}>{analytics.admitted_today}</strong>
                <p className="metric-note">Successfully entered the venue</p>
              </article>
              <article className="stat-tile">
                <span className="metric-label">Total Joined</span>
                <strong className="metric-value">{analytics.total_joined_today}</strong>
                <p className="metric-note">Registered in queue today</p>
              </article>
              <article className="stat-tile">
                <span className="metric-label">Avg. Wait Time</span>
                <strong className="metric-value">{analytics.avg_wait_minutes}<span style={{fontSize:'1rem',fontWeight:400}}> min</span></strong>
                <p className="metric-note">From queue join to gate admit</p>
              </article>
              <article className="stat-tile">
                <span className="metric-label">Peak Queue Size</span>
                <strong className="metric-value">{analytics.peak_queue_size}</strong>
                <p className="metric-note">Highest simultaneous queue depth</p>
              </article>
            </div>
          </motion.section>

          <motion.section className="panel" {...fadeUp(0.1)}>
            <div className="section-label">Safety Mode Reference</div>
            <div className="insight-grid" style={{marginTop:14}}>
              <article className="insight-card"><div className="insight-icon" style={{background:'var(--green-dim)',color:'var(--green)'}}><Gauge size={17}/></div><div><strong>Normal Flow</strong><p>Risk &lt;45. PID running freely. No intervention.</p></div></article>
              <article className="insight-card"><div className="insight-icon" style={{background:'var(--amber-dim)',color:'var(--amber)'}}><Radio size={17}/></div><div><strong>Adaptive Balancing</strong><p>Risk 45–74. PID slowing entry to prevent buildup.</p></div></article>
              <article className="insight-card"><div className="insight-icon" style={{background:'var(--red-dim)',color:'var(--red)'}}><AlertTriangle size={17}/></div><div><strong>Protective Backpressure</strong><p>Risk ≥75. Heavy throttle. Queue absorbs venue pressure.</p></div></article>
              <article className="insight-card"><div className="insight-icon" style={{background:'var(--cyan-dim)',color:'var(--cyan)'}}><Shield size={17}/></div><div><strong>Offline Continuity</strong><p>Network offline. Gate uses local JWT precheck only.</p></div></article>
            </div>
          </motion.section>

          <motion.section className="panel" {...fadeUp(0.15)}>
            <div className="section-label">Current Role Distribution</div>
            <div className="stat-grid" style={{marginTop:14}}>
              {[['General',dash.role_mix.general,'var(--ink-2)'],['Priority',dash.role_mix.priority,'var(--cyan)'],['VIP',dash.role_mix.vip,'var(--amber)'],['Staff',dash.role_mix.staff,'var(--green)']].map(([label,count,color])=>(
                <article key={label} className="stat-tile">
                  <span className="metric-label">{label}</span>
                  <strong className="metric-value" style={{color}}>{count}</strong>
                  <p className="metric-note">currently in queue</p>
                </article>
              ))}
            </div>
          </motion.section>
        </div>
      )}
    </div>
  )
}
