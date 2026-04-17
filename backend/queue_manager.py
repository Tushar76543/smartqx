import logging
import os
from datetime import datetime
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

ROLE_PRIORITY = {
    "general": 0,
    "priority": 1,
    "vip": 2,
    "staff": 2,
}
AGING_INTERVAL_MINUTES = 4
MAX_AGING_BOOST = 2


def _utc_now() -> datetime:
    return datetime.utcnow()


def _parse_joined_at(value: str) -> datetime:
    if not value:
        return _utc_now()

    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return _utc_now()


def _normalize_access_role(role: Optional[str], priority: Optional[object] = None) -> str:
    if role:
        candidate = str(role).lower()
        if candidate in ROLE_PRIORITY:
            return candidate

    try:
        numeric_priority = int(priority)
    except (TypeError, ValueError):
        numeric_priority = 0

    if numeric_priority >= 2:
        return "staff"
    if numeric_priority == 1:
        return "vip"
    return "general"


def _normalize_user_data(user_email: str, user_data: Dict[str, object]) -> Dict[str, object]:
    access_role = _normalize_access_role(
        user_data.get("access_role"), user_data.get("priority")
    )
    joined_at = str(user_data.get("joined_at") or _utc_now().isoformat())

    return {
        "name": str(user_data.get("name") or user_email.split("@")[0]),
        "email": user_email,
        "access_role": access_role,
        "priority": ROLE_PRIORITY[access_role],
        "token": str(user_data.get("token") or ""),
        "ticket_id": str(user_data.get("ticket_id") or ""),
        "joined_at": joined_at,
        "ticket_status": str(user_data.get("ticket_status") or "active"),
    }


