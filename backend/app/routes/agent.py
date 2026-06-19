"""Routes for the agent loop – plan, execute, apply diff, task history."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.agent.loop import agent_execute, agent_plan, load_tasks
from app.bash_tools import run_command
from app.diff_tools import apply_diff, rollback
from app.file_tools import read_file
from app.models import ApplyDiffRequest, ContextFile, ExecuteRequest, PlanRequest, CommandRequest
from app.workspace import workspace_manager

router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.post("/run-command")
async def execute_command(req: CommandRequest) -> dict:
    """Run a shell command inside the active workspace."""
    try:
        ws = workspace_manager.get_workspace()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    result = await run_command(
        command=req.command,
        cwd=req.cwd,
        workspace_root=ws,
        approved=req.approved,
    )
    return result


@router.post("/plan")
async def plan(req: PlanRequest) -> dict:
    """Generate an implementation plan from a user prompt."""
    try:
        ws = workspace_manager.get_workspace()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Build context file objects
    context: list[ContextFile] = []
    for rel_path in req.context_files:
        abs_path = str((Path(ws) / rel_path).resolve())
        try:
            content = read_file(abs_path, ws)
            context.append(ContextFile(path=rel_path, content=content))
        except (FileNotFoundError, ValueError):
            context.append(ContextFile(path=rel_path, content="(could not read)"))

    try:
        result = await agent_plan(req.prompt, context)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Planner error: {exc}")

    return result


@router.post("/execute")
async def execute(req: ExecuteRequest) -> dict:
    """Execute an approved plan and return diffs."""
    try:
        ws = workspace_manager.get_workspace()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    context: list[ContextFile] = []
    for rel_path in req.context_files:
        abs_path = str((Path(ws) / rel_path).resolve())
        try:
            content = read_file(abs_path, ws)
            context.append(ContextFile(path=rel_path, content=content))
        except (FileNotFoundError, ValueError):
            context.append(ContextFile(path=rel_path, content="(could not read)"))

    try:
        result = await agent_execute(req.plan, context)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Executor error: {exc}")

    return result


@router.post("/apply-diff")
async def apply_diff_route(req: ApplyDiffRequest) -> dict:
    """Apply a unified diff to the workspace files."""
    try:
        ws = workspace_manager.get_workspace()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    result = apply_diff(req.diff, ws)
    return result


@router.post("/reject-diff")
async def reject_diff(payload: dict) -> dict:
    """Reject a diff and optionally rollback the file."""
    try:
        ws = workspace_manager.get_workspace()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    file_path = payload.get("file_path", "")
    rolled_back = False
    if file_path:
        abs_path = str((Path(ws) / file_path).resolve())
        rolled_back = rollback(abs_path, ws)

    return {"rejected": True, "rolled_back": rolled_back, "file_path": file_path}


@router.get("/tasks")
async def get_tasks() -> dict:
    """Return the task history."""
    try:
        ws = workspace_manager.get_workspace()
    except ValueError:
        ws = None
    tasks = load_tasks(ws)
    return {"tasks": [t.model_dump() for t in tasks]}
