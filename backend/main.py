import asyncio
import datetime
import os
import uuid
from collections import Counter
from typing import Optional

import jwt
from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlmodel import Session, select, func

from database import create_db_and_tables, get_database_backend, get_engine, get_session
from models import AuditEvent, QueueEntry, QueueStats, User, Event, Gate
from pid_controller import pid
from queue_manager import ROLE_PRIORITY, queue_manager
from telemetry_manager import telemetry_manager
from ws_manager import manager
from auth import (
    SignupRequest, LoginRequest, signup, login,
    get_current_user, require_admin, serialize_user,
)

app = FastAPI(title="Smart-QX API")

SECRET_KEY = os.environ.get("SECRET_KEY", "super_secret_offline_key_for_demo")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "*")

WORKFLOW_STEPS = [
    "Register identity and access class",
    "Join the adaptive virtual queue",
    "Track live position, ETA, and safety mode",
    "Present signed QR ticket at the gate",
    "Validate, admit, and log the event",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL] if FRONTEND_URL != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helpers ──

def normalize_access_role(role: Optional[str], priority: Optional[int] = None) -> str:
    if role:
        candidate = role.lower()
        if candidate in ROLE_PRIORITY:
            return candidate
    if priority is None:
        return "general"
    if priority >= 2:
        return "staff"
    if priority == 1:
        return "vip"
    return "general"


def create_offline_token(email: str, user_id: int, access_role: str, ticket_id: str, event_id: Optional[int] = None) -> str:
    payload = {
        "sub": email,
        "uid": user_id,
        "role": access_role,
        "ticket_id": ticket_id,
        "event_id": event_id,
        "jti": uuid.uuid4().hex,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=2),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def serialize_event(event: AuditEvent) -> dict:
    return {
        "id": event.id,
        "event_type": event.event_type,
        "severity": event.severity,
        "actor_email": event.actor_email,
        "actor_role": event.actor_role,
        "event_id": event.event_id,
        "details": event.details,
        "created_at": event.created_at.isoformat() + "Z",
    }


def record_event(
    session: Session,
    event_type: str,
    details: str,
    severity: str = "info",
    actor_email: Optional[str] = None,
    actor_role: Optional[str] = None,
    event_id: Optional[int] = None,
) -> AuditEvent:
    event = AuditEvent(
        event_type=event_type,
        severity=severity,
        actor_email=actor_email,
        actor_role=actor_role,
        event_id=event_id,
        details=details,
    )
    session.add(event)
    session.commit()
    session.refresh(event)
    return event


def get_recent_events(session: Session, limit: int = 8, event_id: Optional[int] = None) -> list[dict]:
    query = select(AuditEvent)
    if event_id is not None:
        query = query.where(AuditEvent.event_id == event_id)
    events = session.exec(query.order_by(AuditEvent.created_at.desc()).limit(limit)).all()
    return [serialize_event(event) for event in events]

def queue_breakdown(event_id: Optional[int] = None) -> dict:
    counts = Counter(item["access_role"] for item in queue_manager.get_ranked_queue(event_id))
    return {
        "general": counts.get("general", 0),
        "priority": counts.get("priority", 0),
        "vip": counts.get("vip", 0),
        "staff": counts.get("staff", 0),
    }


def compute_analytics(session: Session, event_id: Optional[int] = None) -> dict:
    today_start = datetime.datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    query_admitted = select(func.count(QueueEntry.id)).where(
        QueueEntry.status == "entered",
        QueueEntry.entered_at >= today_start,
    )
    query_completed = select(QueueEntry).where(
        QueueEntry.status == "entered",
        QueueEntry.entered_at != None,
        QueueEntry.entered_at >= today_start,
    )
    query_joined = select(func.count(QueueEntry.id)).where(QueueEntry.joined_at >= today_start)
    
    if event_id is not None:
        query_admitted = query_admitted.where(QueueEntry.event_id == event_id)
        query_completed = query_completed.where(QueueEntry.event_id == event_id)
        query_joined = query_joined.where(QueueEntry.event_id == event_id)

    admitted_today = session.exec(query_admitted).one()
    completed_entries = session.exec(query_completed).all()
    total_joined = session.exec(query_joined).one()

    wait_times = []
    for entry in completed_entries:
        if entry.entered_at and entry.joined_at:
            diff = (entry.entered_at - entry.joined_at).total_seconds() / 60
            wait_times.append(diff)

    avg_wait = round(sum(wait_times) / len(wait_times), 1) if wait_times else 0
    peak_queue = session.exec(
        select(func.max(QueueStats.current_size)).where(QueueStats.timestamp >= today_start)
    ).one() or 0

    return {
        "admitted_today": admitted_today or 0,
        "total_joined_today": total_joined or 0,
        "avg_wait_minutes": avg_wait,
        "peak_queue_size": peak_queue or 0,
    }


