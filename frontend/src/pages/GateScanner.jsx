import { useEffect, useMemo, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, CheckCircle2, KeyRound, ShieldCheck, XCircle, Scan, Wifi, WifiOff, LogIn, DoorOpen } from 'lucide-react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { api } from '../api'

function decodeJWT(token) {
  try {
    const raw = token.split('.')[1]
    if (!raw) return null
    return JSON.parse(window.atob(raw.replace(/-/g, '+').replace(/_/g, '/')))
  } catch { return null }
}

const GATE_STEPS = [
  { label: 'Gate Authentication',   desc: 'Operator enters gate number and PIN to activate the terminal.' },
  { label: 'Capture Token',         desc: 'Scan QR code via camera or paste the JWT token manually.' },
  { label: 'Local Precheck',        desc: 'Decode token payload client-side — works fully offline.' },
  { label: 'Server Validation',     desc: 'Authoritative admit/reject decision from backend.' },
]

const fadeUp = { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 } }

export default function GateScanner() {
  // Gate auth
  const [gateAuth, setGateAuth]     = useState(null) // null = not authenticated
  const [gateNum, setGateNum]       = useState('')
  const [gatePin, setGatePin]       = useState('')
  const [gateError, setGateError]   = useState('')
  const [gateLoading, setGateLoading] = useState(false)

  // Scanning
  const [scanning, setScanning]     = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [manualToken, setManualToken] = useState('')
  const [manualName, setManualName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [manualAdmitLoading, setManualAdmitLoading] = useState(false)
  const [activeStep, setActiveStep] = useState(0)
  const [validating, setValidating] = useState(false)

  const scannerRef = useRef(null)

  const localPrecheck = useMemo(() => decodeJWT(manualToken.trim()), [manualToken])
  const isExpired = localPrecheck?.exp ? localPrecheck.exp * 1000 < Date.now() : false

  // Gate step updates
  useEffect(() => {
    if (!gateAuth)     { setActiveStep(0); return }
    if (validating)    { setActiveStep(3); return }
    if (scanResult)    { setActiveStep(3); return }
    if (localPrecheck) { setActiveStep(2); return }
    setActiveStep(1)
  }, [gateAuth, localPrecheck, scanResult, validating])

  const authenticateGate = async (e) => {
    e.preventDefault()
    setGateError('')
    setGateLoading(true)
    try {
      const res = await api.post('/gate/authenticate', { gate_number: gateNum, pin_code: gatePin })
      setGateAuth(res.data.gate)
    } catch (err) {
      setGateError(err.response?.data?.detail || 'Invalid gate credentials. Check number and PIN.')
    } finally { setGateLoading(false) }
  }

  const validateToken = async (token, source = 'camera') => {
    setValidating(true)
    const local = decodeJWT(token)
    try {
      const res = await api.post('/admin/admit', { token })
      setScanResult(
        res.data.status === 'success'
          ? { ok: true,  title: 'Access Granted', message: `Admitted: ${res.data.admitted?.data?.name || local?.sub || 'Visitor'}`, detail: `Validated via ${source}. Entry recorded in audit trail.` }
          : { ok: false, title: 'Access Denied',  message: res.data.message || 'Ticket rejected.', detail: 'Backend rejected this token. Check the audit trail.' }
      )
    } catch (err) {
      setScanResult({
        ok: false,
        title: 'Network Unavailable',
        message: err.response?.data?.message || 'Could not reach the admission API.',
        detail: local
          ? 'Local precheck passed — token is structurally valid. Authoritative decision deferred.'
          : 'Token failed local precheck too. Do not admit this visitor.',
      })
    } finally { setValidating(false) }
  }

  // Camera scanner — keep div mounted, only show/hide visually to avoid resume bugs
  useEffect(() => {
    if (!scanning || !gateAuth) return
    const scanner = new Html5QrcodeScanner('qr-reader', { fps: 10, qrbox: { width: 250, height: 250 } }, false)
    scannerRef.current = scanner
    scanner.render(async (text) => {
      scanner.pause()
      setScanResult(null)
      await validateToken(text, 'QR camera scan')
      setTimeout(() => {
        setScanResult(null)
        try { scanner.resume() } catch {}
      }, 4000)
    }, () => {})
    return () => { scanner.clear().catch(() => {}); scannerRef.current = null }
  }, [scanning, gateAuth])

  const submitManual = async (e) => {
    e.preventDefault()
    if (!manualToken.trim()) return
    setScanResult(null)
    await validateToken(manualToken.trim(), 'manual token paste')
  }

  const submitDirectEntry = async (e) => {
    e.preventDefault()
    if (!manualName.trim()) return
    setManualAdmitLoading(true)
    setScanResult(null)
    try {
      const res = await api.post('/admin/manual_admit', {
        name: manualName,
        email: manualEmail,
        event_id: gateAuth?.event_id
      })
      setScanResult({
        ok: true,
        title: 'Access Granted (Manual)',
        message: `Admitted: ${manualName}`,
        detail: res.data.message || 'Direct entry recorded in audit trail.'
      })
      setManualName('')
      setManualEmail('')
    } catch (err) {
      setScanResult({
        ok: false,
        title: 'Manual Entry Failed',
        message: err.response?.data?.message || 'Could not admit visitor.',
        detail: 'Check network or backend logs.'
      })
    } finally {
      setManualAdmitLoading(false)
    }
  }

  const resetScan = () => { setScanResult(null); setManualToken('') }

  // ── Gate Auth Screen ──
  if (!gateAuth) {
    return (
      <div className="page-shell">
        <div className="page-grid">
          <motion.section className="panel hero-panel" {...fadeUp}>
            <div className="eyebrow">Smart-QX · Gate Terminal</div>
            <h1 className="headline">Gate <span>Authentication</span></h1>
            <p className="subhead">
              This terminal is restricted to authorized gate operators.
              Enter your assigned gate number and PIN to activate the scanner.
            </p>
            <div className="workflow-list" style={{ marginTop: 20 }}>
              {GATE_STEPS.map((s, i) => (
                <div key={s.label} className={`workflow-step ${i === activeStep ? 'is-active' : ''} ${i < activeStep ? 'is-complete' : ''}`}>
                  <span className="step-index">{i + 1}</span>
                  <div><strong>{s.label}</strong><p>{s.desc}</p></div>
                </div>
              ))}
            </div>
          </motion.section>

          <motion.section className="panel action-panel" {...fadeUp} transition={{ delay: 0.1 }}>
            <div className="section-label">Gate Operator Login</div>
            <h2 className="panel-title">Authenticate Terminal</h2>
            <p className="panel-copy">
              Gate credentials are set by the admin. Contact your event administrator if you don't have your gate number or PIN.
            </p>
            {gateError && <div className="auth-error">{gateError}</div>}
            <form className="form-grid" onSubmit={authenticateGate}>
              <label className="field"><span>Gate Number</span>
                <input className="input-control" value={gateNum} onChange={e => setGateNum(e.target.value)} placeholder="e.g. GATE-01" required/>
              </label>
              <label className="field"><span>Gate PIN</span>
                <input className="input-control" type="password" value={gatePin} onChange={e => setGatePin(e.target.value)} placeholder="Enter PIN" required/>
              </label>
              <div className="button-row">
                <button type="submit" className="button-primary" disabled={gateLoading} style={{ flex: 1 }}>
                  <LogIn size={15}/> {gateLoading ? 'Authenticating…' : 'Activate Gate Terminal'}
                </button>
              </div>
            </form>
          </motion.section>
        </div>
      </div>
    )
  }

  // ── Active Gate Terminal ──
  return (
    <div className="page-shell">
      <div className="page-grid">

        {/* LEFT */}
        <motion.section className="panel hero-panel" {...fadeUp}>
          <div className="eyebrow">Gate Terminal · {gateAuth.gate_number}</div>
          <h1 className="headline">
            Gate Scanner &<br /><span>Token Validation</span>
          </h1>
          <p className="subhead">
            {gateAuth.label && <><strong>{gateAuth.label}</strong> · </>}
            Scan QR tickets via camera or paste tokens manually. Local precheck runs instantly — server validation confirms admission.
          </p>

          {/* Live workflow steps */}
          <div className="workflow-list" style={{ marginTop: 20 }}>
            {GATE_STEPS.map((s, i) => (
              <motion.div key={s.label} layout
                className={`workflow-step ${i === activeStep ? 'is-active' : ''} ${i < activeStep ? 'is-complete' : ''}`}>
                <span className="step-index">{i < activeStep ? <CheckCircle2 size={16}/> : i + 1}</span>
                <div><strong>{s.label}</strong>
                  <p>{i === activeStep ? '● In progress' : i < activeStep ? '✓ Done' : s.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Local Precheck Panel */}
          <div className="inset-panel">
            <div className="section-label">Local Token Precheck</div>
            {localPrecheck ? (
              <>
                <div className="metric-grid" style={{ marginTop: 14 }}>
                  <article className="metric-card"><span className="metric-label">Email</span><strong className="metric-value compact">{localPrecheck.sub || '—'}</strong></article>
                  <article className="metric-card"><span className="metric-label">Access Role</span><strong className="metric-value" style={{textTransform:'capitalize'}}>{localPrecheck.role || 'general'}</strong></article>
                  <article className="metric-card"><span className="metric-label">Ticket ID</span><strong className="metric-value compact">{localPrecheck.ticket_id || '—'}</strong></article>
                  <article className="metric-card"><span className="metric-label">Expires</span>
                    <strong className="metric-value compact" style={{color: isExpired ? 'var(--red)' : 'var(--green)'}}>
                      {localPrecheck.exp ? new Date(localPrecheck.exp * 1000).toLocaleTimeString() : 'Unknown'}
                    </strong>
                  </article>
                </div>
                <div style={{marginTop:10, padding:'10px 14px', borderRadius:10,
                  background: isExpired ? 'var(--red-dim)' : 'var(--green-dim)',
                  border: `1px solid ${isExpired ? 'rgba(244,63,94,0.25)' : 'rgba(16,185,129,0.25)'}`,
                  color: isExpired ? 'var(--red)' : 'var(--green)', fontSize:'0.85rem', display:'flex', gap:8, alignItems:'center'}}>
                  {isExpired ? <XCircle size={15}/> : <CheckCircle2 size={15}/>}
                  {isExpired ? 'Token expired — gate validation will reject.' : 'Token valid — click Validate Token to admit.'}
                </div>
              </>
            ) : (
              <div className="empty-state" style={{marginTop:14}}>
                Paste a token below to run offline local precheck instantly — no network required.
              </div>
            )}
          </div>

          {/* Online/Offline status */}
          <div className="insight-grid" style={{ marginTop: 16 }}>
            <article className="insight-card">
              <div className="insight-icon"><Wifi size={16}/></div>
              <div><strong>Online Mode</strong><p>Full validation + audit log update on each scan.</p></div>
            </article>
            <article className="insight-card">
              <div className="insight-icon" style={{background:'var(--amber-dim)',borderColor:'rgba(245,158,11,0.2)',color:'var(--amber)'}}><WifiOff size={16}/></div>
              <div><strong>Offline Continuity</strong><p>Local JWT precheck works without network. Decision deferred.</p></div>
            </article>
          </div>

          <div style={{marginTop:16}}>
            <button className="button-secondary" onClick={() => { setGateAuth(null); setScanning(false); setScanResult(null); setManualToken('') }}>
              <DoorOpen size={15}/> Deactivate Terminal
            </button>
          </div>
        </motion.section>

        {/* RIGHT */}
        <motion.section className="panel action-panel" {...fadeUp} transition={{ delay: 0.1 }}>
          <div className="section-label">Active Terminal — {gateAuth.gate_number}</div>
          <h2 className="panel-title">Scan or Validate</h2>
          <p className="panel-copy">
            Use the live camera scanner or paste a JWT token manually. The system validates locally first, then contacts the backend for the authoritative decision.
          </p>

          {/* Camera scanner */}
          <div className="scanner-shell">
            <AnimatePresence mode="wait">
              {!scanning ? (
                <motion.button key="idle" type="button" className="scanner-toggle"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={() => { setScanResult(null); setScanning(true) }}>
                  <Camera size={56} style={{ opacity: 0.75 }}/>
                  <strong>Activate Camera Scanner</strong>
                  <span>Live QR scanning at the physical gate.</span>
                </motion.button>
              ) : (
                <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  {/* Keep qr-reader mounted — just hide it visually when result shows */}
                  <div id="qr-reader" className="qr-reader" style={{ display: scanResult ? 'none' : 'block' }}/>
                  <AnimatePresence>
                    {scanResult && (
                      <motion.div
                        initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        className={`validation-result ${scanResult.ok ? 'is-success' : 'is-error'}`}>
                        {scanResult.ok ? <CheckCircle2 size={52}/> : <XCircle size={52}/>}
                        <h2>{scanResult.title}</h2>
                        <p>{scanResult.message}</p>
                        <small>{scanResult.detail}</small>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <button type="button" className="button-secondary scanner-stop"
                    onClick={() => { setScanning(false); setScanResult(null) }}>
                    <Scan size={15}/> Stop Scanner
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Manual token */}
          <form onSubmit={submitManual} className="manual-panel">
            <div className="section-label">Manual Token Validation</div>
            <label className="field" style={{ marginTop: 14 }}>
              <span>Paste the JWT gate token</span>
              <textarea className="textarea-control" value={manualToken}
                onChange={e => setManualToken(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…" />
            </label>
            <div className="button-row">
              <button type="submit" className="button-primary" disabled={validating}>
                <KeyRound size={15}/> {validating ? 'Validating…' : 'Validate Token'}
              </button>
              {manualToken && <button type="button" className="button-secondary" onClick={resetScan}>Clear</button>}
            </div>
          </form>

          {/* Direct Manual Entry */}
          <form onSubmit={submitDirectEntry} className="manual-panel" style={{ marginTop: 16 }}>
            <div className="section-label">Direct Manual Entry</div>
            <div style={{ marginTop: 14, display: 'flex', gap: 12 }}>
              <label className="field" style={{ flex: 1 }}>
                <span>Visitor Name</span>
                <input className="input-control" value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Enter name" required />
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span>Email (Optional)</span>
                <input className="input-control" type="email" value={manualEmail} onChange={e => setManualEmail(e.target.value)} placeholder="Enter email" />
              </label>
            </div>
            <div className="button-row">
              <button type="submit" className="button-primary" disabled={manualAdmitLoading}>
                <KeyRound size={15}/> {manualAdmitLoading ? 'Admitting…' : 'Admit Visitor Directly'}
              </button>
            </div>
          </form>

          {/* Manual result */}
          <AnimatePresence>
            {scanResult && !scanning && (
              <motion.div
                className={`validation-result result-hint ${scanResult.ok ? 'is-success' : 'is-error'}`}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                {scanResult.ok ? <CheckCircle2 size={40}/> : <XCircle size={40}/>}
                <h2>{scanResult.title}</h2>
                <p>{scanResult.message}</p>
                <small>{scanResult.detail}</small>
                <button type="button" className="button-secondary" onClick={resetScan} style={{ marginTop: 8 }}>
                  Scan Next Ticket
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* How it works */}
          <div className="insight-card result-hint" style={{ marginTop: 20 }}>
            <div className="insight-icon"><ShieldCheck size={16}/></div>
            <div>
              <strong>How Gate Validation Works</strong>
              <p>Backend verifies JWT signature → checks expiry → confirms user is in active queue → removes from queue on admit → writes audit event with severity level.</p>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  )
}
