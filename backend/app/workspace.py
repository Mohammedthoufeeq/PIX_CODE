"""Workspace manager – tracks the active project directory and recent history."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional


_RECENT_FILE = Path.home() / ".pixagent" / "recent_projects.json"
_MAX_RECENT = 20


class WorkspaceManager:
    """Singleton-style workspace state holder."""

    def __init__(self) -> None:
        self.current_workspace: Optional[str] = None
        self.recent_projects: list[str] = self._load_recent()

    # ── public API ──────────────────────────────────────────────────────

    def set_workspace(self, path: str) -> bool:
        """Validate and set *path* as the active workspace. Returns *True* on success."""
        if not self.validate_workspace(path):
            return False
        resolved = str(Path(path).resolve())
        self.current_workspace = resolved
        self.add_to_recent(resolved)
        self.setup_workspace_logging(resolved)
        return True

    def setup_workspace_logging(self, ws_path: str) -> None:
        """Setup rotating file logger inside the selected workspace folder."""
        import logging
        from logging.handlers import RotatingFileHandler
        
        log_dir = Path(ws_path) / ".pixagent"
        try:
            log_dir.mkdir(parents=True, exist_ok=True)
            log_file = log_dir / "agent.log"
            
            logger = logging.getLogger()
            # Clean up existing file handlers to prevent duplicate lines
            for h in list(logger.handlers):
                if isinstance(h, RotatingFileHandler):
                    logger.removeHandler(h)
            
            log_format = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
            file_handler = RotatingFileHandler(
                log_file, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
            )
            file_handler.setFormatter(logging.Formatter(log_format))
            logger.addHandler(file_handler)
            logger.setLevel(logging.INFO)
            logger.info(f"--- Workspace Logging Initialized: {ws_path} ---")
        except Exception as e:
            print(f"Failed to setup workspace logging: {e}")

    def get_workspace(self) -> str:
        """Return the current workspace path or raise."""
        if self.current_workspace is None:
            raise ValueError("No workspace is currently selected.")
        return self.current_workspace

    def get_active_workspace(self) -> Optional[str]:
        """Return the current workspace path or None (no exception)."""
        return self.current_workspace

    def add_to_recent(self, path: str) -> None:
        resolved = str(Path(path).resolve())
        if resolved in self.recent_projects:
            self.recent_projects.remove(resolved)
        self.recent_projects.insert(0, resolved)
        self.recent_projects = self.recent_projects[:_MAX_RECENT]
        self._save_recent()

    def get_recent(self) -> list[str]:
        return list(self.recent_projects)

    @staticmethod
    def validate_workspace(path: str) -> bool:
        """Return *True* if *path* exists and is a directory."""
        p = Path(path)
        return p.exists() and p.is_dir()

    # ── persistence helpers ─────────────────────────────────────────────

    @staticmethod
    def _load_recent() -> list[str]:
        if _RECENT_FILE.is_file():
            try:
                data = json.loads(_RECENT_FILE.read_text(encoding="utf-8"))
                if isinstance(data, list):
                    return [str(p) for p in data]
            except (json.JSONDecodeError, OSError):
                pass
        return []

    def _save_recent(self) -> None:
        try:
            _RECENT_FILE.parent.mkdir(parents=True, exist_ok=True)
            _RECENT_FILE.write_text(
                json.dumps(self.recent_projects, indent=2),
                encoding="utf-8",
            )
        except OSError:
            pass


# Module-level singleton
workspace_manager = WorkspaceManager()
