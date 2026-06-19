"""Unified-diff generation, parsing, application, backup, and rollback."""

from __future__ import annotations

import difflib
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class DiffHunk:
    """A single hunk inside a unified diff."""
    src_start: int = 0
    src_count: int = 0
    dst_start: int = 0
    dst_count: int = 0
    lines: list[str] = field(default_factory=list)


# ── Diff generation ────────────────────────────────────────────────────────

def generate_diff(original: str, modified: str, filepath: str) -> str:
    """Return a unified diff between *original* and *modified* for *filepath*."""
    orig_lines = original.splitlines(keepends=True)
    mod_lines = modified.splitlines(keepends=True)
    diff = difflib.unified_diff(
        orig_lines,
        mod_lines,
        fromfile=f"a/{filepath}",
        tofile=f"b/{filepath}",
        lineterm="",
    )
    return "".join(diff)


# ── Diff parsing ───────────────────────────────────────────────────────────

def parse_unified_diff(diff_text: str) -> list[DiffHunk]:
    """Parse a unified diff string into a list of :class:`DiffHunk` objects."""
    hunks: list[DiffHunk] = []
    current_hunk: DiffHunk | None = None

    for line in diff_text.splitlines():
        if line.startswith("@@"):
            current_hunk = _parse_hunk_header(line)
            hunks.append(current_hunk)
        elif current_hunk is not None:
            if line.startswith("---") or line.startswith("+++"):
                continue
            current_hunk.lines.append(line)

    return hunks


def _parse_hunk_header(header: str) -> DiffHunk:
    """Parse ``@@ -a,b +c,d @@`` into a :class:`DiffHunk`."""
    hunk = DiffHunk()
    try:
        parts = header.split("@@")
        if len(parts) >= 2:
            ranges = parts[1].strip()
            src_part, dst_part = ranges.split(" ")
            src_vals = src_part.lstrip("-").split(",")
            hunk.src_start = int(src_vals[0])
            hunk.src_count = int(src_vals[1]) if len(src_vals) > 1 else 1
            dst_vals = dst_part.lstrip("+").split(",")
            hunk.dst_start = int(dst_vals[0])
            hunk.dst_count = int(dst_vals[1]) if len(dst_vals) > 1 else 1
    except (ValueError, IndexError):
        pass
    return hunk


# ── Diff application ──────────────────────────────────────────────────────

def apply_diff(diff_text: str, workspace_root: str) -> dict[str, Any]:
    """Apply a unified diff to files relative to *workspace_root*.

    Creates backups before modification.
    Returns ``{success, files_changed, errors}``.
    """
    ws = Path(workspace_root).resolve()
    files_changed: list[str] = []
    errors: list[str] = []

    # Group diff blocks by file
    current_file: str | None = None
    current_diff_lines: list[str] = []
    file_diffs: list[tuple[str, str, list[str]]] = []  # (src_path, dst_path, lines)
    src_path = ""
    dst_path = ""

    for line in diff_text.splitlines():
        if line.startswith("--- "):
            src_path = line[4:].strip()
            if src_path.startswith("a/"):
                src_path = src_path[2:]
        elif line.startswith("+++ "):
            dst_path = line[4:].strip()
            if dst_path.startswith("b/"):
                dst_path = dst_path[2:]
            if current_file and current_diff_lines:
                file_diffs.append((current_file, current_file, list(current_diff_lines)))
            current_file = dst_path
            current_diff_lines = []
        elif line.startswith("@@") or line.startswith("+") or line.startswith("-") or line.startswith(" "):
            current_diff_lines.append(line)

    if current_file and current_diff_lines:
        file_diffs.append((src_path, current_file, list(current_diff_lines)))

    for src, dst, lines in file_diffs:
        target = ws / dst
        try:
            # New file
            if src == "/dev/null":
                target.parent.mkdir(parents=True, exist_ok=True)
                content_lines = [l[1:] for l in lines if l.startswith("+") and not l.startswith("+++")]
                target.write_text("\n".join(content_lines) + "\n", encoding="utf-8")
                files_changed.append(dst)
                continue

            if not target.is_file():
                errors.append(f"File not found: {dst}")
                continue

            # Backup
            create_backup(str(target), workspace_root)

            # Apply hunks
            original = target.read_text(encoding="utf-8", errors="replace")
            patched = _apply_hunks_to_content(original, lines)
            target.write_text(patched, encoding="utf-8")
            files_changed.append(dst)

        except Exception as exc:
            errors.append(f"Error applying diff to {dst}: {exc}")

    return {
        "success": len(errors) == 0,
        "files_changed": files_changed,
        "errors": errors,
    }


def _apply_hunks_to_content(original: str, diff_lines: list[str]) -> str:
    """Best-effort hunk application on *original* content."""
    orig_lines = original.splitlines()
    result = list(orig_lines)
    offset = 0

    hunks: list[DiffHunk] = []
    current_hunk: DiffHunk | None = None
    for line in diff_lines:
        if line.startswith("@@"):
            current_hunk = _parse_hunk_header(line)
            hunks.append(current_hunk)
        elif current_hunk is not None:
            current_hunk.lines.append(line)

    for hunk in hunks:
        pos = hunk.src_start - 1 + offset
        removed = 0
        added_lines: list[str] = []

        for hl in hunk.lines:
            if hl.startswith("-"):
                # Remove line
                idx = pos + len(added_lines)
                if 0 <= idx < len(result):
                    result.pop(idx)
                    removed += 1
            elif hl.startswith("+"):
                idx = pos + len(added_lines)
                result.insert(idx, hl[1:])
                added_lines.append(hl[1:])
            else:
                # Context line (space prefix)
                added_lines.append(hl[1:] if hl.startswith(" ") else hl)

        offset += len(added_lines) - removed

    return "\n".join(result) + "\n" if result else ""


# ── Backup & rollback ──────────────────────────────────────────────────────

def create_backup(filepath: str, workspace_root: str) -> str:
    """Copy *filepath* to ``.pixagent/backups/`` and return the backup path."""
    src = Path(filepath).resolve()
    ws = Path(workspace_root).resolve()
    try:
        rel = src.relative_to(ws)
    except ValueError:
        raise ValueError(f"File is outside workspace: {filepath}")

    backup_dir = ws / ".pixagent" / "backups" / rel.parent
    backup_dir.mkdir(parents=True, exist_ok=True)
    dest = backup_dir / rel.name
    shutil.copy2(str(src), str(dest))
    return str(dest)


def rollback(filepath: str, workspace_root: str) -> bool:
    """Restore *filepath* from the most recent backup. Returns *True* on success."""
    src = Path(filepath).resolve()
    ws = Path(workspace_root).resolve()
    try:
        rel = src.relative_to(ws)
    except ValueError:
        return False

    backup = ws / ".pixagent" / "backups" / rel
    if not backup.is_file():
        return False

    shutil.copy2(str(backup), str(src))
    return True
