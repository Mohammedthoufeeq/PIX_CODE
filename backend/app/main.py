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
import logging
import os
import re
import datetime
from fastapi import Request

# ── Logging setup ────────────────────────────────────────────────────────────

def setup_logging():
    os.makedirs("logs", exist_ok=True)
    log_file = "logs/maintenance.log"
    
    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    
    file_handler = logging.FileHandler(log_file, encoding="utf-8")
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.DEBUG)
    
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    
    # Remove existing handlers to avoid duplicates
    for h in root_logger.handlers[:]:
        root_logger.removeHandler(h)
    root_logger.addHandler(file_handler)
    
    # Console output
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.setLevel(logging.INFO)
    root_logger.addHandler(console_handler)
    
    # Force propagation on loggers
    for logger_name in ("uvicorn", "uvicorn.access", "uvicorn.error", "app"):
        l = logging.getLogger(logger_name)
        l.handlers = []
        l.propagate = True

setup_logging()
logger = logging.getLogger("app.main")

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

# ── Middleware for Request & Error Logging ─────────────────────────────────

@app.middleware("http")
async def log_requests(request: Request, call_next):
    client_ip = request.client.host if request.client else "unknown"
    start_time = time.time()
    
    # Skip logging the logs endpoint itself to avoid circular spam loops
    is_polling_logs = request.url.path == "/api/logs"
    
    try:
        response = await call_next(request)
        duration = int((time.time() - start_time) * 1000)
        
        if not is_polling_logs:
            logger.info(
                f"{client_ip} - \"{request.method} {request.url.path}\" "
                f"{response.status_code} - {duration}ms"
            )
        return response
    except Exception as exc:
        duration = int((time.time() - start_time) * 1000)
        import traceback
        tb = traceback.format_exc()
        logger.error(
            f"{client_ip} - \"{request.method} {request.url.path}\" 500 "
            f"- {duration}ms - Exception: {exc}\n{tb}"
        )
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal Server Error: {exc}"}
        )

# ── Server Logs Endpoint ────────────────────────────────────────────────────

@app.get("/api/logs")
async def get_server_logs(limit: int = 150) -> dict:
    """Return the last `limit` log entries from the maintenance.log file."""
    log_file = "logs/maintenance.log"
    if not os.path.exists(log_file):
        return {"logs": []}
        
    pattern = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[([A-Z]+)\] \[([^\]]+)\] (.*)$")
    entries = []
    
    try:
        with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
            
        last_lines = lines[-limit:]
        
        for line in last_lines:
            line = line.strip()
            if not line:
                continue
                
            match = pattern.match(line)
            if match:
                timestamp_str, level, logger_name, message = match.groups()
                try:
                    dt = datetime.datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
                    timestamp = int(dt.timestamp() * 1000)
                except Exception:
                    timestamp = int(time.time() * 1000)
                    
                entries.append({
                    "id": f"srv-{timestamp}-{hash(line) % 100000}",
                    "timestamp": timestamp,
                    "type": "server",
                    "level": level,
                    "logger": logger_name,
                    "message": message
                })
            else:
                # If a line doesn't match (e.g. multiline stacktrace), append it to the previous entry's message
                if entries:
                    entries[-1]["message"] += "\n" + line
    except Exception as e:
        return {"error": str(e), "logs": []}
        
    return {"logs": entries}

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
