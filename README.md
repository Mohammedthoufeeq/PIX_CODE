# PIX Code Agent

A local/web-based AI coding agent platform powered by the PIX LLM API. Think of it as your own internal Claude Code — select a project, chat with your codebase, plan changes, review diffs, and apply edits safely.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        PIX Code Agent                          │
├───────────────────────┬─────────────────────────────────────────┤
│     Frontend (React)  │           Backend (FastAPI)             │
│                       │                                         │
│  ┌─────────────────┐  │  ┌──────────────────────────────────┐   │
│  │ Project Selector │  │  │  PIX OpenAI-Compatible Gateway   │   │
│  │ File Explorer    │  │  │  POST /v1/chat/completions       │   │
│  │ Monaco Editor    │  │  │         │                        │   │
│  │ Diff Viewer      │──┤  │         ▼                        │   │
│  │ Chat Panel       │  │  │  ┌─────────────┐                │   │
│  │ Task History     │  │  │  │ PIX Gateway  │──► PIX API     │   │
│  │ Terminal Panel   │  │  │  └─────────────┘    (External)   │   │
│  │ Model Selector   │  │  │                                  │   │
│  │ Git Panel        │  │  │  ┌─────────────┐                │   │
│  │ Approval Modal   │  │  │  │ Agent Loop   │                │   │
│  └─────────────────┘  │  │  │ ├─ Planner    │                │   │
│                       │  │  │ ├─ Executor   │                │   │
│  Zustand State Store  │  │  │ └─ Diff Tools │                │   │
│  API Client           │  │  └──────────────────────────────────┤ │
│                       │  │                                     │ │
│                       │  │  File Tools │ Bash Tools │ Git Tools│ │
│                       │  │  Safety     │ Indexing   │ Workspace│ │
└───────────────────────┴──┴─────────────────────────────────────┘ │
                                                                    │
                              ┌──────────────┐                      │
                              │   PIX API    │◄─────────────────────┘
                              │ positka.net  │
                              └──────────────┘
```

---

## Tech Stack

| Layer    | Technology                                                    |
|----------|---------------------------------------------------------------|
| Frontend | React, TypeScript, Vite, Tailwind CSS, Monaco Editor, Zustand |
| Backend  | Python, FastAPI, Uvicorn, Pydantic, HTTPX                     |
| LLM      | PIX API (OpenAI-compatible gateway)                           |
| Storage  | Local JSON files, SQLite (future)                             |

---

## Setup Instructions

### Automated Setup (Recommended)

Get started in one command using the unified cross-platform setup installer:

* **Windows**: Run `setup.bat` or double-click it.
* **Linux / macOS**: Run `bash setup.bat` in your terminal.

This automatically verifies your prerequisites (Python 3.11+, Node.js 18+), creates virtual environments, configures environment keys interactively, and installs all dependencies.

### Launching the Agent

Run the following command in the root folder to start both the backend and frontend servers:

```bash
python trigger.py
```

For more detailed setup information, advanced configuration options, and manual troubleshooting guides, see the [INSTALLATION.md](file:///c:/Users/MohamedThoufeeq/Desktop/pix-code-agent/INSTALLATION.md) file.

---

## Environment Variables

| Variable          | Description                    | Default                                    |
|-------------------|--------------------------------|--------------------------------------------|
| `PIX_API_KEY`     | Your PIX API key               | *(required)*                               |
| `PIX_API_BASE`    | PIX API endpoint               | `https://pix.positka.net/api/v1/messages`  |
| `DEFAULT_PIX_MODEL` | Default model to use         | `sonnet-4`                                 |
| `WORKSPACE_ROOTS` | Allowed workspace directories  | *(empty — user selects at runtime)*        |
| `BACKEND_HOST`    | Backend bind address           | `127.0.0.1`                                |
| `BACKEND_PORT`    | Backend port                   | `8000`                                     |

---

## How to Use

### 1. Select a Project

Enter a local project path in the Project Selector and click **Open**. The backend validates the path, indexes files, and builds a file tree.

### 2. Browse Files

Use the File Explorer to navigate your project. Click a file to view it in the Monaco Editor.

### 3. Add Context

Click the **+** icon next to files to add them as context for the AI. The agent will include these files when generating plans and code.

### 4. Chat with Your Code

Use the Chat Panel to ask questions about your codebase. The AI sees your context files and responds with code-aware answers.

### 5. Plan a Task

Click **Plan** to have the agent analyze your request and produce a step-by-step implementation plan. Review the plan before proceeding.

### 6. Execute Changes

Click **Approve & Execute** to have the agent generate code changes as unified diffs. Review each diff in the Diff Viewer.

### 7. Apply or Reject Diffs

Use **Apply** to write changes to disk (a backup is created first) or **Reject** to discard them.

### 8. Git Integration

View branch status, diffs, and make commits from the Git tab. The agent never auto-pushes.

---

## Available Models

