"""Planner agent – builds an implementation plan from a user prompt and project context."""

from __future__ import annotations

from typing import Optional

from app.agent.prompts import GLOBAL_RULES, PLANNER_SYSTEM_PROMPT
from app.llm_client import chat_completion
from app.models import ChatMessage, ContextFile


async def create_plan(
    prompt: str,
    context_files: list[ContextFile],
    model: Optional[str] = None,
) -> str:
    """Generate an implementation plan without modifying any files.

    Returns the raw plan text produced by the LLM.
    """
    messages: list[ChatMessage] = []

    # System prompt
    system_content = PLANNER_SYSTEM_PROMPT + "\n\n" + GLOBAL_RULES
    messages.append(ChatMessage(role="system", content=system_content))

    # Context files
    if context_files:
        context_parts: list[str] = ["### PROJECT CONTEXT FILES"]
        for cf in context_files:
            header = f"\n--- {cf.path} ---"
            if cf.summary:
                header += f"\n(summary: {cf.summary})"
            context_parts.append(header)
            if cf.content:
                context_parts.append(cf.content)
            else:
                context_parts.append("(content not provided)")
        messages.append(ChatMessage(role="user", content="\n".join(context_parts)))

    # User request
    messages.append(ChatMessage(role="user", content=f"### USER REQUEST\n{prompt}"))

    return await chat_completion(messages, model=model)
