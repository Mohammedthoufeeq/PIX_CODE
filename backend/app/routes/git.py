"""Routes for Git operations – status, diff, commit, branch."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.git_tools import git_branch, git_commit, git_diff, git_status
from app.models import GitCommitRequest
from app.workspace import workspace_manager

router = APIRouter(prefix="/api/git", tags=["git"])


@router.get("/status")
async def status() -> dict:
    """Return ``git status --porcelain`` for the workspace."""
    try:
        ws = workspace_manager.get_workspace()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return await git_status(ws)


@router.get("/diff")
async def diff(staged: bool = Query(False)) -> dict:
    """Return ``git diff`` output (optionally staged)."""
    try:
        ws = workspace_manager.get_workspace()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    diff_text = await git_diff(ws, staged=staged)
    return {"diff": diff_text}


@router.post("/commit")
async def commit(req: GitCommitRequest) -> dict:
    """Stage files and commit. Never pushes."""
    try:
        ws = workspace_manager.get_workspace()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Commit message is required.")

    return await git_commit(ws, req.message, req.files)


@router.get("/branch")
async def branch() -> dict:
    """Return the current Git branch name."""
    try:
        ws = workspace_manager.get_workspace()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    name = await git_branch(ws)
    return {"branch": name}
