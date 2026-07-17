import json

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import END, StateGraph

from app.models.agent_state import GameState
from app.game_rules import build_turn_directive
from app.services.agents.intent_agent import IntentAnalyzer
from app.services.agents.narrator_agent import NarratorAgent
from app.services.agents.simulator_agent import SimulatorAgent
from app.services.llm_factory import LLMFactory
from app.services.orchestration import append_trace, next_step_for_intent
from app.services.prompt_service import prompt_service


async def generate_prologue(profile: dict, self_description: str) -> str:
    prompt = ChatPromptTemplate.from_template(prompt_service.get_template("prologue"))
    chain = prompt | LLMFactory.create_llm() | StrOutputParser()
    return await chain.ainvoke({
        "core_rules": prompt_service.get_rule("core"),
        "prologue_rules": prompt_service.get_rule("prologue"),
        "profile_json": json.dumps(profile, ensure_ascii=False, sort_keys=True),
        "self_description": self_description,
    })


class AgentWorkflow:
    def __init__(self):
        self.intent_agent = IntentAnalyzer()
        self.simulator_agent = SimulatorAgent()
        self.narrator_agent = NarratorAgent()

        workflow = StateGraph(GameState)
        workflow.add_node("analyze_intent", self.analyze_intent)
        workflow.add_node("simulate_mechanics", self.simulate_mechanics)
        workflow.add_node("generate_narrative", self.generate_narrative)
        workflow.add_node("handle_invalid", self.handle_invalid)
        workflow.set_entry_point("analyze_intent")
        workflow.add_conditional_edges(
            "analyze_intent",
            lambda state: next_step_for_intent(state["intent"]),
            {
                "simulate_mechanics": "simulate_mechanics",
                "generate_narrative": "generate_narrative",
                "handle_invalid": "handle_invalid",
            },
        )
        workflow.add_edge("simulate_mechanics", "generate_narrative")
        workflow.add_edge("generate_narrative", END)
        workflow.add_edge("handle_invalid", END)
        self.app = workflow.compile()

    async def analyze_intent(self, state: GameState):
        result = await self.intent_agent.analyze(state["user_input"], state["context"])
        return {
            "intent": result["type"],
            "orchestration_trace": append_trace(state.get("orchestration_trace"), "intent"),
        }

    async def simulate_mechanics(self, state: GameState):
        result = await self.simulator_agent.simulate(
            state["user_input"],
            state["context"].get("status_snapshot", {}),
            prompt_service.get_rule("core"),
        )
        return {
            "simulation_result": result,
            "orchestration_trace": append_trace(state.get("orchestration_trace"), "simulator"),
        }

    async def generate_narrative(self, state: GameState):
        simulation = state.get("simulation_result", "Chat Mode")
        directive = build_turn_directive(
            state["context"].get("status_snapshot", {})
        ).to_prompt()
        narrative = await self.narrator_agent.narrate(
            state["user_input"], simulation, state["context"], directive
        )
        return {
            "narrative": narrative,
            "orchestration_trace": append_trace(state.get("orchestration_trace"), "narrator"),
        }

    async def handle_invalid(self, state: GameState):
        return {
            "narrative": "## 魔法干扰\n\n你的念头在城堡的魔法边界前消散了。这个请求无法在当前世界中发生，请换一个符合角色能力与时代的行动。",
            "orchestration_trace": append_trace(state.get("orchestration_trace"), "invalid_guard"),
        }


agent_workflow = AgentWorkflow()
