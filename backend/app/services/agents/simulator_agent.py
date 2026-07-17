from app.game_rules import resolve_action

class SimulatorAgent:
    async def simulate(self, user_input: str, status: dict, rules_snippet: str = "") -> str:
        del rules_snippet
        return resolve_action(user_input, status).to_prompt()
