"""Routes for project management – select workspace, index, tree, recent."""

from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/project", tags=["project"])

from app.indexing import index_project, load_index
from app.file_tools import get_project_tree
from app.models import ProjectSelectRequest, ProjectCreateRequest
import re
from pathlib import Path
from app.workspace import workspace_manager

def _ask_directory() -> str:
    """Open a native OS folder picker and return the selected path (empty string on cancel)."""
    import os
    if os.name == "nt":
        path = _ask_directory_win32_ifiledialog()
        if not path:
            path = _ask_directory_win32_shbrowse()
        return path
    # POSIX: no headless GUI – callers should use the web-based browser instead
    return ""


def _ask_directory_win32_ifiledialog() -> str:
    """Open the modern Vista/Win10/Win11 IFileOpenDialog via ctypes COM – no PowerShell needed."""
    import ctypes
    import ctypes.wintypes

    S_OK = 0
    CLSCTX_INPROC_SERVER = 1
    FOS_PICKFOLDERS = 0x20
    FOS_FORCEFILESYSTEM = 0x40
    SIGDN_FILESYSPATH = 0x80058000

    class GUID(ctypes.Structure):
        _fields_ = [
            ("Data1", ctypes.c_uint32),
            ("Data2", ctypes.c_uint16),
            ("Data3", ctypes.c_uint16),
            ("Data4", ctypes.c_uint8 * 8),
        ]

        @classmethod
        def from_str(cls, s: str) -> "GUID":
            s = s.strip("{}")
            parts = s.split("-")
            obj = cls()
            obj.Data1 = int(parts[0], 16)
            obj.Data2 = int(parts[1], 16)
            obj.Data3 = int(parts[2], 16)
            raw = bytes.fromhex(parts[3] + parts[4])
            for i, b in enumerate(raw):
                obj.Data4[i] = b
            return obj

    # FileOpenDialog CLSID; IFileDialog IID (not the Open-specific one –
    # we only need the base IFileDialog methods)
    CLSID_FileOpenDialog = GUID.from_str("{DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7}")
    IID_IFileDialog     = GUID.from_str("{42F85136-DB7E-439C-85F1-E4075D135FC8}")

    try:
        ole32 = ctypes.windll.ole32
        ole32.CoInitializeEx(None, 0)

        pDialog = ctypes.c_void_p()
        hr = ole32.CoCreateInstance(
            ctypes.byref(CLSID_FileOpenDialog),
            None,
            CLSCTX_INPROC_SERVER,
            ctypes.byref(IID_IFileDialog),
            ctypes.byref(pDialog),
        )
        if hr != S_OK or not pDialog.value:
            ole32.CoUninitialize()
            return ""

        # Resolve vtable (pointer-to-pointer-to-array-of-fn-ptrs)
        vtbl = ctypes.cast(
            ctypes.cast(pDialog, ctypes.POINTER(ctypes.c_void_p))[0],
            ctypes.POINTER(ctypes.c_void_p),
        )

        HRESULT = ctypes.c_long
        VOIDP   = ctypes.c_void_p

        # IFileDialog vtable layout (IUnknown 0-2, IModalWindow 3, IFileDialog 4+):
        #   9  = SetOptions
        #   3  = Show
        #   20 = GetResult
        _SetOptions = ctypes.WINFUNCTYPE(HRESULT, VOIDP, ctypes.c_uint32)
        _SetOptions(vtbl[9])(pDialog, FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM)

        _Show = ctypes.WINFUNCTYPE(HRESULT, VOIDP, ctypes.wintypes.HWND)
        hr = _Show(vtbl[3])(pDialog, None)

        path = ""
        if hr == S_OK:
            _GetResult = ctypes.WINFUNCTYPE(HRESULT, VOIDP, ctypes.POINTER(VOIDP))
            pItem = ctypes.c_void_p()
            hr = _GetResult(vtbl[20])(pDialog, ctypes.byref(pItem))

            if hr == S_OK and pItem.value:
                item_vtbl = ctypes.cast(
                    ctypes.cast(pItem, ctypes.POINTER(ctypes.c_void_p))[0],
                    ctypes.POINTER(ctypes.c_void_p),
                )
                # IShellItem vtable: 5 = GetDisplayName
                _GetDisplayName = ctypes.WINFUNCTYPE(
                    HRESULT, VOIDP, ctypes.c_uint32, ctypes.POINTER(ctypes.c_wchar_p)
                )
                wstr = ctypes.c_wchar_p()
                hr2 = _GetDisplayName(item_vtbl[5])(pItem, SIGDN_FILESYSPATH, ctypes.byref(wstr))
                if hr2 == S_OK and wstr.value:
                    path = wstr.value
                    ole32.CoTaskMemFree(wstr)
                # Release IShellItem (vtable index 2)
                _Rel = ctypes.WINFUNCTYPE(ctypes.c_ulong, VOIDP)
                _Rel(item_vtbl[2])(pItem)

        # Release IFileDialog
        _RelD = ctypes.WINFUNCTYPE(ctypes.c_ulong, VOIDP)
        _RelD(vtbl[2])(pDialog)

        ole32.CoUninitialize()
        return path

    except Exception as exc:
        logger.warning(f"IFileDialog picker error: {exc}")
        return ""