def build_dashboard_payload(session: Session, event_id: Optional[int] = None) -> dict:
    queue_size = queue_manager.get_queue_size(event_id)
    telemetry = telemetry_manager.snapshot()
    
    query_anomalies = select(AuditEvent).where(AuditEvent.severity.in_(["warning", "error"]))
    if event_id is not None:
        query_anomalies = query_anomalies.where(AuditEvent.event_id == event_id)
    anomalies = session.exec(query_anomalies).all()

    return {
        "queue_size": queue_size,
        "entry_rate": round(pid.current_entry_rate, 2),
        "target": pid.target_crowd,
        "queue_backend": queue_manager.backend_name,
        "database_backend": get_database_backend(),
        "queue_preview": queue_manager.peak_queue(6, event_id),
        "telemetry": telemetry,
        "flow_mode": telemetry["flow_mode"],
        "safe_status": telemetry["risk_level"],
        "role_mix": queue_breakdown(event_id),
        "events": get_recent_events(session, 8, event_id),
        "anomaly_count": len(anomalies),
        "workflow_steps": WORKFLOW_STEPS,
        "analytics": compute_analytics(session, event_id),
        "event_id": event_id
    }


async def broadcast_system_state(event_id: Optional[int] = None):
    with Session(get_engine()) as session:
        payload = build_dashboard_payload(session, event_id)
    await manager.broadcast({"type": "system_state", **payload})


async def pid_loop():
    while True:
        with Session(get_engine()) as session:
            active_events = session.exec(select(Event).where(Event.status == "active")).all()
            
        if not active_events:
            await asyncio.sleep(5)
            continue
            
        for event in active_events:
            queue_size = queue_manager.get_queue_size(event.id)
            telemetry = telemetry_manager.snapshot()
            control_crowd = queue_size + telemetry["pressure_units"]
            new_rate = pid.update(current_crowd=control_crowd)

            if telemetry["emergency_override"]:
                pid.current_entry_rate = max(pid.min_rate, min(new_rate, pid.min_rate + 2))

            await broadcast_system_state(event.id)
            
        await asyncio.sleep(5)


@app.on_event("startup")
async def on_startup():
    create_db_and_tables()
    asyncio.create_task(pid_loop())


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ── Auth Endpoints ──

@app.post("/auth/signup")
def auth_signup(req: SignupRequest, session: Session = Depends(get_session)):
    return signup(req, session)


@app.post("/auth/login")
def auth_login(req: LoginRequest, session: Session = Depends(get_session)):
    return login(req, session)


@app.get("/auth/me")
def auth_me(user: User = Depends(get_current_user)):
    return serialize_user(user)


# ── Public ──

@app.get("/")
def read_root():
    return {
        "message": "Welcome to Smart-QX API",
        "queue_backend": queue_manager.backend_name,
        "database_backend": get_database_backend(),
        "workflow_steps": WORKFLOW_STEPS,
    }


@app.get("/workflow")
def get_workflow():
    return {
        "name": "Smart-QX Admission Workflow",
        "steps": WORKFLOW_STEPS,
    }


@app.get("/events/active")
def get_active_events(session: Session = Depends(get_session)):
    events = session.exec(select(Event).where(Event.status == "active").order_by(Event.event_date)).all()
    return [{"id": e.id, "name": e.name, "venue": e.venue, "event_date": e.event_date} for e in events]

# ── Queue Endpoints ──

@app.get("/admin/dashboard")
def get_dashboard(event_id: Optional[int] = None, session: Session = Depends(get_session)):
    return build_dashboard_payload(session, event_id)


