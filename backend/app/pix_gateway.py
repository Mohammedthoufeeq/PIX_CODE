"""PIX API gateway – message conversion, response parsing, and API call."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.models import ChatMessage

logger = logging.getLogger(__name__)

# ── Message conversion ─────────────────────────────────────────────────────


def convert_messages_to_pix_prompt(messages: list[ChatMessage]) -> str:
    """Convert OpenAI-style chat messages into a PIX-style prompt string.

    Groups consecutive messages of the same role under labelled sections:

    .. code-block:: text

        [SYSTEM]
        <system messages>

        [USER]
        <user messages>

        [ASSISTANT]
        <assistant messages>

        [TOOL_RESULT]
        <tool results if any>

        [INSTRUCTION]
        Return the answer in the required format.
    """
    if not messages:
        return ""

    role_map: dict[str, str] = {
        "system": "SYSTEM",
        "user": "USER",
        "assistant": "ASSISTANT",
        "tool": "TOOL_RESULT",
        "function": "TOOL_RESULT",
    }

    sections: list[str] = []
    current_role: str | None = None
    current_lines: list[str] = []

    for msg in messages:
        label = role_map.get(msg.role, msg.role.upper())
        if label != current_role:
            # Flush previous section
            if current_role is not None and current_lines:
                sections.append(f"[{current_role}]\n" + "\n".join(current_lines))
            current_role = label
            current_lines = [msg.content]
        else:
            current_lines.append(msg.content)

    # Flush last section
    if current_role is not None and current_lines:
        sections.append(f"[{current_role}]\n" + "\n".join(current_lines))

    # Always end with an instruction tag
    sections.append("[INSTRUCTION]\nReturn the answer in the required format.")

    return "\n\n".join(sections)


# ── Response parsing ───────────────────────────────────────────────────────


def parse_pix_response(response_data: Any) -> str:
    """Defensively extract text content from a PIX API response.

    Tries multiple common field names to handle varying response shapes.
    """
    if isinstance(response_data, str):
        return response_data

    if isinstance(response_data, dict):
        # Direct top-level fields
        for key in ("response", "content", "text", "message", "output"):
            val = response_data.get(key)
            if val and isinstance(val, str):
                return val

        # Nested data.* fields
        data_obj = response_data.get("data")
        if isinstance(data_obj, dict):
            for key in ("response", "content", "text", "message", "output"):
                val = data_obj.get(key)
                if val and isinstance(val, str):
                    return val

        # OpenAI-style choices
        choices = response_data.get("choices")
        if isinstance(choices, list) and choices:
            first = choices[0]
            if isinstance(first, dict):
                msg = first.get("message")
                if isinstance(msg, dict):
                    c = msg.get("content")
                    if c and isinstance(c, str):
                        return c
                # delta for streaming
                delta = first.get("delta")
                if isinstance(delta, dict):
                    c = delta.get("content")
                    if c and isinstance(c, str):
                        return c

        # Fallback – stringify everything
        return str(response_data)

    # Lists, numbers, etc.
    return str(response_data)


# ── Streaming API call ────────────────────────────────────────────────────


async def stream_pix(
    prompt: str,
    model: str,
    api_key: str,
    api_base: str,
):
    """Stream text chunks from the PIX endpoint via SSE.

    Yields str chunks as they arrive.  Falls back to a single chunk when the
    endpoint does not advertise ``text/event-stream``.
    """
    import json as _json

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {"model": model, "prompt": prompt, "stream": True}

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", api_base, json=payload, headers=headers) as resp:
                resp.raise_for_status()
                content_type = resp.headers.get("content-type", "")

                if "text/event-stream" not in content_type:
                    # API does not support streaming — read full body and yield once
                    body = await resp.aread()
                    try:
                        yield parse_pix_response(_json.loads(body))
                    except Exception:
                        yield body.decode("utf-8", errors="replace")
                    return

                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = _json.loads(data_str)
                        # Anthropic SSE format
                        if chunk.get("type") == "content_block_delta":
                            text = chunk.get("delta", {}).get("text", "")
                            if text:
                                yield text
                        # OpenAI SSE format
                        elif "choices" in chunk:
                            delta = chunk["choices"][0].get("delta", {})
                            text = delta.get("content", "")
                            if text:
                                yield text
                        # Simple text fields
                        else:
                            for key in ("text", "content", "response", "output"):
                                val = chunk.get(key, "")
                                if val and isinstance(val, str):
                                    yield val
                                    break
                    except (_json.JSONDecodeError, KeyError, IndexError):
                        if data_str:
                            yield data_str

    except httpx.HTTPStatusError as exc:
        error_body = ""
        try:
            error_body = exc.response.text[:500]
        except Exception:
            pass
        logger.error("PIX stream HTTP error %s: %s", exc.response.status_code, error_body)
        yield f"[PIX API Error {exc.response.status_code}] {error_body}"
    except Exception as exc:
        logger.error("PIX stream error: %s", exc)
        yield f"[PIX API Error] {exc}"


# ── Blocking API call ──────────────────────────────────────────────────────


async def call_pix(
    prompt: str,
    model: str,
    api_key: str,
    api_base: str,
    max_tokens: int = 8000,
) -> str:
    """POST to the PIX endpoint and return the parsed text response.

    Sends::

        {
            "model": "<model>",
            "prompt": "<prompt>",
            "max_tokens": <max_tokens>
        }

    with ``Authorization: Bearer <api_key>``.
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "prompt": prompt,
        "max_tokens": max_tokens,
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(api_base, json=payload, headers=headers)
            resp.raise_for_status()

            try:
                data = resp.json()
            except Exception:
                # Treat raw text body as the response
                return resp.text

            return parse_pix_response(data)

    except httpx.HTTPStatusError as exc:
        error_body = ""
        try:
            error_body = exc.response.text[:500]
        except Exception:
            pass
        logger.error("PIX API HTTP error %s: %s", exc.response.status_code, error_body)
        return f"[PIX API Error {exc.response.status_code}] {error_body}"

    except httpx.RequestError as exc:
        logger.error("PIX API request error: %s", exc)
        return f"[PIX API Connection Error] {exc}"

    except Exception as exc:
        logger.error("PIX API unexpected error: %s", exc)
        return f"[PIX API Error] {exc}"
