import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"

BACKEND_CMD = (
    "Set-Location '{backend}'; "
    ".\\.venv\\Scripts\\Activate.ps1; "
    "python -m uvicorn app.main:app --reload --port 8000"
).format(backend=BACKEND)

FRONTEND_CMD = (
    "Set-Location '{frontend}'; "
    "$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + "
    "[System.Environment]::GetEnvironmentVariable('Path','User'); "
    "npm run dev"
).format(frontend=FRONTEND)

FLAGS = subprocess.CREATE_NEW_CONSOLE

def launch(title, cmd):
    return subprocess.Popen(
        ["powershell", "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", cmd],
        creationflags=FLAGS,
        cwd=str(ROOT),
    )

if __name__ == "__main__":
    print("Starting backend  → http://localhost:8000")
    backend_proc = launch("Backend", BACKEND_CMD)

    print("Starting frontend → http://localhost:5173 (or 3000)")
    frontend_proc = launch("Frontend", FRONTEND_CMD)

    print("\nBoth windows launched. Close this terminal or press Ctrl+C to exit.")
    print(f"  Backend  PID: {backend_proc.pid}")
    print(f"  Frontend PID: {frontend_proc.pid}")

    try:
        backend_proc.wait()
        frontend_proc.wait()
    except KeyboardInterrupt:
        print("\nStopping...")
        backend_proc.terminate()
        frontend_proc.terminate()
        sys.exit(0)
