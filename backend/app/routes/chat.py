import ast
import asyncio
import json
import re
import uuid
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException

from app.llm_client import chat_completion, stream_chat_completion
from app.models import ChatMessage
from app.routes.files import get_current_context
from app.workspace import workspace_manager
from app.file_tools import list_files, read_file, search_files, write_file
from app.bash_tools import run_command

from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/chat", tags=["chat"])

pending_approvals: dict[str, dict] = {}


@router.post("/approve")
async def approve_action(payload: dict):
    approval_id = payload.get("approval_id")
    if not approval_id or approval_id not in pending_approvals:
        raise HTTPException(status_code=404, detail="Approval request not found or expired")
    
    pending_approvals[approval_id]["decision"] = True
    pending_approvals[approval_id]["event"].set()
    return {"success": True}


@router.post("/reject")
async def reject_action(payload: dict):
    approval_id = payload.get("approval_id")
    if not approval_id or approval_id not in pending_approvals:
        raise HTTPException(status_code=404, detail="Approval request not found or expired")
    
    pending_approvals[approval_id]["decision"] = False
    pending_approvals[approval_id]["event"].set()
    return {"success": True}

REACT_SYSTEM_PROMPT = """You are an autonomous AI coding agent.
You operate within the workspace directory: {workspace_root}.

You can use the following tools to explore the workspace, read/write files, and run commands:
1. list_files(path: str = ""): List files and directories in a path relative to the workspace.
2. search_files(query: str, path: str = ""): Search file contents for a string query.
3. read_file(path: str): Read the full content of a text file.
4. write_file(path: str, content: str): Propose writing full content to a file. This generates a diff for the user to approve.
5. run_command(command: str): Run a shell command in the workspace.

Instructions:
- When you make changes to files (using write_file), you MUST always run a verification command (e.g. test runner, compiler check, or git status) using run_command to verify that your changes did not break anything.
- If a verification command fails (returns non-zero exit code or prints errors), you must analyze the error, modify the files again to fix the issue, and verify again.
- Repeat this edit-and-verify cycle until tests pass or compilation succeeds.

Format:
Thought: <your reasoning and explanation of what you are doing or fixing>
Action: <tool_name>(<arguments>)

Observation: <tool output>

... (repeat)

Thought: <your final reasoning>
Answer: <your final answer to the user summarizing the actions taken and verifying they work>
"""

def parse_action(text: str) -> Optional[tuple[str, dict]]:
    """Parse Action: tool_name(arg1=val1, ...) from LLM output."""
    match = re.search(r"Action:\s*(\w+)\((.*)\)", text, re.IGNORECASE)
    if not match:
        return None
    tool_name = match.group(1).lower()
    args_str = match.group(2)
    try:
        # Parse using AST (Python parser)
        tree = ast.parse(f"f({args_str})")
        args_dict = {}
        for keyword in tree.body[0].value.keywords:
            args_dict[keyword.arg] = ast.literal_eval(keyword.value)
        
        positional = [ast.literal_eval(arg) for arg in tree.body[0].value.args]
        if positional:
            if tool_name in ("read_file", "write_file") and len(positional) >= 1:
                args_dict["path"] = positional[0]
            if tool_name == "write_file" and len(positional) >= 2:
                args_dict["content"] = positional[1]
            if tool_name == "search_files" and len(positional) >= 1:
                args_dict["query"] = positional[0]
            if tool_name == "run_command" and len(positional) >= 1:
                args_dict["command"] = positional[0]
        return tool_name, args_dict
    except Exception:
        # Regex fallback
        args_dict = {}
        kv_pairs = re.findall(r"(\w+)\s*=\s*(?:'([^']*)'|\"([^\"]*)\")", args_str)
        for k, v1, v2 in kv_pairs:
            args_dict[k] = v1 or v2
        if not args_dict and args_str.strip():
            s_match = re.match(r"^['\"]([^'\"]*)['\"]$", args_str.strip())
            if s_match:
                key = "path" if tool_name == "read_file" else ("command" if tool_name == "run_command" else "query")
                args_dict[key] = s_match.group(1)
        return tool_name, args_dict