| Model                | Description              |
|----------------------|--------------------------|
| `sonnet-4`           | Default, balanced        |
| `claude-opus-4-5`    | High capability          |
| `claude-opus-4-7`    | High capability          |
| `claude-opus-4-8`    | High capability          |
| `deepseek3-2`        | DeepSeek v3              |
| `claude`             | Standard Claude          |
| `llama3`             | Meta Llama 3             |
| `mistral-devstral-2` | Mistral Devstral         |
| `nova-lite`          | Amazon Nova Lite         |
| `nova-pro`           | Amazon Nova Pro          |

Switch models from the dropdown in the right panel header.

---

## PIX Gateway

The backend includes an OpenAI-compatible gateway at `POST /v1/chat/completions`. This allows any OpenAI-compatible client to use PIX models.

### Test with curl

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonnet-4",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Explain Python decorators in 2 sentences."}
    ],
    "temperature": 0.2,
    "max_tokens": 500
  }'
```

### Expected Response

```json
{
  "id": "pix-chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "sonnet-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Python decorators are..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

---

## Keyboard Shortcuts

| Shortcut             | Action           |
|----------------------|------------------|
| `Ctrl/Cmd + Enter`   | Send task        |
| `Ctrl/Cmd + P`       | Quick file search|
| `Ctrl/Cmd + Shift + D` | Toggle diff view |

---

## Security Notes

1. **Workspace Sandboxing**: The backend only reads/writes inside the selected workspace root.
2. **Blocked Paths**: `~/.ssh`, `~/.aws`, `~/.config`, `.env`, `node_modules`, `.git` internals, `/etc`, `/usr`, `/bin`, system directories.
3. **`.pixignore`**: Add a `.pixignore` file (same syntax as `.gitignore`) to exclude files from indexing and context.
4. **File Size Limit**: Files over 300 KB are skipped.
5. **Binary Detection**: Binary files are automatically detected and skipped.
6. **Diff Approval**: All file changes require explicit user approval via the Diff Viewer.
7. **Dangerous Commands**: Commands like `rm -rf`, `sudo`, `curl | sh` require manual approval.
8. **API Key Security**: PIX API key is stored only in `backend/.env`, never exposed to the frontend, never logged.

---

## Project Structure

```
pix-code-agent/
├── README.md
├── .gitignore
├── docker-compose.yml
├── backend/
│   ├── requirements.txt
│   ├── .env.example
│   └── app/
│       ├── main.py              # FastAPI app, CORS, routers
│       ├── config.py            # Settings from .env
│       ├── models.py            # Pydantic models
│       ├── pix_gateway.py       # PIX API adapter
│       ├── llm_client.py        # High-level LLM client
│       ├── workspace.py         # Workspace management
│       ├── file_tools.py        # File read/write/search
│       ├── bash_tools.py        # Command execution
│       ├── git_tools.py         # Git operations
│       ├── indexing.py          # Project indexing
│       ├── diff_tools.py        # Diff generation/application
│       ├── safety.py            # Security checks
│       ├── agent/
│       │   ├── prompts.py       # System prompts
│       │   ├── planner.py       # Plan generation
│       │   ├── executor.py      # Code change execution
│       │   └── loop.py          # Agent orchestration
│       └── routes/
│           ├── projects.py      # Project management APIs
│           ├── files.py         # File operation APIs
│           ├── chat.py          # Chat API
│           ├── agent.py         # Agent plan/execute APIs
│           ├── git.py           # Git APIs
│           └── settings.py      # Settings APIs
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css
        ├── api/
        │   └── client.ts        # API client
        ├── store/
        │   └── useAppStore.ts   # Zustand state
        └── components/
            ├── Layout.tsx
            ├── Sidebar.tsx
            ├── ProjectSelector.tsx
            ├── FileExplorer.tsx
            ├── CodeEditor.tsx
            ├── ChatPanel.tsx
            ├── DiffViewer.tsx
            ├── TaskHistory.tsx
            ├── ModelSelector.tsx
            ├── TerminalPanel.tsx
            ├── ApprovalModal.tsx
            └── StatusBar.tsx
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Backend won't start | Check Python 3.10+ is installed. Check `.env` exists with valid `PIX_API_KEY`. |
| Frontend shows blank page | Ensure backend is running on port 8000. Check browser console for errors. |
| PIX API errors | Verify your API key. Check network connectivity to `pix.positka.net`. |
| File not loading | Check the file is under 300 KB and is not binary. Check it's not in `.pixignore`. |
| Git commands fail | Ensure the project has a `.git` directory. Ensure `git` is on your PATH. |
| CORS errors | Backend must have CORS middleware configured for `localhost:5173`. |

---

## Roadmap

### Phase 1 ✅ (Implemented)
- FastAPI backend with PIX gateway
- Project selector and file tree
- File reader/writer
- Simple chat using PIX
- Monaco code editor
- Dark mode IDE UI

### Phase 2 ✅ (Implemented)
- Planner/Executor agent
- Context manager
- Unified diff generation
- Diff viewer with apply/reject

### Phase 3 🔜 (Next)
- Full patch application with rollback
- Git status, diff, and commit UI
- Command execution with safety approval
- Terminal panel with live output

### Phase 4 🔜 (Future)
- Project indexing with symbol extraction
- Persistent task history with search
- Settings UI with model management
- Backup/rollback system
- Multi-file context suggestions

---

## License

Internal tool — not for public distribution.