def _ask_directory_win32_shbrowse() -> str:
    """Fallback: classic SHBrowseForFolder dialog (Windows XP style)."""
    import ctypes
    import ctypes.wintypes

    MAX_PATH = 260

    class BROWSEINFO(ctypes.Structure):
        _fields_ = [
            ("hwndOwner",      ctypes.wintypes.HWND),
            ("pidlRoot",       ctypes.c_void_p),
            ("pszDisplayName", ctypes.c_wchar_p),
            ("lpszTitle",      ctypes.c_wchar_p),
            ("ulFlags",        ctypes.wintypes.UINT),
            ("lpfn",           ctypes.c_void_p),
            ("lParam",         ctypes.c_long),
            ("iImage",         ctypes.c_int),
        ]

    try:
        shell32 = ctypes.windll.shell32
        ole32   = ctypes.windll.ole32
        ole32.CoInitialize(None)

        buf = ctypes.create_unicode_buffer(MAX_PATH)
        bi  = BROWSEINFO()
        bi.pszDisplayName = buf
        bi.lpszTitle      = "Select Project Directory"
        # BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE
        bi.ulFlags = 0x00000001 | 0x00000040

        shell32.SHBrowseForFolderW.restype = ctypes.c_void_p
        pidl = shell32.SHBrowseForFolderW(ctypes.byref(bi))

        path = ""
        if pidl:
            path_buf = ctypes.create_unicode_buffer(MAX_PATH)
            shell32.SHGetPathFromIDListW(ctypes.c_void_p(pidl), path_buf)
            ole32.CoTaskMemFree(ctypes.c_void_p(pidl))
            path = path_buf.value

        ole32.CoUninitialize()
        return path

    except Exception as exc:
        logger.warning(f"SHBrowseForFolder picker error: {exc}")
        return ""


@router.post("/browse")
async def browse_directory() -> dict:
    """Open a native folder selection dialog and return the selected path."""
    logger.info("Opening system folder chooser dialog...")
    try:
        path = await run_in_threadpool(_ask_directory)
        if path:
            logger.info(f"User selected folder: {path}")
        else:
            logger.info("User cancelled folder browser.")
        return {"success": bool(path), "path": path}
    except Exception as exc:
        logger.error(f"Failed to open folder browser: {exc}")
        return {"success": False, "path": ""}


import os
import string

@router.get("/list-dirs")
async def list_directories(path: str = ""):
    """Returns subdirectories for the given path, or drives if empty on Windows."""
    if not path:
        # Try home directory as default
        home = str(Path.home())
        if os.path.exists(home):
            path = home
        else:
            if os.name == 'nt':
                drives = []
                for letter in string.ascii_uppercase:
                    drive_path = f"{letter}:\\"
                    if os.path.exists(drive_path):
                        drives.append(drive_path)
                return {"success": True, "current_path": "", "dirs": drives, "is_drives": True}
            else:
                path = "/"
            
    p = Path(path).resolve()
    if not p.is_dir():
        # Fallback to drives or parent if invalid
        raise HTTPException(status_code=400, detail=f"Path '{path}' is not a valid directory")
        
    try:
        subdirs = []
        for item in p.iterdir():
            try:
                if item.is_dir() and not item.name.startswith('.'):
                    subdirs.append(str(item))
            except PermissionError:
                # Skip directories with permission issues
                pass
        return {
            "success": True,
            "current_path": str(p),
            "parent_path": str(p.parent) if p.parent != p else None,
            "dirs": subdirs,
            "is_drives": False
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recent")
async def get_recent_projects() -> dict:
    """Return the list of recently opened projects."""
    return {"recent": workspace_manager.get_recent()}


@router.post("/select")
async def select_project(req: ProjectSelectRequest) -> dict:
    """Set a project directory as the active workspace."""
    logger.info(f"Selecting project path: {req.path}")
    success = workspace_manager.set_workspace(req.path)
    if not success:
        logger.error(f"Failed to select project. Invalid path: {req.path}")
        raise HTTPException(status_code=400, detail=f"Invalid workspace path: {req.path}")
    logger.info(f"Project selected successfully: {req.path}")
    return {
        "success": True,
        "workspace": workspace_manager.get_workspace(),
    }


@router.post("/create")
async def create_project(req: ProjectCreateRequest) -> dict:
    """Create a new project directory directly in the scratch folder."""
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Project name is required")
    
    # Safe name
    safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", name)
    scratch_root = Path("C:/Users/MohamedThoufeeq/.gemini/antigravity/scratch")
    project_dir = scratch_root / safe_name
    
    try:
        project_dir.mkdir(parents=True, exist_ok=True)
        success = workspace_manager.set_workspace(str(project_dir))
        if not success:
            raise HTTPException(status_code=400, detail="Failed to select the created project directory as workspace.")
        return {
            "success": True,
            "path": str(project_dir),
            "workspace": str(project_dir)
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create project directory: {exc}")


@router.get("/active")
async def get_active_project() -> dict:
    """Return the active workspace path or None."""
    try:
        ws = workspace_manager.get_workspace()
        return {"workspace": ws}
    except ValueError:
        return {"workspace": None}


@router.post("/index")
async def index_current_project() -> dict:
    """Index all files in the active workspace."""
    try:
        ws = workspace_manager.get_workspace()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    idx = await index_project(ws)
    return {
        "success": True,
        "total_files": len(idx.files),
        "files": [f.model_dump() for f in idx.files[:500]],  # cap response size
    }


@router.get("/tree")
async def get_tree(max_depth: int = 4) -> dict:
    """Return the project directory tree."""
    try:
        ws = workspace_manager.get_workspace()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    tree = get_project_tree(ws, max_depth=max_depth)
    return {"tree": tree}
