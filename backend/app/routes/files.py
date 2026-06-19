"""Routes for file operations – read, write, search, and context management."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.file_tools import list_files, read_file, search_files, write_file
from app.models import ContextFile, FileSearchRequest, FileWriteRequest
from app.workspace import workspace_manager

router = APIRouter(prefix="/api/files", tags=["files"])

# In-memory context store  {absolute_path: ContextFile}
_context_files: dict[str, ContextFile] = {}


@router.get("/read")
async def read(path: str = Query(..., description="Relative or absolute path")) -> dict:
    """Read a single file from the workspace."""
    try:
        ws = workspace_manager.get_workspace()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Resolve relative paths against workspace
    resolved = str((Path(ws) / path).resolve()) if not Path(path).is_absolute() else path

    try:
        content = read_file(resolved, ws)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=str(exc))

    return {"path": path, "content": content}


@router.post("/write")
async def write(req: FileWriteRequest) -> dict:
    """Write content to a file in the workspace."""
    try:
        ws = workspace_manager.get_workspace()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    resolved = str((Path(ws) / req.path).resolve()) if not Path(req.path).is_absolute() else req.path

    try:
        write_file(resolved, req.content, ws)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=str(exc))

    return {"success": True, "path": req.path}


@router.get("/list")
async def list_dir(path: str = Query("", description="Sub-directory to list")) -> dict:
    """List files in a directory within the workspace."""
    try:
        ws = workspace_manager.get_workspace()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    target = str((Path(ws) / path).resolve()) if path else ws

    try:
        entries = list_files(target, ws)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=str(exc))

    return {"path": path or ".", "entries": entries}


@router.post("/search")
async def search(req: FileSearchRequest) -> dict:
    """Search file contents for a query string."""
    try:
        ws = workspace_manager.get_workspace()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    search_root = ws
    if req.path:
        search_root = str((Path(ws) / req.path).resolve()) if not Path(req.path).is_absolute() else req.path

    results = search_files(req.query, search_root)
    return {"query": req.query, "matches": results, "total": len(results)}


@router.post("/context/add")
async def add_to_context(path: str = Query(...)) -> dict:
    """Add a file to the in-memory context used by the agent."""
    try:
        ws = workspace_manager.get_workspace()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    resolved = str((Path(ws) / path).resolve()) if not Path(path).is_absolute() else path

    try:
        content = read_file(resolved, ws)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    cf = ContextFile(path=path, content=content)
    _context_files[resolved] = cf

    return {"success": True, "path": path, "context_count": len(_context_files)}


@router.post("/context/remove")
async def remove_from_context(path: str = Query(...)) -> dict:
    """Remove a file from the in-memory context."""
    try:
        ws = workspace_manager.get_workspace()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    resolved = str((Path(ws) / path).resolve()) if not Path(path).is_absolute() else path

    removed = _context_files.pop(resolved, None)
    return {
        "success": removed is not None,
        "path": path,
        "context_count": len(_context_files),
    }


@router.get("/context")
async def get_context() -> dict:
    """Return the current context files."""
    return {
        "context_files": [
            {"path": cf.path, "summary": cf.summary, "size": len(cf.content)}
            for cf in _context_files.values()
        ],
        "total": len(_context_files),
    }


def get_current_context() -> list[ContextFile]:
    """Helper used by other modules to access the context store."""
    return list(_context_files.values())


@router.post("/create")
async def create_path(req: dict) -> dict:
    """Create a new file or directory inside the workspace."""
    try:
        ws = workspace_manager.get_workspace()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    path = req.get("path", "").strip()
    is_dir: bool = bool(req.get("is_dir", False))

    if not path:
        raise HTTPException(status_code=400, detail="path is required")

    resolved = str((Path(ws) / path).resolve()) if not Path(path).is_absolute() else path
    if not resolved.startswith(ws):
        raise HTTPException(status_code=403, detail="Path escapes workspace")
    if Path(resolved).exists():
        raise HTTPException(status_code=409, detail="Already exists")

    try:
        if is_dir:
            Path(resolved).mkdir(parents=True)
        else:
            Path(resolved).parent.mkdir(parents=True, exist_ok=True)
            Path(resolved).touch()
        return {"success": True, "path": path}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/delete")
async def delete_path(path: str = Query(...)) -> dict:
    """Delete a file or directory from the workspace."""
    import shutil

    try:
        ws = workspace_manager.get_workspace()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    resolved = str((Path(ws) / path).resolve()) if not Path(path).is_absolute() else path
    if not resolved.startswith(ws):
        raise HTTPException(status_code=403, detail="Path escapes workspace")

    target = Path(resolved)
    if not target.exists():
        raise HTTPException(status_code=404, detail="Not found")

    try:
        if target.is_dir():
            shutil.rmtree(resolved)
        else:
            target.unlink()
        return {"success": True, "path": path}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/rename")
async def rename_path(req: dict) -> dict:
    """Rename or move a file/directory within the workspace."""
    try:
        ws = workspace_manager.get_workspace()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    old_path = req.get("old_path", "").strip()
    new_path = req.get("new_path", "").strip()
    if not old_path or not new_path:
        raise HTTPException(status_code=400, detail="old_path and new_path required")

    old_res = str((Path(ws) / old_path).resolve()) if not Path(old_path).is_absolute() else old_path
    new_res = str((Path(ws) / new_path).resolve()) if not Path(new_path).is_absolute() else new_path

    for p in (old_res, new_res):
        if not p.startswith(ws):
            raise HTTPException(status_code=403, detail="Path escapes workspace")

    if not Path(old_res).exists():
        raise HTTPException(status_code=404, detail="Source not found")
    if Path(new_res).exists():
        raise HTTPException(status_code=409, detail="Destination already exists")

    try:
        Path(new_res).parent.mkdir(parents=True, exist_ok=True)
        Path(old_res).rename(new_res)
        return {"success": True, "old_path": old_path, "new_path": new_path}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
