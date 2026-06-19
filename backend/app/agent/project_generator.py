"""Project Generator Agent – implements hierarchical spec-driven project generation

to build apps file-by-file and keep token usage low.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import AsyncGenerator

from app.llm_client import chat_completion
from app.models import ChatMessage
from app.diff_tools import generate_diff


SPEC_PROMPT = """You are an expert software architect.
The user wants to generate a new software project based on this prompt:
"{prompt}"

Your task is to plan the project structure and define a list of files to create.
Output your response as a valid JSON object containing:
1. "description": A brief architectural summary of the application.
2. "files": A list of relative file paths that need to be created.
3. "dependencies": A list of required packages/dependencies (e.g. requirements.txt or package.json contents).

Format your output *only* as a raw JSON block. Do not include markdown code block backticks.
Example Output:
{{
  "description": "FastAPI shortener...",
  "files": ["main.py", "database.py", "requirements.txt"],
  "dependencies": ["fastapi", "uvicorn", "sqlite3"]
}}
"""

FILE_PROMPT = """You are an expert software developer.
You are generating a file for a new project.
Project Goal: {prompt}
Project Architecture: {description}
Target File Path: {filepath}

Project Context (already generated files and their APIs):
{context_summary}

Write the complete code for this file. 
- Do not output any chat explanation.
- Return *only* the raw code contents for the file.
- If it is a config or requirements file, output the exact lines needed.
"""

CORRECTION_PROMPT = """You are an expert software developer.
You generated code for '{filepath}' that has a syntax error.

Syntax Error:
{error_msg}

Original Goal: {prompt}
Architecture: {description}

Here is the code you generated:
```{ext}
{code}
```

Please fix the syntax error and return the complete, corrected code.
- Do not output any chat explanation.
- Return *only* the raw code contents for the file.
"""

SUMMARY_PROMPT = """Analyze the following code for '{filepath}' and output a single short sentence (maximum 15 words) describing the main exports, classes, or functions it provides for other files to import.
Return ONLY the single sentence. Do not include markdown code block backticks or code blocks.