def _enrich_queue_member(member: Dict[str, object], original_index: int) -> Dict[str, object]:
    joined_at = _parse_joined_at(str(member.get("joined_at") or ""))
    wait_minutes = max(0, int((_utc_now() - joined_at).total_seconds() // 60))
    access_role = _normalize_access_role(member.get("access_role"), member.get("priority"))
    base_priority = ROLE_PRIORITY[access_role]
    aging_boost = min(wait_minutes // AGING_INTERVAL_MINUTES, MAX_AGING_BOOST)
    effective_priority = base_priority + aging_boost

    return {
        **member,
        "access_role": access_role,
        "priority_level": base_priority,
        "wait_minutes": wait_minutes,
        "aging_boost": aging_boost,
        "effective_priority": effective_priority,
        "joined_at": joined_at.isoformat(),
        "original_index": original_index,
    }


def _rank_queue(records: List[Dict[str, object]]) -> List[Dict[str, object]]:
    enriched = [_enrich_queue_member(record, index) for index, record in enumerate(records)]
    return sorted(
        enriched,
        key=lambda item: (
            -item["effective_priority"],
            item["original_index"] if item["aging_boost"] == 0 else item["wait_minutes"] * -1,
            item["joined_at"],
            item["email"],
        ),
    )


class InMemoryQueueManager:
    """Fallback queue manager that works without Redis."""

    def __init__(self):
        self.backend_name = "in-memory"
        self.queues: Dict[Optional[int], List[str]] = {}
        self.user_data: Dict[str, Dict[str, object]] = {}
        logger.info("Using IN-MEMORY queue (no Redis required)")

    def _get_q(self, event_id: Optional[int]) -> List[str]:
        if event_id not in self.queues:
            self.queues[event_id] = []
        return self.queues[event_id]

    def _data_key(self, user_email: str, event_id: Optional[int]) -> str:
        return f"{user_email}:{event_id}"

    def add_to_queue(self, user_email: str, user_data: dict, event_id: Optional[int] = None) -> bool:
        data_key = self._data_key(user_email, event_id)
        if data_key in self.user_data:
            return False
        normalized = _normalize_user_data(user_email, user_data)
        normalized["event_id"] = event_id
        self.user_data[data_key] = normalized
        self._get_q(event_id).append(data_key)
        return True

    def list_users(self, event_id: Optional[int] = None) -> List[Dict[str, object]]:
        return [
            {"email": dk.split(":")[0], **self.user_data[dk]}
            for dk in self._get_q(event_id)
            if dk in self.user_data
        ]

    def get_ranked_queue(self, event_id: Optional[int] = None) -> List[Dict[str, object]]:
        return _rank_queue(self.list_users(event_id))

    def get_position(self, user_email: str, event_id: Optional[int] = None) -> Optional[int]:
        for index, item in enumerate(self.get_ranked_queue(event_id), start=1):
            if item["email"] == user_email:
                return index
        return None

    def get_user_data(self, user_email: str, event_id: Optional[int] = None) -> Optional[dict]:
        data_key = self._data_key(user_email, event_id)
        return self.user_data.get(data_key)

    def pop_next(self, event_id: Optional[int] = None) -> Optional[dict]:
        ranked = self.get_ranked_queue(event_id)
        if not ranked:
            return None
        next_user = ranked[0]["email"]
        data_key = self._data_key(next_user, event_id)
        user_data = self.user_data.pop(data_key, None)
        q = self._get_q(event_id)
        if data_key in q:
            q.remove(data_key)
        return {"email": next_user, "data": user_data}

    def remove_user(self, user_email: str, event_id: Optional[int] = None) -> bool:
        data_key = self._data_key(user_email, event_id)
        if data_key not in self.user_data:
            return False
        q = self._get_q(event_id)
        if data_key in q:
            q.remove(data_key)
        self.user_data.pop(data_key, None)
        return True

    def get_queue_size(self, event_id: Optional[int] = None) -> int:
        return len(self._get_q(event_id))

    def peak_queue(self, count=10, event_id: Optional[int] = None):
        return self.get_ranked_queue(event_id)[:count]


class RedisQueueManager:
    """Redis-backed queue manager with fair ranking on reads."""

    def __init__(self, redis_client):
        self.backend_name = "redis"
        self.redis = redis_client

    def _queue_key(self, event_id: Optional[int]) -> str:
        return f"smartq:queue:{event_id}"

    def _data_key(self, user_email: str, event_id: Optional[int]) -> str:
        return f"smartq:user:{user_email}:{event_id}"

    def add_to_queue(self, user_email: str, user_data: dict, event_id: Optional[int] = None) -> bool:
        data_key = self._data_key(user_email, event_id)
        if self.redis.exists(data_key):
            return False
        normalized = _normalize_user_data(user_email, user_data)
        normalized["event_id"] = str(event_id) if event_id is not None else ""
        self.redis.hset(data_key, mapping={k: str(v) for k, v in normalized.items()})
        self.redis.rpush(self._queue_key(event_id), user_email)
        return True

    def list_users(self, event_id: Optional[int] = None) -> List[Dict[str, object]]:
        records = []
        for user_email in self.redis.lrange(self._queue_key(event_id), 0, -1):
            data = self.redis.hgetall(self._data_key(user_email, event_id))
            if data:
                records.append({"email": user_email, **data})
        return records

    def get_ranked_queue(self, event_id: Optional[int] = None) -> List[Dict[str, object]]:
        return _rank_queue(self.list_users(event_id))

    def get_position(self, user_email: str, event_id: Optional[int] = None) -> Optional[int]:
        for index, item in enumerate(self.get_ranked_queue(event_id), start=1):
            if item["email"] == user_email:
                return index
        return None

    def get_user_data(self, user_email: str, event_id: Optional[int] = None) -> Optional[dict]:
        data_key = self._data_key(user_email, event_id)
        if self.redis.exists(data_key):
            return self.redis.hgetall(data_key)
        return None

    def pop_next(self, event_id: Optional[int] = None) -> Optional[dict]:
        ranked = self.get_ranked_queue(event_id)
        if not ranked:
            return None
        next_user = ranked[0]["email"]
        user_data = self.get_user_data(next_user, event_id)
        self.redis.lrem(self._queue_key(event_id), 0, next_user)
        self.redis.delete(self._data_key(next_user, event_id))
        return {"email": next_user, "data": user_data}

    def remove_user(self, user_email: str, event_id: Optional[int] = None) -> bool:
        data_key = self._data_key(user_email, event_id)
        if not self.redis.exists(data_key):
            return False
        self.redis.lrem(self._queue_key(event_id), 0, user_email)
        self.redis.delete(data_key)
        return True

    def get_queue_size(self, event_id: Optional[int] = None) -> int:
        return self.redis.llen(self._queue_key(event_id))

    def peak_queue(self, count=10, event_id: Optional[int] = None):
        return self.get_ranked_queue(event_id)[:count]


def create_queue_manager():
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    try:
        import redis

        client = redis.Redis.from_url(redis_url, decode_responses=True)
        client.ping()
        logger.info("Connected to Redis at %s", redis_url)
        return RedisQueueManager(client)
    except Exception as exc:
        logger.warning("Redis unavailable (%s). Using in-memory queue.", exc)
        return InMemoryQueueManager()


queue_manager = create_queue_manager()