async def execute_tool(tool_name: str, args: dict, ws: str, proposed_diffs: list, files_modified: list) -> str:
    if tool_name == "list_files":
        path = args.get("path", "")
        target = str((Path(ws) / path).resolve()) if path else ws
        try:
            entries = list_files(target, ws)
            return json.dumps(entries, indent=2)
        except Exception as e:
            return f"Error: {e}"
            
    elif tool_name == "search_files":
        query = args.get("query", "")
        path = args.get("path", "")
        search_root = str((Path(ws) / path).resolve()) if path else ws
        try:
            results = search_files(query, search_root)
            return json.dumps(results, indent=2)
        except Exception as e:
            return f"Error: {e}"
            
    elif tool_name == "read_file":
        path = args.get("path", "")
        resolved = str((Path(ws) / path).resolve()) if not Path(path).is_absolute() else path
        try:
            content = read_file(resolved, ws)
            return f"--- File: {path} ---\n{content}\n--- End of File ---"
        except Exception as e:
            return f"Error: {e}"
            
    elif tool_name == "write_file":
        path = args.get("path", "")
        content = args.get("content", "")
        resolved = str((Path(ws) / path).resolve()) if not Path(path).is_absolute() else path
        
        original_content = ""
        if Path(resolved).is_file():
            try:
                with open(resolved, "r", encoding="utf-8", errors="replace") as fh:
                    original_content = fh.read()
            except Exception:
                pass
        
        from app.diff_tools import generate_diff
        diff_text = generate_diff(original_content, content, path)
        
        # Since it is approved, write the file directly to disk
        try:
            write_file(resolved, content, ws)
            proposed_diffs.append({
                "file_path": path,
                "original": original_content,
                "modified": content,
                "diff": diff_text
            })
            if path not in files_modified:
                files_modified.append(path)
                
            return f"Success: Modification successfully written to {path}."
        except Exception as e:
            return f"Error writing file: {e}"
        
    elif tool_name == "run_command":
        command = args.get("command", "")
        try:
            res = await run_command(command, "", ws, approved=True)
            stdout = res.get("stdout", "")
            stderr = res.get("stderr", "")
            exit_code = res.get("exit_code", 0)
            return f"Exit Code: {exit_code}\nStdout:\n{stdout}\nStderr:\n{stderr}"
        except Exception as e:
            return f"Error: {e}"
            
    return f"Error: Unknown tool '{tool_name}'"


