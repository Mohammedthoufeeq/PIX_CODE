"""Safety guards – path validation, command allow-listing, ignore-file support."""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Optional

import pathspec

# ── Blocked paths ───────────────────────────────────────────────────────────

BLOCKED_PATHS: list[str] = [
    "~/.ssh",
    "~/.aws",
    "~/.config",
    "/etc",
    "/usr",
    "/bin",
    "C:\\Windows",
    "C:\\Program Files",
]

# Patterns blocked during *reads* (.git/ internals blocked; git CLI is OK)
BLOCKED_PATTERNS: list[str] = [
    ".env",
    "node_modules",
    ".git/",
    ".git",
    ".venv",
    "venv",
    "__pycache__",
]

# ── Dangerous commands ──────────────────────────────────────────────────────

DANGEROUS_COMMANDS: list[str] = [
    "rm -rf",
    "sudo",
    "mkfs",
    "dd",
    "chmod -R",
    "chown -R",
    r"curl.*\|.*sh",
    r"wget.*\|.*sh",
    "del /s",
    "format",
]

# Pre-compile dangerous command patterns
_DANGEROUS_RE: list[re.Pattern[str]] = [
    re.compile(pattern, re.IGNORECASE) for pattern in DANGEROUS_COMMANDS
]

# Binary extensions
_BINARY_EXTENSIONS: set[str] = {
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg",
    ".pdf", ".zip", ".gz", ".tar", ".rar", ".7z",
    ".exe", ".dll", ".so", ".dylib", ".o", ".obj",
    ".woff", ".woff2", ".ttf", ".eot",
    ".mp3", ".mp4", ".avi", ".mov", ".wav",
    ".pyc", ".pyo", ".class", ".jar",
    ".db", ".sqlite", ".sqlite3",
}


# ── Public helpers ──────────────────────────────────────────────────────────

def is_path_safe(path: str, workspace_root: str) -> bool:
    """Return *True* if *path* resolves inside *workspace_root* and is not blocked."""
    try:
        resolved = Path(path).resolve()
        ws_resolved = Path(workspace_root).resolve()

        # Must be inside workspace
        if not str(resolved).startswith(str(ws_resolved)):
            return False

        resolved_str = str(resolved)
        for blocked in BLOCKED_PATHS:
            expanded = str(Path(os.path.expanduser(blocked)).resolve())
            if resolved_str.startswith(expanded):
                return False

        # Check blocked patterns
        rel = str(resolved.relative_to(ws_resolved)).replace("\\", "/")
        for pattern in BLOCKED_PATTERNS:
            if pattern in rel:
                return False

        return True
    except (ValueError, OSError):
        return False


def is_command_safe(command: str) -> tuple[bool, str]:
    """Check *command* against dangerous patterns.

    Returns ``(safe, reason)`` – *reason* is empty when safe.
    """
    for pattern in _DANGEROUS_RE:
        if pattern.search(command):
            return False, f"Command matches dangerous pattern: {pattern.pattern}"
    return True, ""


def is_binary_file(path: str) -> bool:
    """Heuristic check: extension first, then attempt a small read."""
    p = Path(path)
    if p.suffix.lower() in _BINARY_EXTENSIONS:
        return True
    try:
        with open(p, "rb") as fh:
            chunk = fh.read(8192)
            if b"\x00" in chunk:
                return True
    except (OSError, IOError):
        return False
    return False


def load_pixignore(workspace_root: str) -> pathspec.PathSpec:
    """Load a ``.pixignore`` file (gitignore syntax) from *workspace_root*."""
    ignore_file = Path(workspace_root) / ".pixignore"
    patterns: list[str] = []
    if ignore_file.is_file():
        try:
            patterns = ignore_file.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            pass
    return pathspec.PathSpec.from_lines("gitwildmatch", patterns)


def load_gitignore(workspace_root: str) -> pathspec.PathSpec:
    """Load a ``.gitignore`` file (gitignore syntax) from *workspace_root*."""
    ignore_file = Path(workspace_root) / ".gitignore"
    patterns: list[str] = []
    if ignore_file.is_file():
        try:
            patterns = ignore_file.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            pass
    return pathspec.PathSpec.from_lines("gitwildmatch", patterns)


def should_ignore(
    path: str,
    workspace_root: str,
    gitignore_spec: Optional[pathspec.PathSpec] = None,
    pixignore_spec: Optional[pathspec.PathSpec] = None,
) -> bool:
    """Return *True* if *path* should be ignored based on ignore specs and blocked patterns."""
    try:
        rel = str(Path(path).relative_to(Path(workspace_root))).replace("\\", "/")
    except ValueError:
        return True

    # Blocked patterns
    for pattern in BLOCKED_PATTERNS:
        if pattern in rel:
            return True

    if gitignore_spec and gitignore_spec.match_file(rel):
        return True
    if pixignore_spec and pixignore_spec.match_file(rel):
        return True

    return False
