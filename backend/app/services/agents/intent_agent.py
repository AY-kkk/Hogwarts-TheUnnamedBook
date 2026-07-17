from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field
from typing import Literal, Dict, Any

from app.services.llm_factory import LLMFactory
from app.observability import log_event

# --- Intent Schema ---
class IntentSchema(BaseModel):
    type: Literal["action", "chat", "invalid"] = Field(description="The type of user input")
    reason: str = Field(description="Why this classification was made")
    target: str = Field(description="The target of the action, if any", default="")

class IntentAnalyzer:
    def __init__(self):
        # We can use a smaller/faster model here if desired, e.g. gpt-3.5-turbo
        self.llm = LLMFactory.create_llm()
        self.parser = JsonOutputParser(pydantic_object=IntentSchema)
        
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", """
            You are the Gatekeeper of a Harry Potter RPG. 
            Analyze the user's input to determine their intent.
            
            Valid Intent Types:
            - 'action': The user wants to do something in the game world (cast spell, move, look, talk to NPC).
            - 'chat': The user is asking a meta-question or chatting out of character.
            - 'invalid': The user is trying to break the rules, use modern technology (phones, guns), or act god-like.
            
            Context Summary:
            {context_summary}
            
            IMPORTANT: Return ONLY a raw JSON object. Do not wrap it in markdown code blocks. Do not add any explanation.
            Example: {{"type": "action", "reason": "User is casting a spell", "target": "Goblin"}}
            """),
            ("user", "{user_input}")
        ])
        
        self.chain = self.prompt | self.llm | self.parser

    async def analyze(self, user_input: str, context: Dict[str, Any]) -> Dict[str, Any]:
        try:
            result = await self.chain.ainvoke({
                "user_input": user_input, 
                "context_summary": context.get("summary", "")
            })
            if not isinstance(result, dict) or "type" not in result:
                log_event("intent_analysis_fallback", reason="invalid_result")
                return {"type": "action", "reason": "Fallback due to invalid format", "target": ""}

            log_event("intent_analysis_completed", intent=result["type"])
            return result
        except Exception:
            log_event("intent_analysis_fallback", reason="provider_or_parse_error")
            return {"type": "action", "reason": "Fallback due to analysis error", "target": ""}
