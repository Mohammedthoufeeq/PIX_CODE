"""Routes for runtime settings – read and update model, workspace, etc."""

from __future__ import annotations

from fastapi import APIRouter

from app.config import get_settings
from app.workspace import workspace_manager

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/")
async def get_current_settings() -> dict:
    """Return the current effective settings."""
    settings = get_settings()
    return {
        "model": settings.DEFAULT_PIX_MODEL,
        "workspace": workspace_manager.current_workspace,
        "api_base": settings.PIX_API_BASE,
        "max_file_size": settings.MAX_FILE_SIZE,
        "command_timeout": settings.COMMAND_TIMEOUT,
        "host": settings.BACKEND_HOST,
        "port": settings.BACKEND_PORT,
    }


@router.post("/")
async def update_settings(payload: dict) -> dict:
    """Update runtime settings (model, workspace).

    Environment-backed settings (API key, host, port) are read-only at
    runtime – restart the server to pick up changes.
    """
    settings = get_settings()
    updated: list[str] = []

    if "model" in payload:
        settings.DEFAULT_PIX_MODEL = payload["model"]
        updated.append("model")

    if "workspace" in payload:
        success = workspace_manager.set_workspace(payload["workspace"])
        if success:
            updated.append("workspace")

    return {
        "success": True,
        "updated": updated,
        "model": settings.DEFAULT_PIX_MODEL,
        "workspace": workspace_manager.current_workspace,
    }
