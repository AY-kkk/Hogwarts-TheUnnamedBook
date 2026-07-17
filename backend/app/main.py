from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Dict, Any
import time
import asyncio
from fastapi.responses import JSONResponse, StreamingResponse
import re
import os
import json

from app.security import (
    FixedWindowRateLimiter,
    SecuritySettings,
    SessionTokenError,
    SessionTokenManager,
)

security_settings = SecuritySettings.from_env()
session_tokens = SessionTokenManager(
    security_settings.session_secret,
    security_settings.session_ttl_seconds,
)
api_rate_limiter = FixedWindowRateLimiter(
    security_settings.rate_limit_requests,
    security_settings.rate_limit_window_seconds,
)
session_rate_limiter = FixedWindowRateLimiter(
    security_settings.session_issue_limit,
    security_settings.rate_limit_window_seconds,
)

app = FastAPI(title="Hogwarts Simulator API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(security_settings.cors_allowed_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)

class ChatRequest(BaseModel):
    user_input: str = Field(min_length=1, max_length=2000)
    context: Dict[str, Any]

class WizardProfile(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    gender: str = Field(min_length=1, max_length=20)
    blood_status: str = Field(min_length=1, max_length=30)
    era: str = Field(min_length=1, max_length=40)
    initial_trait: str = Field(min_length=1, max_length=100)
    wand: str = Field(min_length=1, max_length=100)
    patronus: str = Field(min_length=1, max_length=100)
    self_description: str = Field(min_length=20, max_length=200)

class StoryStartRequest(BaseModel):
    profile: WizardProfile

class ChapterTitleRequest(BaseModel):
    user_input: str = Field(min_length=1, max_length=2000)
    context_summary: str = Field(default="", max_length=4000)

class SessionResponse(BaseModel):
    token: str
    expires_in: int

class ChapterTitleResponse(BaseModel):
    title: str

_CJK_RE = re.compile(r"[\u4e00-\u9fff]")


@app.middleware("http")
async def reject_oversized_requests(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            exceeds_limit = int(content_length) > security_settings.max_request_bytes
        except ValueError:
            return JSONResponse({"detail": "Invalid Content-Length"}, status_code=400)
        if exceeds_limit:
            return JSONResponse({"detail": "Request body too large"}, status_code=413)
    return await call_next(request)


async def require_api_access(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Missing anonymous session token")
    try:
        session_id = session_tokens.verify(token)
    except SessionTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired anonymous session token") from exc

    retry_after = api_rate_limiter.consume(session_id)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded",
            headers={"Retry-After": str(retry_after)},
        )
    return session_id

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

@app.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": time.time()}

@app.post("/api/session", response_model=SessionResponse)
async def create_session(request: Request):
    client_key = request.client.host if request.client else "unknown"
    retry_after = session_rate_limiter.consume(client_key)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail="Session issue rate limit exceeded",
            headers={"Retry-After": str(retry_after)},
        )
    token, expires_in = session_tokens.issue()
    return SessionResponse(token=token, expires_in=expires_in)

@app.post("/api/story/start")
async def start_story(request: StoryStartRequest, _session_id: str = Depends(require_api_access)):
    from app.services.agent_workflow import generate_prologue

    profile = request.profile.model_dump()
    narrative = await generate_prologue(profile, request.profile.self_description)
    return {"narrative": narrative}

@app.post("/api/chapter/title", response_model=ChapterTitleResponse)
async def chapter_title(request: ChapterTitleRequest, _session_id: str = Depends(require_api_access)):
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
async def chat_endpoint(request: ChatRequest, _session_id: str = Depends(require_api_access)):
    context_chars = len(json.dumps(request.context, ensure_ascii=False, separators=(",", ":")))
    if context_chars > security_settings.max_context_chars:
        raise HTTPException(status_code=413, detail="Story context too large")
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
            
        except Exception:
            yield "event: error\ndata: generation_failed\n\n"
            yield "event: close\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "3000")))