@router.post("/")
async def chat(payload: dict) -> StreamingResponse:
    """Chat endpoint returning a Server-Sent Events stream of agent execution steps."""
    user_message = payload.get("message", "")
    model = payload.get("model")

    if not user_message:
        raise HTTPException(status_code=400, detail="Message is required.")

    try:
        ws = workspace_manager.get_workspace()
    except ValueError:
        ws = None

    messages: list[ChatMessage] = []

    # If no active workspace, yield simple direct chat
    if not ws:
        messages.append(ChatMessage(role="user", content=user_message))
        
        async def fallback_generator():
            try:
                full = ""
                async for chunk in stream_chat_completion(messages, model=model):
                    full += chunk
                    yield f"data: {json.dumps({'type': 'token', 'content': chunk})}\n\n"
                yield f"data: {json.dumps({'type': 'answer', 'content': full})}\n\n"
            except Exception as exc:
                yield f"data: {json.dumps({'type': 'status', 'content': f'LLM Error: {exc}'})}\n\n"
        
        return StreamingResponse(fallback_generator(), media_type="text/event-stream")

    # Determine if this is a project generation prompt
    IS_GENERATION_PROMPT = """You are an AI router.
Determine if the user's message is asking to generate, build, or initialize a new project/application from scratch.

Example of generation prompts:
- "create a new fastapi app"
- "build a python calculator"
- "refer to spec.md and build this project"
- "generate a web app for recipes"

Example of non-generation prompts:
- "add a database model to main.py"
- "fix the bug in api.py"
- "explain the code in index.js"
- "write tests for my current project"

User Message: "{message}"

Respond with ONLY the word "YES" if it is a project generation/creation request from scratch, or "NO" otherwise. Do not write any other explanation.
"""

    is_gen = False
    try:
        routing_prompt = IS_GENERATION_PROMPT.format(message=user_message)
        route_res = await chat_completion([ChatMessage(role="user", content=routing_prompt)], model=model)
        if route_res.strip().upper() == "YES":
            is_gen = True
    except Exception:
        pass

    if is_gen:
        from app.agent.project_generator import generate_project
        
        async def gen_event_generator():
            yield f"data: {json.dumps({'type': 'status', 'content': 'Routing to Smart Project Generator...'})}\n\n"
            async for event in generate_project(user_message, ws):
                yield f"data: {json.dumps(event)}\n\n"
                
        return StreamingResponse(gen_event_generator(), media_type="text/event-stream")

    # Active workspace exists -> run ReAct loop!
    messages.append(ChatMessage(role="system", content=REACT_SYSTEM_PROMPT.format(workspace_root=ws)))

    # Read README.md if it exists
    readme_path = Path(ws) / "README.md"
    if not readme_path.is_file():
        readme_path = Path(ws) / "readme.md"
    readme_content = ""
    if readme_path.is_file():
        try:
            readme_content = readme_path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            pass

    # Load workspace file list
    from app.indexing import load_index
    index = load_index(ws)
    file_list = []
    if index and index.files:
        file_list = [f.path for f in index.files]

    ws_preamble = [f"Active project workspace: {ws}"]
    if readme_content:
        ws_preamble.append(f"Project README.md:\n{readme_content}\n")
    if file_list:
        ws_preamble.append("Project files:\n" + "\n".join(file_list[:150]))
        if len(file_list) > 150:
            ws_preamble.append(f"... and {len(file_list) - 150} other files.")

    # Inject semantic symbol index for precise navigation
    from app.indexing import build_symbol_preamble
    if index and index.symbols:
        symbol_preamble = build_symbol_preamble(index)
        if symbol_preamble:
            ws_preamble.append(symbol_preamble)

    messages.append(ChatMessage(role="system", content="\n\n".join(ws_preamble)))

    # Inject context files loaded manually
    context_files = get_current_context()
    if context_files:
        ctx_parts = ["Files explicitly loaded by user as active context:"]
        for cf in context_files:
            ctx_parts.append(f"--- {cf.path} ---\n{cf.content}")
        messages.append(ChatMessage(role="system", content="\n\n".join(ctx_parts)))

    # Inject conversation history as context
    history = payload.get("history", [])
    for msg in history:
        role = msg.get("role")
        content = msg.get("content")
        if role in ("user", "assistant") and content:
            messages.append(ChatMessage(role=role, content=content))

    messages.append(ChatMessage(role="user", content=user_message))

    async def event_generator():
        yield f"data: {json.dumps({'type': 'status', 'content': 'Initializing PIX agent loop...'})}\n\n"
        
        proposed_diffs = []
        files_modified = []
        iterations = 0
        max_iterations = 6
        agent_history = list(messages)

        while iterations < max_iterations:
            yield f"data: {json.dumps({'type': 'status', 'content': f'Running step {iterations+1}...'})}\n\n"

            # Stream LLM tokens in real-time so the user sees output immediately
            response_text = ""
            try:
                async for chunk in stream_chat_completion(agent_history, model=model):
                    response_text += chunk
                    yield f"data: {json.dumps({'type': 'token', 'content': chunk})}\n\n"
            except Exception as exc:
                yield f"data: {json.dumps({'type': 'status', 'content': f'LLM Error: {exc}'})}\n\n"
                break

            # Parse thought
            thought_match = re.search(r"Thought:\s*([\s\S]*?)(?:Action:|Answer:|$)", response_text, re.IGNORECASE)
            thought = thought_match.group(1).strip() if thought_match else ""
            if thought:
                yield "data: " + json.dumps({'type': 'thought', 'content': thought}) + "\n\n"

            # Parse action
            action_info = parse_action(response_text)
            if action_info:
                tool_name, tool_args = action_info
                yield "data: " + json.dumps({'type': 'action', 'tool': tool_name, 'args': tool_args, 'content': f"Calling {tool_name}"}) + "\n\n"
                
                # Interactive tool execution approval flow for commands and file writes
                if tool_name in ("run_command", "write_file"):
                    approval_id = f"appr-{uuid.uuid4().hex[:8]}"
                    event = asyncio.Event()
                    pending_approvals[approval_id] = {"event": event, "decision": None}
                    
                    yield "data: " + json.dumps({
                        'type': 'requires_approval',
                        'approval_id': approval_id,
                        'tool': tool_name,
                        'args': tool_args
                    }) + "\n\n"
                    
                    # Pause the stream and wait for the user to approve or reject
                    await event.wait()
                    
                    approved = pending_approvals[approval_id]["decision"]
                    # Clean up
                    if approval_id in pending_approvals:
                        del pending_approvals[approval_id]
                        
                    if not approved:
                        observation = "Error: Tool execution was rejected by the user."
                        yield "data: " + json.dumps({'type': 'observation', 'content': observation}) + "\n\n"
                        agent_history.append(ChatMessage(role="assistant", content=response_text))
                        agent_history.append(ChatMessage(role="user", content=f"Observation: {observation}"))
                        iterations += 1
                        continue

                # Execute tool call
                observation = await execute_tool(tool_name, tool_args, ws, proposed_diffs, files_modified)
                
                yield "data: " + json.dumps({'type': 'observation', 'content': observation}) + "\n\n"
                
                # If write_file was called and diffs were proposed, yield the latest proposed diff
                if tool_name == "write_file" and proposed_diffs:
                    latest_diff = proposed_diffs[-1]
                    file_path = latest_diff["file_path"]
                    yield "data: " + json.dumps({'type': 'diff', 'content': f"Proposed edits to {file_path}", 'diff': latest_diff}) + "\n\n"

                agent_history.append(ChatMessage(role="assistant", content=response_text))
                agent_history.append(ChatMessage(role="user", content=f"Observation: {observation}"))
                iterations += 1
            else:
                # Done or fallback
                answer_match = re.search(r"Answer:\s*([\s\S]*)", response_text, re.IGNORECASE)
                final_answer = answer_match.group(1).strip() if answer_match else response_text.strip()
                yield "data: " + json.dumps({'type': 'answer', 'content': final_answer}) + "\n\n"
                break
        else:
            yield "data: " + json.dumps({'type': 'answer', 'content': 'The agent reached the maximum number of steps without concluding.'}) + "\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/history")
