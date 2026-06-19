"""File reading, writing, listing, searching, and project-tree helpers."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional

import pathspec

from app.config import get_settings
from app.safety import (
    is_binary_file,
    is_path_safe,
    load_gitignore,
    load_pixignore,
    should_ignore,
)


# ── Ignore-spec loader ─────────────────────────────────────────────────────

def _load_ignore_specs(workspace_root: str) -> tuple[pathspec.PathSpec, pathspec.PathSpec]:
    """Return ``(gitignore_spec, pixignore_spec)`` for *workspace_root*."""
    return load_gitignore(workspace_root), load_pixignore(workspace_root)


# ── File read / write ──────────────────────────────────────────────────────

def read_file(path: str, workspace_root: str) -> str:
    """Read a file after safety, size, and binary checks.

    Raises :class:`ValueError` on violations, :class:`FileNotFoundError` when missing.
    """
    settings = get_settings()

    if not is_path_safe(path, workspace_root):
        raise ValueError(f"Path is outside the workspace or blocked: {path}")

    resolved = Path(path).resolve()
    if not resolved.is_file():
        raise FileNotFoundError(f"File not found: {path}")

    size = resolved.stat().st_size
    if size > settings.MAX_FILE_SIZE:
        raise ValueError(
            f"File exceeds max size ({size} > {settings.MAX_FILE_SIZE}): {path}"
        )

    if is_binary_file(str(resolved)):
        raise ValueError(f"Cannot read binary file: {path}")

    return resolved.read_text(encoding="utf-8", errors="replace")


def write_file(path: str, content: str, workspace_root: str) -> bool:
    """Write *content* to *path* after safety check, creating a backup first.

    Returns *True* on success.
    """
    if not is_path_safe(path, workspace_root):
        raise ValueError(f"Path is outside the workspace or blocked: {path}")

    resolved = Path(path).resolve()

    # Create backup if file already exists
    if resolved.is_file():
        _create_backup(str(resolved), workspace_root)

    # Ensure parent dirs exist
    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_text(content, encoding="utf-8")
    return True


# ── Listing ────────────────────────────────────────────────────────────────

def list_files(path: str, workspace_root: str) -> list[dict[str, Any]]:
    """Return a flat list of file info dicts under *path*, respecting ignore specs."""
    if not is_path_safe(path, workspace_root):
        raise ValueError(f"Path is outside the workspace or blocked: {path}")

    resolved = Path(path).resolve()
    if not resolved.is_dir():
        raise ValueError(f"Not a directory: {path}")

    git_spec, pix_spec = _load_ignore_specs(workspace_root)
    results: list[dict[str, Any]] = []

    for entry in sorted(resolved.iterdir()):
        if should_ignore(str(entry), workspace_root, git_spec, pix_spec):
            continue
        info: dict[str, Any] = {
            "path": str(entry.relative_to(Path(workspace_root).resolve())).replace("\\", "/"),
            "is_dir": entry.is_dir(),
            "extension": entry.suffix,
        }
        if entry.is_file():
            try:
                stat = entry.stat()
                info["size"] = stat.st_size
                info["last_modified"] = stat.st_mtime
            except OSError:
                info["size"] = 0
                info["last_modified"] = 0.0
        results.append(info)

    return results


# ── Search ─────────────────────────────────────────────────────────────────

def search_files(query: str, workspace_root: str) -> list[dict[str, Any]]:
    """Search file *contents* under *workspace_root* for *query* (case-insensitive).

    Returns list of ``{path, line, snippet}`` matches (capped at 200).
    """
    git_spec, pix_spec = _load_ignore_specs(workspace_root)
    results: list[dict[str, Any]] = []
    ws = Path(workspace_root).resolve()
    query_lower = query.lower()

    for root, dirs, files in os.walk(ws):
        # Prune ignored directories in-place
        dirs[:] = [
            d for d in dirs
            if not should_ignore(str(Path(root) / d), workspace_root, git_spec, pix_spec)
        ]
        for fname in files:
            fpath = Path(root) / fname
            if should_ignore(str(fpath), workspace_root, git_spec, pix_spec):
                continue
            if is_binary_file(str(fpath)):
                continue
            try:
                text = fpath.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            for line_no, line in enumerate(text.splitlines(), start=1):
                if query_lower in line.lower():
                    results.append(
                        {
                            "path": str(fpath.relative_to(ws)).replace("\\", "/"),
                            "line": line_no,
                            "snippet": line.strip()[:200],
                        }
                    )
                    if len(results) >= 200:
                        return results
    return results


# ── Project tree ───────────────────────────────────────────────────────────

def get_project_tree(workspace_root: str, max_depth: int = 4) -> dict[str, Any]:
    """Return a nested dict representing the project directory tree."""
    git_spec, pix_spec = _load_ignore_specs(workspace_root)
    ws = Path(workspace_root).resolve()
    return _build_tree(ws, ws, git_spec, pix_spec, 0, max_depth)


def _build_tree(
    current: Path,
    workspace_root: Path,
    git_spec: pathspec.PathSpec,
    pix_spec: pathspec.PathSpec,
    depth: int,
    max_depth: int,
) -> dict[str, Any]:
    node: dict[str, Any] = {
        "name": current.name or str(current),
        "path": str(current.relative_to(workspace_root)).replace("\\", "/") if current != workspace_root else ".",
        "type": "directory",
        "children": [],
    }

    if depth >= max_depth:
        return node

    try:
        entries = sorted(current.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower()))
    except PermissionError:
        return node

    for entry in entries:
        if should_ignore(str(entry), str(workspace_root), git_spec, pix_spec):
            continue

        if entry.is_dir():
            child = _build_tree(entry, workspace_root, git_spec, pix_spec, depth + 1, max_depth)
            node["children"].append(child)
        else:
            try:
                size = entry.stat().st_size
            except OSError:
                size = 0
            node["children"].append(
                {
                    "name": entry.name,
                    "path": str(entry.relative_to(workspace_root)).replace("\\", "/"),
                    "type": "file",
                    "extension": entry.suffix,
                    "size": size,
                }
            )

    return node


# ── Internal helpers ───────────────────────────────────────────────────────

def _create_backup(filepath: str, workspace_root: str) -> Optional[str]:
    """Copy *filepath* into ``.pixagent/backups/`` inside the workspace."""
    try:
        src = Path(filepath).resolve()
        ws = Path(workspace_root).resolve()
        rel = src.relative_to(ws)
        backup_dir = ws / ".pixagent" / "backups" / rel.parent
        backup_dir.mkdir(parents=True, exist_ok=True)
        dest = backup_dir / rel.name
        dest.write_bytes(src.read_bytes())
        return str(dest)
    except (OSError, ValueError):
        return None