class JoinQueueRequest(BaseModel):
    role: Optional[str] = "general"
    event_id: Optional[int] = None


@app.post("/join-queue")
async def join_queue(
    body: JoinQueueRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    existing_entry = session.exec(
        select(QueueEntry).where(
            QueueEntry.user_id == user.id,
            QueueEntry.event_id == body.event_id
        ).order_by(QueueEntry.joined_at.desc())
    ).first()

    if existing_entry and existing_entry.status == "entered":
        raise HTTPException(status_code=400, detail="You have already entered this event.")

    access_role = normalize_access_role(body.role)
    ticket_id = uuid.uuid4().hex[:10].upper()
    token = create_offline_token(user.email, user.id, access_role, ticket_id, body.event_id)
    joined_at = datetime.datetime.utcnow().isoformat()
    
    is_already_queued_in_db = existing_entry is not None and existing_entry.status == "queued"
    
    user_data = {
        "name": user.name,
        "email": user.email,
        "access_role": access_role,
        "priority": ROLE_PRIORITY.get(access_role, 0),
        "token": token,
        "ticket_id": ticket_id,
        "event_id": body.event_id,
        "joined_at": joined_at,
        "ticket_status": "active",
    }

    added = queue_manager.add_to_queue(user.email, user_data, body.event_id)
    if not added:
        existing_position = queue_manager.get_position(user.email, body.event_id)
        if existing_position is None:
            queue_manager.remove_user(user.email, body.event_id)
            added = queue_manager.add_to_queue(user.email, user_data, body.event_id)

    if not added or is_already_queued_in_db:
        return {
            "message": "Already in queue",
            "token": token,
            "status": get_position_data(user.email, body.event_id),
        }

    session.add(QueueEntry(user_id=user.id, event_id=body.event_id, status="queued"))
    session.commit()
    record_event(
        session,
        "queue_joined",
        f"{user.name} joined as {access_role} access.",
        actor_email=user.email,
        actor_role=access_role,
    )

    await manager.broadcast({"type": "queue_joined", "size": queue_manager.get_queue_size(body.event_id)})
    await broadcast_system_state()

    return {
        "message": "Joined",
        "token": token,
        "ticket_id": ticket_id,
        "access_role": access_role,
        "queue_backend": queue_manager.backend_name,
        "database_backend": get_database_backend(),
        "workflow_step": WORKFLOW_STEPS[1],
    }


def get_position_data(email: str, event_id: Optional[int] = None) -> dict:
    ranked_queue = queue_manager.get_ranked_queue(event_id)
    entry = next((item for item in ranked_queue if item["email"] == email), None)
    if entry is None:
        return None

    telemetry = telemetry_manager.snapshot()
    rate_per_min = pid.current_entry_rate
    position = ranked_queue.index(entry) + 1
    total_queue = len(ranked_queue)
    eta_mins = position / rate_per_min if rate_per_min > 0 else 999
    confidence_mins = int(eta_mins * 1.2) + 2

    # Entry probability: how likely to enter within confidence window
    if position <= 3:
        entry_probability = 98
    elif eta_mins <= 5:
        entry_probability = 95
    elif eta_mins <= 10:
        entry_probability = 90
    elif eta_mins <= 20:
        entry_probability = 75
    else:
        entry_probability = max(30, int(100 - eta_mins * 2))

    return {
        "position": position,
        "total_in_queue": total_queue,
        "eta_minutes": round(eta_mins, 1),
        "confidence_mins": confidence_mins,
        "entry_probability": entry_probability,
        "token": entry.get("token"),
        "ticket_id": entry.get("ticket_id"),
        "access_role": entry.get("access_role"),
        "wait_minutes": entry.get("wait_minutes"),
        "aging_boost": entry.get("aging_boost"),
        "effective_priority": entry.get("effective_priority"),
        "flow_mode": telemetry["flow_mode"],
        "telemetry": telemetry,
        "entry_rate": round(rate_per_min, 2),
        "workflow_step": WORKFLOW_STEPS[2],
    }


@app.get("/position")
def get_position(email: str, event_id: Optional[int] = None):
    data = get_position_data(email, event_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Not in active queue")
    return data


# ── Gate Admit ──

class AdmitRequest(BaseModel):
    token: str


class TelemetryUpdate(BaseModel):
    crowd_density: Optional[int] = None
    gate_load: Optional[int] = None
    network_mode: Optional[str] = None
    emergency_override: Optional[bool] = None


@app.post("/admin/admit")
async def admit_user(req: AdmitRequest, session: Session = Depends(get_session)):
    try:
        payload = jwt.decode(req.token, SECRET_KEY, algorithms=["HS256"])
        email = payload.get("sub")
        access_role = payload.get("role", "general")
        event_id = payload.get("event_id")

        pos = queue_manager.get_position(email, event_id)
        if pos is None:
            user = session.exec(select(User).where(User.email == email)).first()
            if user:
                latest_entry = session.exec(
                    select(QueueEntry)
                    .where(QueueEntry.user_id == user.id, QueueEntry.event_id == event_id)
                    .order_by(QueueEntry.joined_at.desc())
                ).first()
                if latest_entry and latest_entry.status == "entered":
                    record_event(
                        session,
                        "duplicate_scan",
                        f"Duplicate gate scan blocked for {email}.",
                        severity="warning",
                        actor_email=email,
                        actor_role=access_role,
                    )
                    return {"status": "error", "message": "Duplicate scan detected"}

            record_event(
                session,
                "invalid_queue_scan",
                f"Token for {email} was valid but not found in active queue.",
                severity="warning",
                actor_email=email,
                actor_role=access_role,
            )
            return {"status": "error", "message": "Ticket valid, but user not in active queue."}

        user_data = queue_manager.get_user_data(email, event_id)
        queue_manager.remove_user(email, event_id)

        user = session.exec(select(User).where(User.email == email)).first()
        if user:
            active_entry = session.exec(
                select(QueueEntry)
                .where(QueueEntry.user_id == user.id, QueueEntry.event_id == event_id, QueueEntry.status == "queued")
                .order_by(QueueEntry.joined_at.desc())
            ).first()
            if active_entry:
                active_entry.status = "entered"
                active_entry.entered_at = datetime.datetime.utcnow()
                session.add(active_entry)
                session.commit()

        record_event(
            session,
            "gate_admit",
            f"Gate admitted {email}.",
            severity="info",
            actor_email=email,
            actor_role=access_role,
        )

        await manager.broadcast(
            {
                "type": "user_admitted",
                "admitted_email": email,
                "size": queue_manager.get_queue_size(event_id),
                "entry_rate": round(pid.current_entry_rate, 2),
            }
        )
        await broadcast_system_state()
        return {
            "status": "success",
            "admitted": {"data": user_data},
            "queue_size": queue_manager.get_queue_size(event_id),
            "workflow_step": WORKFLOW_STEPS[4],
        }

    except jwt.ExpiredSignatureError:
        record_event(session, "expired_ticket_scan", "Expired ticket was presented at the gate.", severity="warning")
        return {"status": "error", "message": "Ticket Expired"}
    except jwt.InvalidTokenError:
        record_event(session, "invalid_ticket_scan", "Invalid ticket signature rejected at the gate.", severity="error")
        return {"status": "error", "message": "Invalid Ticket Signature"}


class ManualAdmitRequest(BaseModel):
    name: str
    email: Optional[str] = None
    event_id: Optional[int] = None

@app.post("/admin/manual_admit")
async def manual_admit(req: ManualAdmitRequest, session: Session = Depends(get_session)):
    entry = QueueEntry(
        guest_name=req.name,
        guest_email=req.email,
        event_id=req.event_id,
        status="entered",
        entered_at=datetime.datetime.utcnow()
    )
    session.add(entry)
    session.commit()
    
    record_event(
        session,
        "manual_admit",
        f"Manual entry for guest {req.name} ({req.email or 'no email'}).",
        severity="info",
        actor_role="staff"
    )
    
    await broadcast_system_state()
    return {"status": "success", "message": "Guest admitted manually."}

# ── Admin Settings ──

@app.post("/admin/settings")
async def update_pid_settings(target: int, session: Session = Depends(get_session)):
    pid.target_crowd = target
    record_event(
        session, "target_updated", f"Target crowd changed to {target}.",
        actor_email="admin@smartqx.local", actor_role="staff",
    )
    await broadcast_system_state()
    return {"status": "updated", "new_target": target}


@app.post("/admin/telemetry")
async def update_telemetry(payload: TelemetryUpdate, session: Session = Depends(get_session)):
    snapshot = telemetry_manager.update(**payload.model_dump())
    record_event(
        session, "telemetry_updated",
        f"Telemetry updated: crowd={snapshot['crowd_density']}, gate={snapshot['gate_load']}, "
        f"network={snapshot['network_mode']}, emergency={snapshot['emergency_override']}",
        actor_email="admin@smartqx.local", actor_role="staff",
    )
    await broadcast_system_state()
    return {"status": "updated", "telemetry": snapshot}


# ── Event Management ──

class EventCreate(BaseModel):
    name: str
    venue: str = ""
    event_date: str = ""
    max_capacity: int = 500


@app.post("/admin/events")
def create_event(body: EventCreate, user: User = Depends(require_admin), session: Session = Depends(get_session)):
    event = Event(name=body.name, venue=body.venue, event_date=body.event_date, max_capacity=body.max_capacity, created_by=user.id)
    session.add(event)
    session.commit()
    session.refresh(event)
    record_event(session, "event_created", f"Event '{body.name}' created by {user.email}.", actor_email=user.email, actor_role="admin")
    return {"status": "created", "event": {"id": event.id, "name": event.name, "venue": event.venue, "event_date": event.event_date, "max_capacity": event.max_capacity, "status": event.status}}


@app.get("/admin/events")
def list_events(session: Session = Depends(get_session)):
    events = session.exec(select(Event).order_by(Event.created_at.desc())).all()
    return [{"id": e.id, "name": e.name, "venue": e.venue, "event_date": e.event_date, "max_capacity": e.max_capacity, "status": e.status} for e in events]


@app.delete("/admin/events/{event_id}")
def delete_event(event_id: int, user: User = Depends(require_admin), session: Session = Depends(get_session)):
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    session.delete(event)
    session.commit()
    return {"status": "deleted"}


# ── Gate Management ──

class GateCreate(BaseModel):
    gate_number: str
    pin_code: str
    label: str = ""
    event_id: Optional[int] = None


@app.post("/admin/gates")
def create_gate(body: GateCreate, user: User = Depends(require_admin), session: Session = Depends(get_session)):
    existing = session.exec(select(Gate).where(Gate.gate_number == body.gate_number)).first()
    if existing:
        raise HTTPException(status_code=409, detail="Gate number already exists")
    gate = Gate(gate_number=body.gate_number, pin_code=body.pin_code, label=body.label, event_id=body.event_id)
    session.add(gate)
    session.commit()
    session.refresh(gate)
    record_event(session, "gate_created", f"Gate '{body.gate_number}' authorized by {user.email}.", actor_email=user.email, actor_role="admin")
    return {"status": "created", "gate": {"id": gate.id, "gate_number": gate.gate_number, "label": gate.label, "is_active": gate.is_active}}


@app.get("/admin/gates")
def list_gates(session: Session = Depends(get_session)):
    gates = session.exec(select(Gate).order_by(Gate.created_at.desc())).all()
    return [{"id": g.id, "gate_number": g.gate_number, "label": g.label, "event_id": g.event_id, "is_active": g.is_active} for g in gates]


@app.delete("/admin/gates/{gate_id}")
def delete_gate(gate_id: int, user: User = Depends(require_admin), session: Session = Depends(get_session)):
    gate = session.get(Gate, gate_id)
    if not gate:
        raise HTTPException(status_code=404, detail="Gate not found")
    session.delete(gate)
    session.commit()
    return {"status": "deleted"}


class GateAuthRequest(BaseModel):
    gate_number: str
    pin_code: str


@app.post("/gate/authenticate")
def authenticate_gate(body: GateAuthRequest, session: Session = Depends(get_session)):
    gate = session.exec(select(Gate).where(Gate.gate_number == body.gate_number)).first()
    if not gate or gate.pin_code != body.pin_code:
        raise HTTPException(status_code=401, detail="Invalid gate credentials")
    if not gate.is_active:
        raise HTTPException(status_code=403, detail="Gate is deactivated")
    return {"status": "authenticated", "gate": {"id": gate.id, "gate_number": gate.gate_number, "label": gate.label}}