async def get_chat_history():
    ws = workspace_manager.get_active_workspace()
    if not ws:
        return {"success": True, "history": []}
    
    history_file = Path(ws) / ".pixagent" / "chat_history.json"
    if history_file.is_file():
        try:
            with open(history_file, "r", encoding="utf-8") as fh:
                history = json.load(fh)
                return {"success": True, "history": history}
        except Exception as e:
            return {"success": False, "error": f"Failed to read history: {e}", "history": []}
    
    return {"success": True, "history": []}


@router.post("/history")
async def save_chat_history(payload: dict):
    ws = workspace_manager.get_active_workspace()
    if not ws:
        raise HTTPException(status_code=400, detail="No active workspace")
    
    history = payload.get("history", [])
    
    pix_dir = Path(ws) / ".pixagent"
    pix_dir.mkdir(exist_ok=True, parents=True)
    
    history_file = pix_dir / "chat_history.json"
    try:
        with open(history_file, "w", encoding="utf-8") as fh:
            json.dump(history, fh, indent=2, ensure_ascii=False)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save history: {e}")


# ─── Chat Sessions Endpoints ───

import time

@router.get("/sessions")
async def list_sessions():
    ws = workspace_manager.get_active_workspace()
    if not ws:
        return {"success": True, "sessions": []}
    sessions_dir = Path(ws) / ".pixagent" / "sessions"
    sessions_dir.mkdir(parents=True, exist_ok=True)
    index_file = sessions_dir / "index.json"
    if index_file.is_file():
        try:
            with open(index_file, "r", encoding="utf-8") as fh:
                return {"success": True, "sessions": json.load(fh)}
        except Exception:
            return {"success": True, "sessions": []}
    return {"success": True, "sessions": []}


