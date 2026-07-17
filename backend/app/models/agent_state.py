from typing import Any, TypedDict


class GameState(TypedDict, total=False):
    user_input: str
    context: dict[str, Any]
    intent: str
    simulation_result: str
    narrative: str
    prompt_version: str
    rules_version: str
    state_schema_version: str
    orchestration_trace: list[str]
