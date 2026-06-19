"""Agent loop orchestrator – plan / execute / task history management."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from app.agent.executor import execute_plan
from app.agent.planner import create_plan
from app.config import get_settings
from app.models import ContextFile, TaskRecord

# In-memory task history (also persisted)
_task_history: list[TaskRecord] = []
_TASKS_FILE = ".pixagent/tasks.json"


# ── Orchestration ──────────────────────────────────────────────────────────


async def agent_plan(
    prompt: str,
    context_files: list[ContextFile],
    model: Optional[str] = None,
) -> dict[str, Any]:
    """Call the planner and record a task."""
    settings = get_settings()
    effective_model = model or settings.DEFAULT_PIX_MODEL

    plan_text = await create_plan(prompt, context_files, effective_model)

    task = TaskRecord(
        id=str(uuid.uuid4()),
        prompt=prompt,
        model=effective_model,
        plan=plan_text,
        status="planned",
        timestamp=datetime.now(timezone.utc).isoformat(),
        response=plan_text,
    )
    _task_history.append(task)
    _persist_tasks()

    return {
        "task_id": task.id,
        "plan": plan_text,
        "model": effective_model,
        "status": task.status,
    }


async def agent_execute(
    plan: str,
    context_files: list[ContextFile],
    model: Optional[str] = None,
) -> dict[str, Any]:
    """Call the executor and record the result."""
    settings = get_settings()
    effective_model = model or settings.DEFAULT_PIX_MODEL

    changes_text = await execute_plan(plan, context_files, effective_model)

    task = TaskRecord(
        id=str(uuid.uuid4()),
        prompt="(execution of approved plan)",
        model=effective_model,
        plan=plan,
        status="executed",
        timestamp=datetime.now(timezone.utc).isoformat(),
        response=changes_text,
    )
    _task_history.append(task)
    _persist_tasks()

    return {
        "task_id": task.id,
        "changes": changes_text,
        "model": effective_model,
        "status": task.status,
    }


# ── Task persistence ──────────────────────────────────────────────────────


def save_task(task: TaskRecord) -> None:
    """Append *task* to the in-memory history and persist."""
    _task_history.append(task)
    _persist_tasks()


def load_tasks(workspace_root: Optional[str] = None) -> list[TaskRecord]:
    """Load tasks from disk (if *workspace_root* is given) and return the list."""
    if workspace_root:
        tasks_path = Path(workspace_root) / _TASKS_FILE
        if tasks_path.is_file():
            try:
                data = json.loads(tasks_path.read_text(encoding="utf-8"))
                if isinstance(data, list):
                    loaded = [TaskRecord(**item) for item in data]
                    # Merge with in-memory (avoid duplicates by id)
                    existing_ids = {t.id for t in _task_history}
                    for t in loaded:
                        if t.id not in existing_ids:
                            _task_history.append(t)
            except (json.JSONDecodeError, OSError, Exception):
                pass
    return list(_task_history)


def _persist_tasks() -> None:
    """Save all in-memory tasks to disk if a workspace is active."""
    try:
        from app.workspace import workspace_manager

        ws = workspace_manager.current_workspace
        if not ws:
            return
        tasks_path = Path(ws) / _TASKS_FILE
        tasks_path.parent.mkdir(parents=True, exist_ok=True)
        data = [t.model_dump() for t in _task_history]
        tasks_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except Exception:
        pass
