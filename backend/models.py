from datetime import datetime
from typing import Optional, List
from sqlmodel import Field, Relationship, SQLModel
import uuid


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    name: str
    password_hash: str = Field(default="")
    role: str = Field(default="user")  # "user" or "admin"
    created_at: datetime = Field(default_factory=datetime.utcnow)

    queues: List["QueueEntry"] = Relationship(back_populates="user")


class QueueEntry(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    event_id: Optional[int] = Field(default=None, foreign_key="event.id")
    guest_name: Optional[str] = None
    guest_email: Optional[str] = None
    status: str = Field(default="queued")  # queued, entered, cancelled, expired
    entry_token: str = Field(default_factory=lambda: str(uuid.uuid4()), index=True)
    joined_at: datetime = Field(default_factory=datetime.utcnow)
    entered_at: Optional[datetime] = None

    user: User = Relationship(back_populates="queues")


class QueueStats(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    current_size: int
    entry_rate: float  # Persons per minute (controlled by PID)
    target_rate: float


class AuditEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    event_type: str = Field(index=True)
    severity: str = Field(default="info", index=True)
    actor_email: Optional[str] = Field(default=None, index=True)
    actor_role: Optional[str] = None
    event_id: Optional[int] = Field(default=None, foreign_key="event.id")
    details: str
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class Event(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    venue: str = Field(default="")
    event_date: str = Field(default="")
    max_capacity: int = Field(default=500)
    status: str = Field(default="active")  # active, completed, cancelled
    created_by: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Gate(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    gate_number: str = Field(index=True, unique=True)
    pin_code: str = Field(default="")
    label: str = Field(default="")
    event_id: Optional[int] = Field(default=None, foreign_key="event.id")
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
