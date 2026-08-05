from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field
from typing import Literal, Dict, Any

from app.services.llm_factory import LLMFactory
from app.observability import log_event
from app.services.prompt_service import prompt_service

# --- Intent Schema ---
class IntentSchema(BaseModel):
    type: Literal["action", "chat", "invalid"] = Field(description="The type of user input")
    reason: str = Field(description="Why this classification was made")
    target: str = Field(description="The target of the action, if any", default="")

class IntentAnalyzer:
    def __init__(self):
        self.parser = JsonOutputParser(pydantic_object=IntentSchema)
        
        self.prompt = ChatPromptTemplate.from_template(prompt_service.get_template("intent"))
        
    async def analyze(self, user_input: str, context: Dict[str, Any]) -> Dict[str, Any]:
        try:
            chain = self.prompt | LLMFactory.create_llm() | self.parser
            result = await chain.ainvoke({
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
