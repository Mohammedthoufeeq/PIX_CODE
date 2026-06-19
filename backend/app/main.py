"""FastAPI application entry-point.

- CORS for localhost:5173 (Vite dev server)
- All API routers mounted
- OpenAI-compatible ``/v1/chat/completions`` gateway
- Health check at ``/health``
"""

from __future__ import annotations

import time
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.models import (
    ChatCompletionChoice,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatMessage,
    UsageInfo,
)
from app.pix_gateway import call_pix, convert_messages_to_pix_prompt
from app.routes import agent, chat, files, git, projects, settings

# ── Create app ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="PIX Code Agent",
    description="Backend for the PIX-powered coding agent",
    version="0.1.0",
)

# ── CORS ───────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Mount routers ──────────────────────────────────────────────────────────

app.include_router(projects.router)
app.include_router(files.router)
app.include_router(chat.router)
app.include_router(agent.router)
app.include_router(git.router)
app.include_router(settings.router)

# ── Health check ───────────────────────────────────────────────────────────


@app.get("/health")
async def health_check() -> dict:
    """Simple liveness probe."""
    cfg = get_settings()
    return {
        "status": "ok",
        "model": cfg.DEFAULT_PIX_MODEL,
        "api_base": cfg.PIX_API_BASE,
    }


# ── OpenAI-compatible /v1/chat/completions ─────────────────────────────────


@app.post("/v1/chat/completions", response_model=ChatCompletionResponse)
async def openai_chat_completions(req: ChatCompletionRequest) -> ChatCompletionResponse:
    """Accept an OpenAI-style chat completion request, proxy through PIX,
    and return an OpenAI-shaped response.
    """
    cfg = get_settings()
    model = req.model or cfg.DEFAULT_PIX_MODEL
    api_key = cfg.PIX_API_KEY
    api_base = cfg.PIX_API_BASE

    if not api_key:
        raise HTTPException(status_code=500, detail="PIX_API_KEY is not configured.")

    # Convert messages → PIX prompt
    prompt = convert_messages_to_pix_prompt(req.messages)

    # Call PIX
    try:
        response_text = await call_pix(prompt, model, api_key, api_base)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"PIX API error: {exc}")

    # Build OpenAI-shaped response
    completion_id = f"pix-chatcmpl-{uuid.uuid4().hex[:12]}"
    created = int(time.time())

    choice = ChatCompletionChoice(
        index=0,
        message=ChatMessage(role="assistant", content=response_text),
        finish_reason="stop",
    )

    # Rough token estimate (4 chars ≈ 1 token)
    prompt_tokens = max(1, len(prompt) // 4)
    completion_tokens = max(1, len(response_text) // 4)

    return ChatCompletionResponse(
        id=completion_id,
        object="chat.completion",
        created=created,
        model=model,
        choices=[choice],
        usage=UsageInfo(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
        ),
    )

# ── Motivational Quote cache & endpoint ───────────────────────────────────

_cached_quote: str | None = None
_cached_quote_time: float = 0.0

@app.get("/api/quote")
async def get_motivational_quote() -> dict:
    """Return a motivational quote, cached for 1 hour, generated via PIX LLM."""
    global _cached_quote, _cached_quote_time
    import random
    
    current_time = time.time()
    if _cached_quote and (current_time - _cached_quote_time < 3600.0):
        return {"quote": _cached_quote}

    fallback_quotes = [
        "First, solve the problem. Then, write the code.",
        "Code is like humor. When you have to explain it, it's bad.",
        "Make it work, make it right, make it fast.",
        "Simplicity is the soul of efficiency.",
        "Before software can be reusable it first has to be usable.",
        "The best error message is the one that never shows up.",
        "Any fool can write code that a computer can understand. Good programmers write code that humans can understand.",
        "Software and cathedrals are much the same – first we build them, then we pray.",
        "Experience is the name everyone gives to their mistakes.",
        "Programming is not about what you know; it's about what you can figure out."
    ]

    cfg = get_settings()
    api_key = cfg.PIX_API_KEY
    api_base = cfg.PIX_API_BASE
    model = cfg.DEFAULT_PIX_MODEL

    if not api_key:
        _cached_quote = random.choice(fallback_quotes)
        _cached_quote_time = current_time
        return {"quote": _cached_quote}

    prompt = (
        "[INSTRUCTION]\n"
        "Generate a single, short, one-sentence motivational quote for a software developer/programmer. "
        "Do not include quotes, author name, or any intro text. Keep it under 15 words."
    )

    try:
        quote = await call_pix(prompt, model, api_key, api_base)
        quote = quote.strip().strip('"').strip("'").strip()
        if not quote or "[PIX API Error" in quote or "[PIX API Connection Error" in quote:
            raise Exception("Invalid quote generated")
        _cached_quote = quote
    except Exception:
        _cached_quote = random.choice(fallback_quotes)

    _cached_quote_time = current_time
    return {"quote": _cached_quote}


# ── Startup banner ─────────────────────────────────────────────────────────


@app.on_event("startup")
async def _startup_banner() -> None:
    cfg = get_settings()
    print(
        "\n"
        "╔══════════════════════════════════════════════╗\n"
        "║           PIX Code Agent – Backend           ║\n"
        "╠══════════════════════════════════════════════╣\n"
        f"║  Host   : {cfg.BACKEND_HOST:<34}║\n"
        f"║  Port   : {cfg.BACKEND_PORT:<34}║\n"
        f"║  Model  : {cfg.DEFAULT_PIX_MODEL:<34}║\n"
        f"║  API    : {cfg.PIX_API_BASE[:34]:<34}║\n"
        "╚══════════════════════════════════════════════╝\n"
    )


# ── CLI runner ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    cfg = get_settings()
    uvicorn.run(
        "app.main:app",
        host=cfg.BACKEND_HOST,
        port=cfg.BACKEND_PORT,
        reload=True,
    )
