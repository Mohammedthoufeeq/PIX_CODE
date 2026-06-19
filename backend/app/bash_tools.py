"""Shell command execution with safety checks, approval flow, and optional Docker sandbox."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.safety import is_command_safe, is_path_safe


# ── Security token helpers ──────────────────────────────────────────────────

def sign_action(action_data: dict, secret: str | None = None) -> str:
    """Return an HMAC-SHA256 hex digest for *action_data*."""
    if secret is None:
        secret = get_settings().AGENT_SECRET_KEY
    payload = json.dumps(action_data, sort_keys=True, ensure_ascii=True)
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


def verify_action_token(action_data: dict, token: str, secret: str | None = None) -> bool:
    """Return *True* if *token* is a valid HMAC signature for *action_data*."""
    if secret is None:
        secret = get_settings().AGENT_SECRET_KEY
    expected = sign_action(action_data, secret)
    return hmac.compare_digest(expected, token)


# ── Sandbox execution ───────────────────────────────────────────────────────

async def _run_in_sandbox(
    command: str,
    workspace_root: str,
    timeout: int,
) -> dict[str, Any]:
    """Execute *command* inside an ephemeral Docker container.

    The workspace is mounted read-only at /workspace.  Network access is
    disabled so the container cannot make outbound calls.
    """
    settings = get_settings()
    image = settings.SANDBOX_IMAGE

    # Escape the command for passing to sh -c "..."
    escaped = command.replace('"', '\\"')
    docker_cmd = (
        f"docker run --rm --network=none "
        f"--memory={settings.SANDBOX_MEMORY_LIMIT} "
        f"--cpus={settings.SANDBOX_CPU_LIMIT} "
        f'-v "{workspace_root}":/workspace:ro '
        f"-w /workspace "
        f'{image} sh -c "{escaped}"'
    )

    try:
        process = await asyncio.create_subprocess_shell(
            docker_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                process.communicate(), timeout=timeout
            )
        except asyncio.TimeoutError:
            process.kill()
            await process.communicate()
            return {
                "stdout": "",
                "stderr": f"Sandbox command timed out after {timeout}s",
                "exit_code": -1,
                "requires_approval": False,
                "reason": "sandbox_timeout",
                "sandboxed": True,
            }

        return {
            "stdout": stdout_bytes.decode("utf-8", errors="replace"),
            "stderr": stderr_bytes.decode("utf-8", errors="replace"),
            "exit_code": process.returncode or 0,
            "requires_approval": False,
            "reason": "",
            "sandboxed": True,
        }

    except FileNotFoundError:
        return {
            "stdout": "",
            "stderr": "Docker is not available. Sandbox mode requires Docker to be installed and running.",
            "exit_code": 1,
            "requires_approval": False,
            "reason": "docker_unavailable",
            "sandboxed": True,
        }
    except Exception as exc:
        return {
            "stdout": "",
            "stderr": str(exc),
            "exit_code": 1,
            "requires_approval": False,
            "reason": str(exc),
            "sandboxed": True,
        }


# ── Main entry point ────────────────────────────────────────────────────────

async def run_command(
    command: str,
    cwd: str,
    workspace_root: str,
    approved: bool = False,
    timeout: int | None = None,
    security_token: str | None = None,
) -> dict[str, Any]:
    """Execute *command* in *cwd* after safety and approval validation.

    When ``SANDBOX_ENABLED`` is *True* in settings, approved commands are
    executed inside a Docker container instead of the host shell.

    If *security_token* is provided it is verified against the action payload
    before execution.  A missing or invalid token causes the command to be
    treated as unapproved.
    """
    settings = get_settings()
    if timeout is None:
        timeout = settings.COMMAND_TIMEOUT

    # Validate cwd inside workspace
    resolved_cwd = str(Path(cwd).resolve()) if cwd else str(Path(workspace_root).resolve())
    if not is_path_safe(resolved_cwd, workspace_root):
        return {
            "stdout": "",
            "stderr": f"Working directory is outside the workspace: {cwd}",
            "exit_code": 1,
            "requires_approval": False,
            "reason": "cwd outside workspace",
        }

    # Token verification (if a token is supplied it must be valid)
    if security_token is not None:
        action_data = {"command": command, "cwd": resolved_cwd}
        if not verify_action_token(action_data, security_token):
            return {
                "stdout": "",
                "stderr": "Invalid security token – action rejected.",
                "exit_code": 1,
                "requires_approval": False,
                "reason": "invalid_security_token",
            }
        # A valid token counts as explicit approval
        approved = True

    # Safety check
    safe, reason = is_command_safe(command)
    if not safe and not approved:
        return {
            "stdout": "",
            "stderr": "",
            "exit_code": -1,
            "requires_approval": True,
            "reason": reason,
        }

    # ── Sandboxed execution ──────────────────────────────────────────────────
    if settings.SANDBOX_ENABLED and approved:
        return await _run_in_sandbox(command, workspace_root, timeout)

    # ── Host execution ───────────────────────────────────────────────────────
    shell_cmd = f'cmd /c "{command}"' if os.name == "nt" else command

    try:
        process = await asyncio.create_subprocess_shell(
            shell_cmd,
            cwd=resolved_cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                process.communicate(), timeout=timeout
            )
        except asyncio.TimeoutError:
            process.kill()
            await process.communicate()
            return {
                "stdout": "",
                "stderr": f"Command timed out after {timeout}s",
                "exit_code": -1,
                "requires_approval": False,
                "reason": "timeout",
            }

        return {
            "stdout": stdout_bytes.decode("utf-8", errors="replace"),
            "stderr": stderr_bytes.decode("utf-8", errors="replace"),
            "exit_code": process.returncode or 0,
            "requires_approval": False,
            "reason": "",
            "sandboxed": False,
        }

    except Exception as exc:
        return {
            "stdout": "",
            "stderr": str(exc),
            "exit_code": 1,
            "requires_approval": False,
            "reason": str(exc),
        }
