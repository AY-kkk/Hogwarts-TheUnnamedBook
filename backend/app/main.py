from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List
import time
import asyncio
from fastapi.responses import StreamingResponse
import re
import os

app = FastAPI(title="Hogwarts Simulator API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    user_input: str
    context: Dict[str, Any]
    api_key: str = ""

class WizardProfile(BaseModel):
    name: str
    gender: str
    blood_status: str
    era: str
    initial_trait: str
    wand: str
    patronus: str
    self_description: str

class StoryStartRequest(BaseModel):
    profile_id: str
    self_description: str

class ChapterTitleRequest(BaseModel):
    user_input: str
    context_summary: str = ""

class ChapterTitleResponse(BaseModel):
    title: str

_CJK_RE = re.compile(r"[\u4e00-\u9fff]")

def _normalize_chapter_title(text: str) -> str:
    if not text:
        return "新的故事回合开启"
    chars = _CJK_RE.findall(text)
    title = "".join(chars)
    if len(title) < 8:
        title = (title + "新的故事回合开启")[:8]
    if len(title) > 20:
        title = title[:20]
    return title

# In-memory storage for profiles (for now)
PROFILES = {}

@app.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": time.time()}

@app.get("/api/characters")
async def get_characters():
    return [
        {**p, "id": pid} 
        for pid, p in PROFILES.items()
    ]

@app.post("/api/wizard-profile")
async def create_wizard_profile(profile: WizardProfile):
    import uuid
    if len(PROFILES) >= 3:
        raise HTTPException(status_code=400, detail="Character slot limit reached (3)")
        
    profile_id = str(uuid.uuid4())
    profile_data = profile.dict()
    profile_data.update({
        "level": 1,
        "created_at": time.time(),
        "last_played": time.time()
    })
    PROFILES[profile_id] = profile_data
    return {"profileId": profile_id}

@app.delete("/api/character/{profile_id}")
async def delete_character(profile_id: str):
    if profile_id in PROFILES:
        del PROFILES[profile_id]
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Profile not found")

@app.post("/api/story/start")
async def start_story(request: StoryStartRequest):
    profile = PROFILES.get(request.profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Verify self_description matches (or just use the one from request if needed)
    # The requirement says "把“自我”字段作为核心参数传入", so we prioritize request
    
    # Here we would normally invoke the agent to generate the prologue.
    # For now, let's create a specialized prologue generation logic.
    from app.services.agent_workflow import generate_prologue
    
    narrative = await generate_prologue(profile, request.self_description)
    return {"narrative": narrative}

@app.post("/api/chapter/title", response_model=ChapterTitleResponse)
async def chapter_title(request: ChapterTitleRequest):
    from app.services.llm_factory import LLMFactory
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import StrOutputParser

    llm = LLMFactory.create_llm()
    prompt = ChatPromptTemplate.from_messages([
        ("system", """
你是“章节标题生成器”。请根据用户本轮输入与上下文摘要，生成一个中文标题名（仅标题名，不要包含“第x章:”前缀）。

[强约束]
1) 标题名长度：8-20个汉字
2) 禁止出现任何标点符号、特殊符号或空格
3) 必须与本轮输入高度相关，能概括核心事件或意图
4) 只输出标题名，不要输出任何解释
"""),
        ("user", "用户本轮输入：{user_input}\n上下文摘要：{context_summary}\n请输出标题名：")
    ])
    chain = prompt | llm | StrOutputParser()
    raw = await chain.ainvoke({
        "user_input": request.user_input,
        "context_summary": request.context_summary
    })
    return {"title": _normalize_chapter_title(raw)}

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    # Streaming response from the Agent Workflow
    async def event_generator():
        try:
            from app.services.agent_workflow import agent_workflow
            
            # Initial state
            initial_state = {
                "user_input": request.user_input,
                "context": request.context,
                "system_prompt": "" # Will be loaded by agents if needed
            }
            
            # Run the graph (invoke returns the final state)
            # For streaming, we would ideally stream the tokens from the final node
            # But LangGraph streaming is complex. For V1, we await the result and stream it out as chunks.
            
            yield "event: status\ndata: exploring\n\n"
            task = asyncio.create_task(agent_workflow.app.ainvoke(initial_state))
            timeout_seconds = 120
            elapsed = 0
            while not task.done():
                await asyncio.sleep(5)
                elapsed += 5
                yield ": keep-alive\n\n"
                yield f"event: status\ndata: exploring:{elapsed}\n\n"
                if elapsed >= timeout_seconds:
                    task.cancel()
                    yield "event: error\ndata: timeout\n\n"
                    yield "event: close\n\n"
                    return
            final_state = await task
            narrative = final_state.get("narrative", "")
            
            # Simulate streaming the result
            chunk_size = 20
            for i in range(0, len(narrative), chunk_size):
                chunk = narrative[i:i+chunk_size]
                yield f"data: {chunk}\n\n"
                await asyncio.sleep(0.02) # Typing effect
                
            yield "event: close\n\n"
            
        except Exception as e:
            yield f"event: error\ndata: {str(e)}\n\n"
            yield "event: close\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "3000")))