@router.post("/sessions")
async def create_session(payload: dict):
    ws = workspace_manager.get_active_workspace()
    if not ws:
        raise HTTPException(status_code=400, detail="No active workspace")
    
    session_id = payload.get("id") or str(uuid.uuid4())
    title = payload.get("title") or "New Session"
    history = payload.get("history", [])
    
    sessions_dir = Path(ws) / ".pixagent" / "sessions"
    sessions_dir.mkdir(parents=True, exist_ok=True)
    
    index_file = sessions_dir / "index.json"
    sessions = []
    if index_file.is_file():
        try:
            with open(index_file, "r", encoding="utf-8") as fh:
                sessions = json.load(fh)
        except Exception:
            pass
            
    # Check if exists
    exists = False
    for s in sessions:
        if s["id"] == session_id:
            s["title"] = title
            exists = True
            break
            
    if not exists:
        sessions.insert(0, {
            "id": session_id,
            "title": title,
            "createdAt": payload.get("createdAt") or int(time.time() * 1000)
        })
        
    try:
        with open(index_file, "w", encoding="utf-8") as fh:
            json.dump(sessions, fh, indent=2, ensure_ascii=False)
            
        session_file = sessions_dir / f"{session_id}.json"
        with open(session_file, "w", encoding="utf-8") as fh:
            json.dump({"id": session_id, "title": title, "history": history}, fh, indent=2, ensure_ascii=False)
            
        return {"success": True, "session": {"id": session_id, "title": title}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    ws = workspace_manager.get_active_workspace()
    if not ws:
        raise HTTPException(status_code=400, detail="No active workspace")
    session_file = Path(ws) / ".pixagent" / "sessions" / f"{session_id}.json"
    if session_file.is_file():
        try:
            with open(session_file, "r", encoding="utf-8") as fh:
                return {"success": True, "session": json.load(fh)}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    raise HTTPException(status_code=404, detail="Session not found")


@router.post("/sessions/{session_id}")
async def update_session_endpoint(session_id: str, payload: dict):
    ws = workspace_manager.get_active_workspace()
    if not ws:
        raise HTTPException(status_code=400, detail="No active workspace")
    
    title = payload.get("title")
    history = payload.get("history")
    
    sessions_dir = Path(ws) / ".pixagent" / "sessions"
    session_file = sessions_dir / f"{session_id}.json"
    
    if not session_file.is_file():
        return await create_session({"id": session_id, "title": title or "Untitled Session", "history": history or []})
        
    try:
        with open(session_file, "r", encoding="utf-8") as fh:
            session_data = json.load(fh)
    except Exception:
        session_data = {"id": session_id, "title": "Untitled Session", "history": []}
        
    if title is not None:
        session_data["title"] = title
    if history is not None:
        session_data["history"] = history
        
    try:
        with open(session_file, "w", encoding="utf-8") as fh:
            json.dump(session_data, fh, indent=2, ensure_ascii=False)
            
        index_file = sessions_dir / "index.json"
        if index_file.is_file() and title is not None:
            with open(index_file, "r", encoding="utf-8") as fh:
                sessions = json.load(fh)
            for s in sessions:
                if s["id"] == session_id:
                    s["title"] = title
                    break
            with open(index_file, "w", encoding="utf-8") as fh:
                json.dump(sessions, fh, indent=2, ensure_ascii=False)
                
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    ws = workspace_manager.get_active_workspace()
    if not ws:
        raise HTTPException(status_code=400, detail="No active workspace")
        
    sessions_dir = Path(ws) / ".pixagent" / "sessions"
    session_file = sessions_dir / f"{session_id}.json"
    if session_file.is_file():
        try:
            session_file.unlink()
        except Exception:
            pass
            
    index_file = sessions_dir / "index.json"
    if index_file.is_file():
        try:
            with open(index_file, "r", encoding="utf-8") as fh:
                sessions = json.load(fh)
            sessions = [s for s in sessions if s["id"] != session_id]
            with open(index_file, "w", encoding="utf-8") as fh:
                json.dump(sessions, fh, indent=2, ensure_ascii=False)
        except Exception:
            pass
            
    return {"success": True}


@router.post("/sessions/{session_id}/export")
async def export_session(session_id: str):
    ws = workspace_manager.get_active_workspace()
    if not ws:
        raise HTTPException(status_code=400, detail="No active workspace")
        
    session_file = Path(ws) / ".pixagent" / "sessions" / f"{session_id}.json"
    if not session_file.is_file():
        raise HTTPException(status_code=404, detail="Session not found")
        
    try:
        with open(session_file, "r", encoding="utf-8") as fh:
            data = json.load(fh)
            
        title = data.get("title", "Exported Session")
        history = data.get("history", [])
        
        safe_title = "".join(c for c in title if c.isalnum() or c in (" ", "-", "_")).rstrip()
        safe_title = safe_title.replace(" ", "_")
        
        export_dir = Path(ws) / "exports"
        export_dir.mkdir(exist_ok=True)
        
        md_file = export_dir / f"{safe_title}.md"
        
        md_content = f"# PIX Chat Session: {title}\n\n"
        md_content += f"Exported: {time.strftime('%Y-%m-%d %H:%M:%S')}\n"
        md_content += "--------------------------------------\n\n"
        
        for msg in history:
            role = msg.get("role", "user").upper()
            content = msg.get("content", "")
            md_content += f"### **{role}**\n\n{content}\n\n"
            md_content += "---\n\n"
            
        with open(md_file, "w", encoding="utf-8") as fh:
            fh.write(md_content)
            
        return {"success": True, "file": str(md_file)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sessions/{session_id}/autotitle")
async def autotitle_session(session_id: str, payload: dict):
    ws = workspace_manager.get_active_workspace()
    if not ws:
        raise HTTPException(status_code=400, detail="No active workspace")

    first_message = payload.get("first_message", "")
    model = payload.get("model")
    if not first_message:
        return {"success": True, "title": "New Session"}

    prompt = f"""Summarize the following user coding request into a short, concise title (max 5 words). Do not include quotes or punctuation:
"{first_message}"
Title:"""

    try:
        title_res = await chat_completion([ChatMessage(role="user", content=prompt)], model=model)
        title = title_res.strip().strip('"').strip("'")
        await update_session_endpoint(session_id, {"title": title})
        return {"success": True, "title": title}
    except Exception:
        return {"success": True, "title": "New Session"}


# ─── Session Tags ────────────────────────────────────────────────────────────

@router.patch("/sessions/{session_id}/tags")
async def update_session_tags(session_id: str, payload: dict):
    """Replace the tag list for a session (e.g. ['#bug', '#frontend'])."""
    ws = workspace_manager.get_active_workspace()
    if not ws:
        raise HTTPException(status_code=400, detail="No active workspace")

    tags = payload.get("tags", [])
    sessions_dir = Path(ws) / ".pixagent" / "sessions"
    session_file = sessions_dir / f"{session_id}.json"
    if not session_file.is_file():
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        with open(session_file, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        data["tags"] = tags
        with open(session_file, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)

        # Mirror to index
        index_file = sessions_dir / "index.json"
        if index_file.is_file():
            with open(index_file, "r", encoding="utf-8") as fh:
                sessions = json.load(fh)
            for s in sessions:
                if s["id"] == session_id:
                    s["tags"] = tags
                    break
            with open(index_file, "w", encoding="utf-8") as fh:
                json.dump(sessions, fh, indent=2, ensure_ascii=False)

        return {"success": True, "tags": tags}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Session Archive / Unarchive ─────────────────────────────────────────────

@router.post("/sessions/{session_id}/archive")
async def archive_session(session_id: str):
    return await _set_session_archived(session_id, archived=True)


@router.post("/sessions/{session_id}/unarchive")
async def unarchive_session(session_id: str):
    return await _set_session_archived(session_id, archived=False)


async def _set_session_archived(session_id: str, archived: bool) -> dict:
    ws = workspace_manager.get_active_workspace()
    if not ws:
        raise HTTPException(status_code=400, detail="No active workspace")

    sessions_dir = Path(ws) / ".pixagent" / "sessions"
    session_file = sessions_dir / f"{session_id}.json"
    if not session_file.is_file():
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        with open(session_file, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        data["archived"] = archived
        with open(session_file, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)

        index_file = sessions_dir / "index.json"
        if index_file.is_file():
            with open(index_file, "r", encoding="utf-8") as fh:
                sessions = json.load(fh)
            for s in sessions:
                if s["id"] == session_id:
                    s["archived"] = archived
                    break
            with open(index_file, "w", encoding="utf-8") as fh:
                json.dump(sessions, fh, indent=2, ensure_ascii=False)

        return {"success": True, "archived": archived}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Session Search ──────────────────────────────────────────────────────────

@router.get("/sessions/search")
async def search_sessions(q: str = ""):
    """Return sessions whose title or tags contain *q* (case-insensitive)."""
    ws = workspace_manager.get_active_workspace()
    if not ws:
        return {"success": True, "sessions": []}

    sessions_dir = Path(ws) / ".pixagent" / "sessions"
    index_file = sessions_dir / "index.json"
    if not index_file.is_file():
        return {"success": True, "sessions": []}

    try:
        with open(index_file, "r", encoding="utf-8") as fh:
            sessions = json.load(fh)

        if not q:
            return {"success": True, "sessions": sessions}

        q_lower = q.lower()
        matched = []
        for s in sessions:
            title_hit = q_lower in s.get("title", "").lower()
            tags_hit  = any(q_lower in t.lower() for t in s.get("tags", []))
            if title_hit or tags_hit:
                matched.append(s)

        return {"success": True, "sessions": matched}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Session Fork (branching) ────────────────────────────────────────────────

@router.post("/sessions/{session_id}/fork")
async def fork_session(session_id: str, payload: dict):
    """Fork a session at *message_index*, creating a new branch session."""
    ws = workspace_manager.get_active_workspace()
    if not ws:
        raise HTTPException(status_code=400, detail="No active workspace")

    message_index: int = payload.get("message_index", -1)
    fork_title: str    = payload.get("title", "")

    sessions_dir = Path(ws) / ".pixagent" / "sessions"
    source_file  = sessions_dir / f"{session_id}.json"
    if not source_file.is_file():
        raise HTTPException(status_code=404, detail="Source session not found")

    try:
        with open(source_file, "r", encoding="utf-8") as fh:
            source_data = json.load(fh)

        history = source_data.get("history", [])
        if message_index >= 0:
            history = history[: message_index + 1]

        fork_id    = str(uuid.uuid4())
        source_title = source_data.get("title", "Session")
        new_title  = fork_title or f"Fork of {source_title}"

        fork_data = {
            "id":         fork_id,
            "title":      new_title,
            "history":    history,
            "tags":       list(source_data.get("tags", [])),
            "archived":   False,
            "parentId":   session_id,
            "branchFrom": {"sessionId": session_id, "messageIndex": message_index},
            "createdAt":  int(time.time() * 1000),
        }

        fork_file = sessions_dir / f"{fork_id}.json"
        with open(fork_file, "w", encoding="utf-8") as fh:
            json.dump(fork_data, fh, indent=2, ensure_ascii=False)

        index_file = sessions_dir / "index.json"
        sessions   = []
        if index_file.is_file():
            with open(index_file, "r", encoding="utf-8") as fh:
                sessions = json.load(fh)

        sessions.insert(0, {
            "id":        fork_id,
            "title":     new_title,
            "tags":      fork_data["tags"],
            "archived":  False,
            "parentId":  session_id,
            "createdAt": fork_data["createdAt"],
        })
        with open(index_file, "w", encoding="utf-8") as fh:
            json.dump(sessions, fh, indent=2, ensure_ascii=False)

        return {"success": True, "session": fork_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))





