from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict


def clamp(value: int, lower: int, upper: int) -> int:
    return max(lower, min(upper, value))


@dataclass
class TelemetryState:
    crowd_density: int = 34
    gate_load: int = 22
    network_mode: str = "online"
    emergency_override: bool = False
    last_updated: str = field(default_factory=lambda: datetime.utcnow().isoformat())


class TelemetryManager:
    def __init__(self):
        self.state = TelemetryState()

    def update(self, **changes) -> Dict[str, object]:
        for key, value in changes.items():
            if value is None or not hasattr(self.state, key):
                continue

            if key in {"crowd_density", "gate_load"}:
                setattr(self.state, key, clamp(int(value), 0, 100))
            elif key == "network_mode":
                mode = str(value).lower()
                if mode in {"online", "degraded", "offline"}:
                    setattr(self.state, key, mode)
            elif key == "emergency_override":
                setattr(self.state, key, bool(value))

        self.state.last_updated = datetime.utcnow().isoformat()
        return self.snapshot()

    def snapshot(self) -> Dict[str, object]:
        density = self.state.crowd_density
        gate_load = self.state.gate_load
        emergency = self.state.emergency_override
        risk_score = int((density * 0.55) + (gate_load * 0.45) + (15 if emergency else 0))

        if emergency or risk_score >= 75:
            risk_level = "critical"
        elif risk_score >= 45:
            risk_level = "watch"
        else:
            risk_level = "stable"

        if emergency:
            flow_mode = "Emergency throttle"
        elif self.state.network_mode == "offline":
            flow_mode = "Offline continuity"
        elif risk_level == "critical":
            flow_mode = "Protective backpressure"
        elif risk_level == "watch":
            flow_mode = "Adaptive balancing"
        else:
            flow_mode = "Normal flow"

        return {
            "crowd_density": density,
            "gate_load": gate_load,
            "network_mode": self.state.network_mode,
            "emergency_override": emergency,
            "risk_score": clamp(risk_score, 0, 100),
            "risk_level": risk_level,
            "flow_mode": flow_mode,
            "pressure_units": round((density / 14) + (gate_load / 20), 2),
            "last_updated": self.state.last_updated,
        }


telemetry_manager = TelemetryManager()
