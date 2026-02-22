from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.services.llm_factory import LLMFactory

class SimulatorAgent:
    def __init__(self):
        self.llm = LLMFactory.create_llm()
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", """
            You are the Game Mechanics Engine.
            Your job is to strictly calculate the outcome of the user's action based on the Core Rules.
            
            Core Rules Reference:
            {core_rules_snippet}
            
            Player Status:
            {status_json}
            
            Task:
            1. Identify the skill/attribute involved (e.g., Knowledge for spells, Charm for social).
            2. Determine the difficulty (DC).
            3. Simulate a dice roll (D100 or D20 as per rules).
            4. Compare Roll vs DC.
            5. Return the RESULT only. Do not write the story.
            
            Output Format:
            [Check: Spell Casting (Levitation Charm)]
            [Attribute: Knowledge (15)]
            [Difficulty: Tier 1 (DC 10)]
            [Roll: 18]
            [Result: SUCCESS]
            [Effect: The feather floats.]
            """),
            ("user", "Action: {user_input}")
        ])
        self.chain = self.prompt | self.llm | StrOutputParser()

    async def simulate(self, user_input: str, status: dict, rules_snippet: str = "") -> str:
        return await self.chain.ainvoke({
            "user_input": user_input,
            "status_json": str(status),
            "core_rules_snippet": rules_snippet
        })
