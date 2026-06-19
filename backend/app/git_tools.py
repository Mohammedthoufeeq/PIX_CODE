"""Git helper functions – status, diff, commit, branch.  Never auto-pushes."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Optional


async def _run_git(args: list[str], workspace_root: str) -> tuple[str, str, int]:
    """Run ``git <args>`` inside *workspace_root* and return ``(stdout, stderr, code)``."""
    process = await asyncio.create_subprocess_exec(
        "git",
        *args,
        cwd=str(Path(workspace_root).resolve()),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout_bytes, stderr_bytes = await process.communicate()
    return (
        stdout_bytes.decode("utf-8", errors="replace").strip(),
        stderr_bytes.decode("utf-8", errors="replace").strip(),
        process.returncode or 0,
    )


async def git_status(workspace_root: str) -> dict[str, Any]:
    """Return parsed ``git status --porcelain`` output."""
    stdout, stderr, code = await _run_git(["status", "--porcelain"], workspace_root)
    files: list[dict[str, str]] = []
    for line in stdout.splitlines():
        if len(line) >= 4:
            status = line[:2].strip()
            filepath = line[3:].strip()
            files.append({"status": status, "path": filepath})
    return {"files": files, "raw": stdout, "error": stderr if code != 0 else ""}


async def git_diff(workspace_root: str, staged: bool = False) -> str:
    """Return ``git diff`` (or ``git diff --staged``) output."""
    args = ["diff", "--staged"] if staged else ["diff"]
    stdout, stderr, code = await _run_git(args, workspace_root)
    if code != 0:
        return f"Error: {stderr}"
    return stdout


async def git_commit(
    workspace_root: str,
    message: str,
    files: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Stage *files* (or all) and commit with *message*. Never pushes."""
    # Stage
    if files:
        for f in files:
            await _run_git(["add", f], workspace_root)
    else:
        await _run_git(["add", "-A"], workspace_root)

    # Commit
    stdout, stderr, code = await _run_git(["commit", "-m", message], workspace_root)
    return {
        "success": code == 0,
        "message": stdout,
        "error": stderr if code != 0 else "",
    }


async def git_branch(workspace_root: str) -> str:
    """Return the current branch name."""
    stdout, stderr, code = await _run_git(
        ["rev-parse", "--abbrev-ref", "HEAD"], workspace_root
    )
    if code != 0:
        return f"Error: {stderr}"
    return stdout
