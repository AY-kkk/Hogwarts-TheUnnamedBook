from langgraph.graph import StateGraph, END
from app.models.agent_state import GameState
from app.services.agents.intent_agent import IntentAnalyzer
from app.services.agents.simulator_agent import SimulatorAgent
from app.services.agents.narrator_agent import NarratorAgent

class AgentWorkflow:
    def __init__(self):
        self.intent_agent = IntentAnalyzer()
        self.simulator_agent = SimulatorAgent()
        self.narrator_agent = NarratorAgent()
        
        self.workflow = StateGraph(GameState)
        
        # Add Nodes
        self.workflow.add_node("analyze_intent", self.analyze_intent)
        self.workflow.add_node("simulate_mechanics", self.simulate_mechanics)
        self.workflow.add_node("generate_narrative", self.generate_narrative)
        self.workflow.add_node("handle_invalid", self.handle_invalid)
        
        # Add Edges
        self.workflow.set_entry_point("analyze_intent")
        
        self.workflow.add_conditional_edges(
            "analyze_intent",
            lambda state: state["intent"],
            {
                "action": "simulate_mechanics",
                "chat": "generate_narrative", # Skip simulation for pure chat
                "invalid": "handle_invalid"
            }
        )
        
        self.workflow.add_edge("simulate_mechanics", "generate_narrative")
        self.workflow.add_edge("generate_narrative", END)
        self.workflow.add_edge("handle_invalid", END)
        
        self.app = self.workflow.compile()

    async def analyze_intent(self, state: GameState):
        result = await self.intent_agent.analyze(state["user_input"], state["context"])
        return {"intent": result["type"]}

    async def simulate_mechanics(self, state: GameState):
        # Retrieve core rules snippet (TODO: Load from file)
        rules = "D20 Check: Roll + Attribute. DC 10 for Easy, 15 Medium, 20 Hard." 
        result = await self.simulator_agent.simulate(state["user_input"], state["context"].get("status_snapshot", {}), rules)
        return {"simulation_result": result}

    async def generate_narrative(self, state: GameState):
        # Streaming is handled at the API level, but here we generate the full text
        # For streaming, we might need to invoke the chain directly in the endpoint
        # But for now, let's return the full text to keep the graph simple
        simulation = state.get("simulation_result", "Chat Mode")
        narrative = await self.narrator_agent.narrate(state["user_input"], simulation, state["context"])
        return {"narrative": narrative}

    async def handle_invalid(self, state: GameState):
        return {"narrative": "## 魔法干扰\n\n你的思绪似乎有些混乱，霍格沃茨的魔法场排斥了这个念头。\n\n*（系统提示：检测到非法指令或出戏行为，请重新尝试。）*"}

from app.services.llm_factory import LLMFactory
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

async def generate_prologue(profile: dict, self_description: str) -> str:
    llm = LLMFactory.create_llm()
    prompt = ChatPromptTemplate.from_messages([
        ("system", """
        You are the Narrator of a Harry Potter RPG.
        Your task is to generate the Prologue (Chapter 1) for a new wizard student.
        
        [Student Profile]
        Name: {name}
        Gender: {gender}
        Blood Status: {blood_status}
        Era: {era}
        Initial Trait: {initial_trait}
        Wand: {wand}
        Patronus: {patronus}
        
        [Self Description (Crucial)]
        "{self_description}"
        
        [Instructions]
        1. Start with a Level 1 Markdown Title: "# [Title Name]". The title MUST be concise, attractive, and accurately summarize the core plot, theme, or conflict of this chapter.
        2. Incorporate the 'Self Description' deeply into the narrative. How does their personality/history affect this moment?
        3. Describe the moment they receive their Hogwarts Letter (or equivalent for the era).
        4. End with them preparing to leave for Diagon Alley or the Hogwarts Express.
        5. Length: ~500-800 words. Immersive, magical style.
        
        [Thinking Process]
        Do NOT output any thinking process like "# Thinking..." or similar. Just output the story directly.
        """),
        ("user", "Start my journey.")
    ])
    chain = prompt | llm | StrOutputParser()
    return await chain.ainvoke({
        "name": profile.get("name"),
        "gender": profile.get("gender"),
        "blood_status": profile.get("blood_status"),
        "era": profile.get("era"),
        "initial_trait": profile.get("initial_trait"),
        "wand": profile.get("wand"),
        "patronus": profile.get("patronus"),
        "self_description": self_description
    })

agent_workflow = AgentWorkflow()
