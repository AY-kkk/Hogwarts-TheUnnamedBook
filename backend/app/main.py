from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Any, Dict, Literal
from dataclasses import dataclass
import time
import asyncio
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.responses import PlainTextResponse
import re
import os
import json

from app.security import (
    FixedWindowRateLimiter,
    SecuritySettings,
    SessionTokenError,
    SessionTokenManager,
)
from app.observability import (
    CostSettings,
    MetricsRegistry,
    SessionBudgetExceeded,
    SessionBudgetTracker,
    estimate_token_cost,
    estimate_tokens,
    log_event,
    new_request_id,
    request_id_context,
)
from app.services.prompt_service import prompt_service
from app.content_safety import inspect_content
from app.game_rules import RuleContextError, validate_status_snapshot
from app.admin.compatible_client import OpenAICompatibleClient
from app.admin.repository import ModelConfigRepository
from app.admin.router import create_admin_router
from app.admin.schemas import UsageRecord
from app.admin.settings import AdminSettings
from app.services.llm_factory import LLMFactory
from app.services.runtime_model import (
    ResolvedModel,
    bind_runtime_model,
    reset_runtime_model,
)

security_settings = SecuritySettings.from_env()
admin_settings = AdminSettings.from_env()
model_repository = ModelConfigRepository(
    admin_settings.database_path,
    admin_settings.encryption_key,
)
compatible_client = OpenAICompatibleClient(
    app_env=admin_settings.app_env,
    allow_private_endpoints=admin_settings.allow_private_endpoints,
)
LLMFactory.configure_repository(
    model_repository,
    app_env=admin_settings.app_env,
    allow_private_endpoints=admin_settings.allow_private_endpoints,
)
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
cost_settings = CostSettings.from_env()
budget_tracker = SessionBudgetTracker(cost_settings.session_budget_usd)
metrics = MetricsRegistry()
app_started_at = time.time()
app_version = os.getenv("APP_VERSION", "dev")
metrics_token = os.getenv("METRICS_TOKEN", "development-metrics-token").strip()
if security_settings.app_env == "production" and len(metrics_token) < 32:
    raise RuntimeError("METRICS_TOKEN must contain at least 32 characters in production")

