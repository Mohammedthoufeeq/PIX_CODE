"""Project file indexing – scan, persist, and load a lightweight file index.

Also performs semantic symbol extraction:
  - Python  → ast module (classes, functions, methods)
  - TypeScript / JavaScript → regex-based (class, function, const arrow-fn, interface, type)
"""

from __future__ import annotations

import ast
import json
import os
import re
from pathlib import Path
from typing import Optional

from app.models import CodeSymbol, FileInfo, ProjectIndex
from app.safety import is_binary_file, load_gitignore, load_pixignore, should_ignore


_INDEX_RELPATH = ".pixagent/index.json"

# ── Language detection ──────────────────────────────────────────────────────

_PYTHON_EXTS  = {".py"}
_TS_JS_EXTS   = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
_MAX_SYMBOL_FILE_SIZE = 200 * 1024  # skip huge files for symbol extraction


# ── Symbol extractors ───────────────────────────────────────────────────────

def _extract_python_symbols(source: str, rel_path: str) -> list[CodeSymbol]:
    """Extract top-level and nested class/function definitions from Python source."""
    symbols: list[CodeSymbol] = []
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return symbols

    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            symbols.append(CodeSymbol(
                name=node.name,
                kind="class",
                file_path=rel_path,
                line=node.lineno,
                signature=f"class {node.name}",
            ))
            # methods inside the class
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    args = [a.arg for a in item.args.args]
                    symbols.append(CodeSymbol(
                        name=item.name,
                        kind="method",
                        file_path=rel_path,
                        line=item.lineno,
                        signature=f"def {item.name}({', '.join(args)})",
                    ))

        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            # only top-level functions (not already captured as methods)
            args = [a.arg for a in node.args.args]
            prefix = "async def" if isinstance(node, ast.AsyncFunctionDef) else "def"
            symbols.append(CodeSymbol(
                name=node.name,
                kind="function",
                file_path=rel_path,
                line=node.lineno,
                signature=f"{prefix} {node.name}({', '.join(args)})",
            ))

    return symbols


# Regex patterns for TypeScript / JavaScript
_TS_CLASS_RE      = re.compile(r"^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)", re.M)
_TS_INTERFACE_RE  = re.compile(r"^(?:export\s+)?interface\s+(\w+)", re.M)
_TS_TYPE_RE       = re.compile(r"^(?:export\s+)?type\s+(\w+)\s*=", re.M)
_TS_FUNCTION_RE   = re.compile(
    r"^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)", re.M
)
_TS_ARROW_CONST_RE = re.compile(
    r"^(?:export\s+)?const\s+(\w+)\s*(?::\s*\S+)?\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>", re.M
)


def _extract_ts_js_symbols(source: str, rel_path: str) -> list[CodeSymbol]:
    symbols: list[CodeSymbol] = []
    lines = source.splitlines(keepends=True)

    def _line_of(pos: int) -> int:
        return source[:pos].count("\n") + 1

    for m in _TS_CLASS_RE.finditer(source):
        symbols.append(CodeSymbol(
            name=m.group(1), kind="class",
            file_path=rel_path, line=_line_of(m.start()),
            signature=f"class {m.group(1)}",
        ))
    for m in _TS_INTERFACE_RE.finditer(source):
        symbols.append(CodeSymbol(
            name=m.group(1), kind="interface",
            file_path=rel_path, line=_line_of(m.start()),
            signature=f"interface {m.group(1)}",
        ))
    for m in _TS_TYPE_RE.finditer(source):
        symbols.append(CodeSymbol(
            name=m.group(1), kind="type",
            file_path=rel_path, line=_line_of(m.start()),
            signature=f"type {m.group(1)}",
        ))
    for m in _TS_FUNCTION_RE.finditer(source):
        symbols.append(CodeSymbol(
            name=m.group(1), kind="function",
            file_path=rel_path, line=_line_of(m.start()),
            signature=f"function {m.group(1)}({m.group(2).strip()})",
        ))
    for m in _TS_ARROW_CONST_RE.finditer(source):
        symbols.append(CodeSymbol(
            name=m.group(1), kind="function",
            file_path=rel_path, line=_line_of(m.start()),
            signature=f"const {m.group(1)} = ({m.group(2).strip()}) =>",
        ))

    return symbols


def _extract_symbols(fpath: Path, rel_path: str) -> list[CodeSymbol]:
    """Dispatch to the correct extractor based on file extension."""
    ext = fpath.suffix.lower()
    if ext not in _PYTHON_EXTS and ext not in _TS_JS_EXTS:
        return []
    if fpath.stat().st_size > _MAX_SYMBOL_FILE_SIZE:
        return []
    try:
        source = fpath.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []

    if ext in _PYTHON_EXTS:
        return _extract_python_symbols(source, rel_path)
    return _extract_ts_js_symbols(source, rel_path)


# ── Public API ──────────────────────────────────────────────────────────────

async def index_project(workspace_root: str) -> ProjectIndex:
    """Walk *workspace_root*, build a :class:`ProjectIndex` with files + symbols."""
    ws = Path(workspace_root).resolve()
    git_spec = load_gitignore(workspace_root)
    pix_spec = load_pixignore(workspace_root)

    files:   list[FileInfo]   = []
    symbols: list[CodeSymbol] = []

    for root, dirs, filenames in os.walk(ws):
        dirs[:] = [
            d for d in dirs
            if not should_ignore(str(Path(root) / d), workspace_root, git_spec, pix_spec)
        ]
        for fname in filenames:
            fpath = Path(root) / fname
            if should_ignore(str(fpath), workspace_root, git_spec, pix_spec):
                continue
            if is_binary_file(str(fpath)):
                continue
            try:
                stat = fpath.stat()
                rel  = str(fpath.relative_to(ws)).replace("\\", "/")
                files.append(FileInfo(
                    path=rel,
                    extension=fpath.suffix,
                    size=stat.st_size,
                    last_modified=stat.st_mtime,
                ))
                symbols.extend(_extract_symbols(fpath, rel))
            except OSError:
                continue

    index = ProjectIndex(files=files, symbols=symbols)
    save_index(index, workspace_root)
    return index


def save_index(index: ProjectIndex, workspace_root: str) -> None:
    """Persist *index* to ``.pixagent/index.json``."""
    ws   = Path(workspace_root).resolve()
    dest = ws / _INDEX_RELPATH
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(index.model_dump_json(indent=2), encoding="utf-8")


def load_index(workspace_root: str) -> Optional[ProjectIndex]:
    """Load an existing index or return ``None``."""
    ws  = Path(workspace_root).resolve()
    src = ws / _INDEX_RELPATH
    if not src.is_file():
        return None
    try:
        data = json.loads(src.read_text(encoding="utf-8"))
        return ProjectIndex(**data)
    except Exception:
        return None


def build_symbol_preamble(index: ProjectIndex, max_symbols: int = 300) -> str:
    """Format the symbol index as a compact preamble for the agent system prompt."""
    if not index.symbols:
        return ""
    lines = ["Code Symbol Index (file:line → kind name):"]
    for sym in index.symbols[:max_symbols]:
        lines.append(f"  {sym.file_path}:{sym.line}  [{sym.kind}]  {sym.signature}")
    if len(index.symbols) > max_symbols:
        lines.append(f"  ... and {len(index.symbols) - max_symbols} more symbols.")
    return "\n".join(lines)
