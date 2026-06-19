"""Pydantic request / response models used across the application."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Chat / LLM ──────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: str = "sonnet-4"
    messages: list[ChatMessage] = Field(default_factory=list)
    temperature: float = 0.2
    max_tokens: int = 4000
    stream: bool = False


class ChatCompletionChoice(BaseModel):
    index: int = 0
    message: ChatMessage
    finish_reason: str = "stop"


class UsageInfo(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ChatCompletionResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: list[ChatCompletionChoice] = Field(default_factory=list)
    usage: UsageInfo = Field(default_factory=UsageInfo)


# ── File operations ─────────────────────────────────────────────────────────

class FileReadRequest(BaseModel):
    path: str


class FileWriteRequest(BaseModel):
    path: str
    content: str


class FileSearchRequest(BaseModel):
    query: str
    path: str = ""


# ── Command / shell ─────────────────────────────────────────────────────────

class CommandRequest(BaseModel):
    command: str
    cwd: str = ""
    approved: bool = False


# ── Git ─────────────────────────────────────────────────────────────────────

class GitCommitRequest(BaseModel):
    message: str
    files: Optional[list[str]] = None


# ── Agent ───────────────────────────────────────────────────────────────────

class PlanRequest(BaseModel):
    prompt: str
    context_files: list[str] = Field(default_factory=list)


class ExecuteRequest(BaseModel):
    plan: str
    context_files: list[str] = Field(default_factory=list)


class ApplyDiffRequest(BaseModel):
    diff: str
    file_path: str = ""


class ProjectSelectRequest(BaseModel):
    path: str


class ProjectCreateRequest(BaseModel):
    name: str


# ── Task tracking ──────────────────────────────────────────────────────────

class TaskRecord(BaseModel):
    id: str
    prompt: str
    model: str = ""
    plan: str = ""
    files_changed: list[str] = Field(default_factory=list)
    status: str = "pending"
    timestamp: str = ""
    response: str = ""


# ── Context & indexing ──────────────────────────────────────────────────────

class ContextFile(BaseModel):
    path: str
    content: str = ""
    summary: str = ""


class FileInfo(BaseModel):
    path: str
    extension: str = ""
    size: int = 0
    last_modified: float = 0.0


class CodeSymbol(BaseModel):
    """A named symbol extracted from source code (class, function, method, etc.)."""
    name: str
    kind: str  # 'class' | 'function' | 'method' | 'const' | 'interface' | 'type'
    file_path: str  # workspace-relative path
    line: int
    signature: str = ""  # brief human-readable signature


class ProjectIndex(BaseModel):
    files: list[FileInfo] = Field(default_factory=list)
    symbols: list[CodeSymbol] = Field(default_factory=list)
