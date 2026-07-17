from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.services.llm_factory import LLMFactory
from app.services.prompt_service import prompt_service


class NarratorAgent:
    def __init__(self):
        self.llm = LLMFactory.create_llm()
        self.action_prompt = ChatPromptTemplate.from_template(
            prompt_service.get_template("narrator_action")
        )
        self.chat_prompt = ChatPromptTemplate.from_template(
            prompt_service.get_template("narrator_chat")
        )

    async def narrate(
        self,
        user_input: str,
        simulation_result: str,
        context: dict,
        turn_directive: str,
    ):
        is_chat = simulation_result == "Chat Mode"
        prompt = self.chat_prompt if is_chat else self.action_prompt
        chain = prompt | self.llm | StrOutputParser()
        values = {
            "user_input": user_input,
            "context_summary": str(context),
            "turn_directive": turn_directive,
        }
        if not is_chat:
            values["simulation_result"] = simulation_result
        return await chain.ainvoke(values)