Code:
{code}
"""


def verify_syntax(content: str, filepath: str) -> str | None:
    """Check syntax of Python and JSON files locally. Return error string if failed, or None."""
    ext = Path(filepath).suffix.lower()
    if ext == ".py":
        try:
            compile(content, filepath, "exec")
            return None
        except SyntaxError as e:
            return f"SyntaxError on line {e.lineno}, offset {e.offset}: {e.msg}\nContext: {e.text}"
    elif ext == ".json":
        try:
            json.loads(content)
            return None
        except json.JSONDecodeError as e:
            return f"JSONDecodeError: {e.msg} at line {e.lineno}, column {e.colno}"
    return None


async def generate_project(prompt: str, workspace_root: str) -> AsyncGenerator[dict, None]:
    """Hierarchical spec-driven generation loop.
    
    1. Scan workspace for local specification markdown files.
    2. Check if a project spec already exists (resumability).
    3. Generate/refine the project spec (list of files).
    4. Save spec and yield status updates.
    5. Generate each file code one-by-one:
       - Inject API summaries of previously generated files (low-token caching).
       - Validate syntax (Python/JSON) locally.
       - Run self-correction loops on syntax failure.
       - Cache file signature/API summaries.
    6. Yield file diffs and complete response.
    """
    ws = Path(workspace_root).resolve()
    spec_file = ws / "project_spec.json"
    
    spec = None
    if spec_file.is_file():
        try:
            spec = json.loads(spec_file.read_text(encoding="utf-8"))
            yield {
                "type": "status",
                "content": "Found existing project_spec.json in workspace. Resuming project generation..."
            }
        except Exception:
            pass

    # Phase 1: Generate Spec if not resumed
    if not spec:
        yield {"type": "status", "content": "Analyzing workspace and planning project architecture..."}
        
        # Load local specs/markdown files
        md_contexts = []
        try:
            for p in ws.glob("*.md"):
                if p.name.lower() in ("readme.md", "project_spec.md") or len(md_contexts) < 3:
                    content = p.read_text(encoding="utf-8", errors="replace")
                    md_contexts.append(f"--- Local Spec File: {p.name} ---\n{content}\n")
        except Exception:
            pass
        
        local_spec_context = "\n".join(md_contexts)
        if local_spec_context:
            yield {
                "type": "status",
                "content": f"Found local reference files: {', '.join([p.name for p in ws.glob('*.md')])}. Incorporating into blueprint..."
            }
            spec_prompt = f"The workspace contains these specification files:\n{local_spec_context}\n\n" + SPEC_PROMPT.format(prompt=prompt)
        else:
            spec_prompt = SPEC_PROMPT.format(prompt=prompt)
            
        try:
            yield {"type": "thought", "content": "Drafting project structure blueprint..."}
            response = await chat_completion([ChatMessage(role="user", content=spec_prompt)])
            cleaned = re.sub(r"^```json|```$", "", response.strip(), flags=re.IGNORECASE).strip()
            spec = json.loads(cleaned)
        except Exception as e:
            yield {"type": "status", "content": f"Failed to generate project spec: {e}"}
            return

    description = spec.get("description", "Project generation")
    files_to_create = spec.get("files", [])
    
    yield {
        "type": "status", 
        "content": f"Architecture blueprint ready. Proposing {len(files_to_create)} files for generation..."
    }
    
    # Cache spec file
    try:
        spec_file.parent.mkdir(parents=True, exist_ok=True)
        spec_file.write_text(json.dumps(spec, indent=2), encoding="utf-8")
    except Exception:
        pass

    proposed_diffs = []
    
    # Phase 2: File-by-file generation loop
    for i, filepath in enumerate(files_to_create, start=1):
        target_path = ws / filepath
        
        # Resumability check
        if target_path.is_file() and target_path.stat().st_size > 0 and spec.get("summaries", {}).get(filepath):
            yield {
                "type": "status", 
                "content": f"✓ {filepath} already exists. Skipping."
            }
            try:
                existing_code = target_path.read_text(encoding="utf-8")
                diff_text = generate_diff(existing_code, existing_code, filepath)
                proposed_diffs.append({
                    "file_path": filepath,
                    "original": existing_code,
                    "modified": existing_code,
                    "diff": diff_text
                })
            except Exception:
                pass
            continue

        yield {"type": "status", "content": f"[{i}/{len(files_to_create)}] Generating code for {filepath}..."}
        
        # Smart Context Caching: collect summaries of already generated files
        context_summary = ""
        for f, s in spec.get("summaries", {}).items():
            if f != filepath:
                context_summary += f"- {f}: {s}\n"
                
        file_prompt = FILE_PROMPT.format(
            prompt=prompt,
            description=description,
            filepath=filepath,
            context_summary=context_summary or "No files generated yet."
        )
        
        try:
            yield {"type": "thought", "content": f"Writing clean code implementation for {filepath}..."}
            file_code = await chat_completion([ChatMessage(role="user", content=file_prompt)])
            cleaned_code = re.sub(r"^```[a-zA-Z]*\n|```$", "", file_code.strip()).strip()
            
            # Syntax Verification and Self-Correction Loop
            syntax_error = verify_syntax(cleaned_code, filepath)
            retries = 0
            while syntax_error and retries < 2:
                yield {
                    "type": "thought",
                    "content": f"Syntax warning for {filepath}:\n{syntax_error}\nRunning self-correction retry {retries+1}/2..."
                }
                ext_name = Path(filepath).suffix.lstrip(".") or "txt"
                correct_prompt = CORRECTION_PROMPT.format(
                    filepath=filepath,
                    error_msg=syntax_error,
                    prompt=prompt,
                    description=description,
                    ext=ext_name,
                    code=cleaned_code
                )
                try:
                    corrected_code_raw = await chat_completion([ChatMessage(role="user", content=correct_prompt)])
                    cleaned_code = re.sub(r"^```[a-zA-Z]*\n|```$", "", corrected_code_raw.strip()).strip()
                    syntax_error = verify_syntax(cleaned_code, filepath)
                except Exception as exc:
                    yield {"type": "status", "content": f"Self-correction failed: {exc}"}
                retries += 1

            # Save the file
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_text(cleaned_code, encoding="utf-8")
            
            # Compute diff for UI
            diff_text = generate_diff("", cleaned_code, filepath)
            latest_diff = {
                "file_path": filepath,
                "original": "",
                "modified": cleaned_code,
                "diff": diff_text
            }
            proposed_diffs.append(latest_diff)
            
            # Yield diff event immediately so UI shows Monaco editor update
            yield {
                "type": "diff",
                "content": f"Generated {filepath}",
                "diff": latest_diff
            }
            
            # Generate brief 1-sentence summary of the interface
            yield {"type": "thought", "content": f"Caching API exports for {filepath}..."}
            try:
                summary_prompt = SUMMARY_PROMPT.format(filepath=filepath, code=cleaned_code)
                summary_res = await chat_completion([ChatMessage(role="user", content=summary_prompt)])
                summary_text = summary_res.strip()
                summary_text = re.sub(r"^['\"`]|['\"`]$", "", summary_text).strip()
            except Exception:
                summary_text = f"Exposes module {filepath}"
                
            if "summaries" not in spec:
                spec["summaries"] = {}
            spec["summaries"][filepath] = summary_text
            
            # Save summaries back to project_spec.json
            try:
                spec_file.write_text(json.dumps(spec, indent=2), encoding="utf-8")
            except Exception:
                pass
            
            yield {
                "type": "status", 
                "content": f"✓ Successfully generated {filepath}."
            }
        except Exception as e:
            yield {"type": "status", "content": f"✗ Failed to generate {filepath}: {e}"}

    yield {
        "type": "status", 
        "content": f"🎉 Project generation complete! Generated {len(proposed_diffs)} files."
    }
    
    # Yield final answer
    yield {
        "type": "answer",
        "content": f"I have successfully generated your project! Here are the files created:\n" + \
                   "\n".join([f"- `{f}`" for f in files_to_create]) + \
                   "\n\nYou can review these files in your explorer panel."
    }
