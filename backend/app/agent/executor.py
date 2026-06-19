"""Executor agent – turns a plan into concrete code changes (unified diffs)."""

from __future__ import annotations

import re
from typing import Optional

from app.agent.prompts import EXECUTOR_SYSTEM_PROMPT, GLOBAL_RULES
from app.llm_client import chat_completion
from app.models import ChatMessage, ContextFile

_REQUIRED_SECTIONS = {"### CHANGES", "### NEW FILES", "### NOTES"}
_REACT_PATTERNS = re.compile(
    r"^(Thought:|Action:|Observation:|TOOL CALL|```)",
    re.MULTILINE,
)


def _sanitize(text: str) -> str:
    """Strip ReAct/tool-call noise that some models emit instead of diffs."""
    lines: list[str] = []
    skip = False
    for line in text.splitlines():
        # Drop Thought / Action / Observation / TOOL CALL blocks
        if re.match(r"^(Thought:|Action:|Observation:|TOOL CALL\s*\()", line):
            skip = True
        elif re.match(r"^(###\s|---\s|@@\s|\+\+\+\s)", line):
            skip = False
        if not skip:
            lines.append(line)
    result = "\n".join(lines).strip()
    # Remove stray ``` fences
    result = re.sub(r"```[a-z]*\n?", "", result)
    return result


def _looks_valid(text: str) -> bool:
    """Return True when the response contains at least one required section."""
    return any(s in text for s in _REQUIRED_SECTIONS)


def _build_messages(
    plan: str, context_files: list[ContextFile]
) -> list[ChatMessage]:
    messages: list[ChatMessage] = []
    system_content = EXECUTOR_SYSTEM_PROMPT + "\n\n" + GLOBAL_RULES
    messages.append(ChatMessage(role="system", content=system_content))

    if context_files:
        parts: list[str] = ["### PROJECT CONTEXT FILES"]
        for cf in context_files:
            header = f"\n--- {cf.path} ---"
            if cf.summary:
                header += f"\n(summary: {cf.summary})"
            parts.append(header)
            parts.append(cf.content if cf.content else "(content not provided)")
        messages.append(ChatMessage(role="user", content="\n".join(parts)))

    messages.append(
        ChatMessage(
            role="user",
            content=(
                f"### APPROVED PLAN\n{plan}\n\n"
                "Execute this plan now. "
                "Output ONLY the ### CHANGES / ### NEW FILES / ### NOTES sections. "
                "Do NOT use tool calls, Thought blocks, or code fences."
            ),
        )
    )
    return messages


async def execute_plan(
    plan: str,
    context_files: list[ContextFile],
    model: Optional[str] = None,
) -> str:
    """Execute a plan and return unified diffs / new-file contents.

    Returns text containing ``### CHANGES``, ``### NEW FILES``,
    and ``### NOTES`` sections. Retries once with a correction message if
    the model returns tool-call/ReAct output instead of diffs.
    """
    messages = _build_messages(plan, context_files)
    raw = await chat_completion(messages, model=model)
    result = _sanitize(raw)

    if _looks_valid(result):
        return result

    # Retry: tell the model exactly what it did wrong
    messages.append(ChatMessage(role="assistant", content=raw))
    messages.append(
        ChatMessage(
            role="user",
            content=(
                "Your previous response used tool-call syntax or was missing the required sections.\n"
                "Do NOT write Thought:, TOOL CALL, write_file(), or any code fences.\n"
                "Reply with ONLY:\n\n"
                "### CHANGES\n"
                "<unified diffs, or empty if none>\n\n"
                "### NEW FILES\n"
                "<new file diffs, or empty if none>\n\n"
                "### NOTES\n"
                "<one or two sentences>"
            ),
        )
    )
    raw2 = await chat_completion(messages, model=model)
    return _sanitize(raw2)
