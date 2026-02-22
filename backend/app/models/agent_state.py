from typing import TypedDict, List, Dict, Any, Annotated
from langgraph.graph import StateGraph, END
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
import operator

class GameState(TypedDict):
    # Core inputs
    user_input: str
    context: Dict[str, Any]
    system_prompt: str
    
    # Internal flow control
    intent: str  # 'action', 'chat', 'invalid'
    simulation_result: str
    
    # Final outputs
    narrative: str
    state_update: str # JSON string
    final_response: str
