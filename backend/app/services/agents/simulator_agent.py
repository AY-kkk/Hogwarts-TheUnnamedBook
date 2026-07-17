from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.services.llm_factory import LLMFactory
from app.services.prompt_service import prompt_service

class SimulatorAgent:
    def __init__(self):
        self.llm = LLMFactory.create_llm()
        self.prompt = ChatPromptTemplate.from_template(prompt_service.get_template("simulator"))
        self.chain = self.prompt | self.llm | StrOutputParser()

    async def simulate(self, user_input: str, status: dict, rules_snippet: str = "") -> str:
        return await self.chain.ainvoke({
            "user_input": user_input,
            "status_json": str(status),
            "core_rules": rules_snippet
        })
