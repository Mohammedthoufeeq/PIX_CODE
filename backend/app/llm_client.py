"""High-level LLM client that wraps the PIX gateway for convenience."""

from __future__ import annotations

from typing import AsyncGenerator, Optional

from app.config import get_settings
from app.models import ChatMessage
from app.pix_gateway import call_pix, convert_messages_to_pix_prompt, stream_pix


async def stream_chat_completion(
    messages: list[ChatMessage],
    model: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """Stream text chunks from the LLM as an async generator."""
    settings = get_settings()
    effective_model = model or settings.DEFAULT_PIX_MODEL
    prompt = convert_messages_to_pix_prompt(messages)
    async for chunk in stream_pix(prompt, effective_model, settings.PIX_API_KEY, settings.PIX_API_BASE):
        yield chunk


async def chat_completion(
    messages: list[ChatMessage],
    model: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: int = 8000,
) -> str:
    """Send *messages* through the PIX gateway and return the text response."""
    settings = get_settings()
    effective_model = model or settings.DEFAULT_PIX_MODEL
    api_key = settings.PIX_API_KEY
    api_base = settings.PIX_API_BASE

    prompt = convert_messages_to_pix_prompt(messages)
    return await call_pix(prompt, effective_model, api_key, api_base, max_tokens=max_tokens)
