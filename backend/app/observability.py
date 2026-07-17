from __future__ import annotations

import json
import logging
import math
import os
import threading
import time
import uuid
from collections import defaultdict
from contextvars import ContextVar
from dataclasses import dataclass


request_id_context: ContextVar[str] = ContextVar("request_id", default="unknown")


def configure_json_logging() -> logging.Logger:
    logger = logging.getLogger("unnamed_book")
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)
    logger.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())
    logger.propagate = False
    return logger


logger = configure_json_logging()


def log_event(event: str, **fields: object) -> None:
    payload = {
        "timestamp": time.time(),
        "event": event,
        "request_id": request_id_context.get(),
        **fields,
    }
    logger.info(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


def new_request_id(candidate: str | None = None) -> str:
    if candidate and 8 <= len(candidate) <= 64 and all(
        character.isalnum() or character in "-_" for character in candidate
    ):
        return candidate
    return uuid.uuid4().hex


class MetricsRegistry:
    def __init__(self) -> None:
        self._counters: dict[tuple[str, tuple[tuple[str, str], ...]], float] = defaultdict(float)
        self._lock = threading.Lock()

    def increment(self, name: str, value: float = 1, **labels: str) -> None:
        key = (name, tuple(sorted(labels.items())))
        with self._lock:
            self._counters[key] += value

    def observe(self, name: str, value: float, **labels: str) -> None:
        self.increment(f"{name}_count", 1, **labels)
        self.increment(f"{name}_sum", value, **labels)

    def render_prometheus(self) -> str:
        with self._lock:
            rows = list(self._counters.items())
        lines: list[str] = []
        for (name, labels), value in sorted(rows):
            label_text = ""
            if labels:
                encoded = ",".join(
                    f'{key}="{label.replace(chr(92), chr(92) * 2).replace(chr(34), chr(92) + chr(34))}"'
                    for key, label in labels
                )
                label_text = f"{{{encoded}}}"
            lines.append(f"{name}{label_text} {value:g}")
        return "\n".join(lines) + "\n"


@dataclass(frozen=True)
class CostSettings:
    session_budget_usd: float
    input_cost_per_million_tokens: float
    output_cost_per_million_tokens: float

    @classmethod
    def from_env(cls) -> "CostSettings":
        settings = cls(
            session_budget_usd=float(os.getenv("SESSION_BUDGET_USD", "0.50")),
            input_cost_per_million_tokens=float(os.getenv("MODEL_INPUT_COST_PER_1M_TOKENS", "2.50")),
            output_cost_per_million_tokens=float(os.getenv("MODEL_OUTPUT_COST_PER_1M_TOKENS", "10.00")),
        )
        if settings.session_budget_usd <= 0:
            raise RuntimeError("SESSION_BUDGET_USD must be greater than zero")
        if settings.input_cost_per_million_tokens < 0 or settings.output_cost_per_million_tokens < 0:
            raise RuntimeError("model token costs cannot be negative")
        return settings


def estimate_token_cost(input_characters: int, output_characters: int, settings: CostSettings) -> float:
    input_tokens = math.ceil(max(0, input_characters) / 4)
    output_tokens = math.ceil(max(0, output_characters) / 4)
    return (
        input_tokens * settings.input_cost_per_million_tokens
        + output_tokens * settings.output_cost_per_million_tokens
    ) / 1_000_000


@dataclass(frozen=True)
class BudgetReservation:
    session_id: str
    amount_usd: float


class SessionBudgetExceeded(RuntimeError):
    pass


class SessionBudgetTracker:
    def __init__(self, limit_usd: float):
        if limit_usd <= 0:
            raise ValueError("session budget must be greater than zero")
        self._limit_usd = limit_usd
        self._spent: dict[str, float] = defaultdict(float)
        self._reserved: dict[str, float] = defaultdict(float)
        self._lock = threading.Lock()

    def reserve(self, session_id: str, amount_usd: float) -> BudgetReservation:
        with self._lock:
            projected = self._spent[session_id] + self._reserved[session_id] + amount_usd
            if projected > self._limit_usd:
                raise SessionBudgetExceeded("anonymous session AI budget exhausted")
            self._reserved[session_id] += amount_usd
        return BudgetReservation(session_id=session_id, amount_usd=amount_usd)

    def settle(self, reservation: BudgetReservation, actual_usd: float | None = None) -> float:
        charged = reservation.amount_usd if actual_usd is None else max(0, actual_usd)
        with self._lock:
            self._reserved[reservation.session_id] = max(
                0, self._reserved[reservation.session_id] - reservation.amount_usd
            )
            self._spent[reservation.session_id] += charged
            return self._spent[reservation.session_id]