app = FastAPI(title="Hogwarts Simulator API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(security_settings.cors_allowed_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Character-ID"],
)
app.include_router(
    create_admin_router(
        settings=admin_settings,
        repository=model_repository,
        compatible_client=compatible_client,
        allowed_origins=security_settings.cors_allowed_origins,
    )
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

class ContentReportRequest(BaseModel):
    character_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")
    log_id: int = Field(gt=0)
    request_id: str | None = Field(default=None, min_length=8, max_length=64)
    category: Literal["unsafe", "minor_safety", "privacy", "copyright", "other"]
    note: str = Field(default="", max_length=500)

class ContentReportResponse(BaseModel):
    report_id: str
    status: str

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


@app.middleware("http")
async def observe_http_requests(request: Request, call_next):
    request_id = new_request_id(request.headers.get("x-request-id"))
    context_token = request_id_context.set(request_id)
    started_at = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
        duration_seconds = time.perf_counter() - started_at
        metrics.increment(
            "http_requests_total",
            method=request.method,
            path=request.url.path,
            status=str(status_code),
        )
        metrics.observe(
            "http_request_duration_seconds",
            duration_seconds,
            method=request.method,
            path=request.url.path,
        )
        character_id = request.headers.get("x-character-id")
        log_event(
            "http_request",
            method=request.method,
            path=request.url.path,
            status=status_code,
            duration_ms=round(duration_seconds * 1000, 2),
            character_id=character_id if character_id and len(character_id) <= 64 else None,
        )
        request_id_context.reset(context_token)


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


@dataclass(frozen=True)
class AIRequestReservation:
    budget_reservation: Any
    resolved_model: ResolvedModel
    started_at: float
    request_id: str


def reserve_ai_budget(
    session_id: str,
    input_characters: int,
    expected_output_characters: int,
) -> AIRequestReservation:
    resolved_model = LLMFactory.describe_active()
    estimated_cost = estimate_token_cost(
        input_characters,
        expected_output_characters,
        cost_settings,
    )
    try:
        budget_reservation = budget_tracker.reserve(session_id, estimated_cost)
    except SessionBudgetExceeded as exc:
        metrics.increment("ai_budget_rejections_total", model=resolved_model.model)
        raise HTTPException(status_code=429, detail="Anonymous session AI budget exhausted") from exc
    return AIRequestReservation(
        budget_reservation=budget_reservation,
        resolved_model=resolved_model,
        started_at=time.perf_counter(),
        request_id=request_id_context.get(),
    )


def settle_ai_budget(
    reservation: AIRequestReservation,
    endpoint: str,
    input_characters: int,
    output_characters: int | None,
    outcome: str,
) -> None:
    actual_cost = None
    if output_characters is not None:
        actual_cost = estimate_token_cost(input_characters, output_characters, cost_settings)
    session_total = budget_tracker.settle(reservation.budget_reservation, actual_cost)
    charged_cost = (
        reservation.budget_reservation.amount_usd if actual_cost is None else actual_cost
    )
    resolved = reservation.resolved_model
    metrics.increment(
        "ai_requests_total",
        endpoint=endpoint,
        model=resolved.model,
        outcome=outcome,
    )
    metrics.increment(
        "ai_estimated_cost_usd_total",
        charged_cost,
        endpoint=endpoint,
        model=resolved.model,
    )
    log_event(
        "ai_request",
        endpoint=endpoint,
        provider=resolved.provider_name,
        model=resolved.model,
        outcome=outcome,
        estimated_cost_usd=round(charged_cost, 6),
        session_estimated_cost_usd=round(session_total, 6),
    )
    try:
        model_repository.record_usage(
            UsageRecord(
                endpoint=endpoint,
                provider_id=resolved.provider_id,
                provider_name=resolved.provider_name,
                model=resolved.model,
                outcome=outcome,
                latency_ms=max(
                    0, round((time.perf_counter() - reservation.started_at) * 1000)
                ),
                input_tokens=estimate_tokens(input_characters),
                output_tokens=estimate_tokens(output_characters or 0),
                request_id=reservation.request_id,
            )
        )
    except Exception:
        log_event("usage_record_failed", endpoint=endpoint, model=resolved.model)


def require_safe_content(text: str) -> None:
    decision = inspect_content(text)
    if not decision.allowed:
        metrics.increment("content_safety_blocks_total", category=decision.category, stage="input")
        log_event("content_safety_block", category=decision.category, stage="input")
        raise HTTPException(
            status_code=422,
            detail={"code": "content_blocked", "category": decision.category, "message": decision.user_message},
        )


def moderate_generated_content(text: str) -> tuple[str, str]:
    decision = inspect_content(text, is_output=True)
    if decision.allowed:
        return text, "success"
    metrics.increment("content_safety_blocks_total", category=decision.category, stage="output")
    log_event("content_safety_block", category=decision.category, stage="output")
    return f"# 内容已拦截\n\n{decision.user_message}\n\n你可以调整行动后重试。", "blocked"

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
    resolved = LLMFactory.describe_active()
    return {
        "status": "ok",
        "timestamp": time.time(),
        "version": app_version,
        "uptime_seconds": round(time.time() - app_started_at, 1),
        "model_provider": resolved.provider_name,
        "model": resolved.model,
        "model_source": resolved.source,
        "prompt_version": prompt_service.prompt_version,
        "rules_version": prompt_service.rules_version,
        "state_schema_version": prompt_service.state_schema_version,
    }


@app.get("/metrics", response_class=PlainTextResponse)
async def prometheus_metrics(request: Request):
    authorization = request.headers.get("authorization", "")
    if authorization != f"Bearer {metrics_token}":
        raise HTTPException(status_code=401, detail="Invalid metrics token")
    return metrics.render_prometheus()

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
    require_safe_content(" ".join(str(value) for value in profile.values()))
    input_characters = len(json.dumps(profile, ensure_ascii=False))
    reservation = reserve_ai_budget(_session_id, input_characters, 8000)
    model_token = bind_runtime_model(reservation.resolved_model)
    try:
        narrative = await generate_prologue(profile, request.profile.self_description)
    except Exception:
        settle_ai_budget(reservation, "story_start", input_characters, None, "error")
        raise
    finally:
        reset_runtime_model(model_token)
    narrative, outcome = moderate_generated_content(narrative)
    settle_ai_budget(reservation, "story_start", input_characters, len(narrative), outcome)
    return {
        "narrative": narrative,
        "metadata": prompt_service.metadata()
        | {
            "model": reservation.resolved_model.model,
            "provider": reservation.resolved_model.provider_name,
            "request_id": request_id_context.get(),
        },
    }

@app.post("/api/chapter/title", response_model=ChapterTitleResponse)
async def chapter_title(request: ChapterTitleRequest, _session_id: str = Depends(require_api_access)):
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import StrOutputParser

    require_safe_content(request.user_input)
    prompt = ChatPromptTemplate.from_template(prompt_service.get_template("chapter_title"))
    input_characters = len(request.user_input) + len(request.context_summary)
    reservation = reserve_ai_budget(_session_id, input_characters, 200)
    model_token = bind_runtime_model(reservation.resolved_model)
    try:
        chain = prompt | LLMFactory.create_llm() | StrOutputParser()
        raw = await chain.ainvoke({
            "user_input": request.user_input,
            "context_summary": request.context_summary
        })
    except Exception:
        settle_ai_budget(reservation, "chapter_title", input_characters, None, "error")
        raise
    finally:
        reset_runtime_model(model_token)
    settle_ai_budget(reservation, "chapter_title", input_characters, len(raw), "success")
    return {"title": _normalize_chapter_title(raw)}

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest, _session_id: str = Depends(require_api_access)):
    context_chars = len(json.dumps(request.context, ensure_ascii=False, separators=(",", ":")))
    if context_chars > security_settings.max_context_chars:
        raise HTTPException(status_code=413, detail="Story context too large")
    require_safe_content(request.user_input)
    try:
        validate_status_snapshot(request.context.get("status_snapshot"))
    except RuleContextError as exc:
        raise HTTPException(status_code=422, detail={"code": "invalid_game_state", "message": str(exc)}) from exc
    input_characters = len(request.user_input) + context_chars
    reservation = reserve_ai_budget(_session_id, input_characters, 30000)

    # Streaming response from the Agent Workflow
    async def event_generator():
        task = None
        settled = False
        model_token = bind_runtime_model(reservation.resolved_model)

        def settle(outcome: str, output_characters: int | None = None):
            nonlocal settled
            if settled:
                return
            settle_ai_budget(
                reservation,
                "chat",
                input_characters,
                output_characters,
                outcome,
            )
            settled = True

        try:
            from app.services.agent_workflow import agent_workflow
            
            # Initial state
            initial_state = {
                "user_input": request.user_input,
                "context": request.context,
                **prompt_service.metadata(),
                "orchestration_trace": [],
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
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass
                    settle("timeout")
                    yield "event: error\ndata: timeout\n\n"
                    yield "event: close\n\n"
                    return
            final_state = await task
            narrative = final_state.get("narrative", "")
            narrative, outcome = moderate_generated_content(narrative)
            settle(outcome, len(narrative))

            metadata = {
                **prompt_service.metadata(),
                "model": reservation.resolved_model.model,
                "provider": reservation.resolved_model.provider_name,
                "orchestration_trace": final_state.get("orchestration_trace", []),
                "request_id": request_id_context.get(),
            }
            yield f"event: metadata\ndata: {json.dumps(metadata, ensure_ascii=False)}\n\n"
            
            # Simulate streaming the result
            chunk_size = 20
            for i in range(0, len(narrative), chunk_size):
                chunk = narrative[i:i+chunk_size]
                yield f"data: {chunk}\n\n"
                await asyncio.sleep(0.02) # Typing effect
                
            yield "event: close\n\n"
            
        except asyncio.CancelledError:
            if task and not task.done():
                task.cancel()
            settle("cancelled")
            raise
        except Exception:
            settle("error")
            yield "event: error\ndata: generation_failed\n\n"
            yield "event: close\n\n"
        finally:
            reset_runtime_model(model_token)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/report", response_model=ContentReportResponse, status_code=202)
async def report_content(report: ContentReportRequest, _session_id: str = Depends(require_api_access)):
    import uuid

    report_id = f"report-{uuid.uuid4().hex[:16]}"
    metrics.increment("content_reports_total", category=report.category)
    log_event(
        "content_report_submitted",
        report_id=report_id,
        category=report.category,
        character_id=report.character_id,
        log_id=report.log_id,
        generation_request_id=report.request_id,
        has_note=bool(report.note.strip()),
    )
    return ContentReportResponse(report_id=report_id, status="accepted")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "3000")))
