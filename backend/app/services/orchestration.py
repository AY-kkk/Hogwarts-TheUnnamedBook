from typing import Literal


IntentType = Literal["action", "chat", "invalid"]


def next_step_for_intent(intent: str) -> str:
    routes = {
        "action": "simulate_mechanics",
        "chat": "generate_narrative",
        "invalid": "handle_invalid",
    }
    try:
        return routes[intent]
    except KeyError as exc:
        raise ValueError(f"unsupported intent: {intent}") from exc


def append_trace(current: list[str] | None, stage: str) -> list[str]:
    return [*(current or []), stage]
