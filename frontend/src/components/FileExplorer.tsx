import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileJson,
  FileText,
  FileType,
  ChevronRight,
  ChevronDown,
  BookmarkPlus,
  BookmarkMinus,
  Image,
  Braces,
  Hash,
  Cog,
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useAppStore, TreeNode } from '../store/useAppStore';
import * as api from '../api/client';
import toast from 'react-hot-toast';

const HIDDEN_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  '.next',
  '.cache',
  '.parcel-cache',
  '.turbo',
  '.svelte-kit',
]);

function getFileIcon(name: string, extension?: string) {
  const ext = extension || name.split('.').pop()?.toLowerCase() || '';
  const size = 14;
  const className = 'flex-shrink-0';

  switch (ext) {
    case 'ts':
    case 'tsx':
      return <FileCode size={size} className={`${className} text-[#3178c6]`} />;
    case 'js':
    case 'jsx':
      return <FileCode size={size} className={`${className} text-[#f7df1e]`} />;
    case 'py':
      return <FileCode size={size} className={`${className} text-[#3776ab]`} />;
    case 'json':
      return <FileJson size={size} className={`${className} text-[#cbcb41]`} />;
    case 'md':
    case 'mdx':
      return <FileText size={size} className={`${className} text-[#519aba]`} />;
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return <Hash size={size} className={`${className} text-[#563d7c]`} />;
    case 'html':
      return <Braces size={size} className={`${className} text-[#e34c26]`} />;
    case 'svg':
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'ico':
    case 'webp':
      return <Image size={size} className={`${className} text-[#a074c4]`} />;
    case 'yaml':
    case 'yml':
    case 'toml':
    case 'ini':
    case 'env':
      return <Cog size={size} className={`${className} text-[#8b949e]`} />;
    case 'rs':
      return <FileCode size={size} className={`${className} text-[#dea584]`} />;
    case 'go':
      return <FileCode size={size} className={`${className} text-[#00add8]`} />;
    case 'java':
    case 'kt':
      return <FileCode size={size} className={`${className} text-[#b07219]`} />;
    case 'rb':
      return <FileCode size={size} className={`${className} text-[#701516]`} />;
    case 'sh':
    case 'bash':
    case 'zsh':
      return <FileType size={size} className={`${className} text-[#89e051]`} />;
    default:
      return <File size={size} className={`${className} text-[#8b949e]`} />;
  }
}

// ─── Context Menu ───

interface CtxMenuState {
  x: number;
  y: number;
  node: TreeNode;
}

interface CtxMenuProps {
  menu: CtxMenuState;
  onClose: () => void;
  onRename: (node: TreeNode) => void;
  onDelete: (node: TreeNode) => void;
  onNewFile: (node: TreeNode) => void;
  onNewFolder: (node: TreeNode) => void;
}

const ContextMenu: React.FC<CtxMenuProps> = ({ menu, onClose, onRename, onDelete, onNewFile, onNewFolder }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const item = (icon: React.ReactNode, label: string, action: () => void, danger = false) => (
    <button
      onClick={() => { action(); onClose(); }}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors rounded ${
        danger ? 'text-[#f85149] hover:bg-[#f85149]/10' : 'text-[#c9d1d9] hover:bg-[#1c2128]'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] glass-panel border border-[#30363d] rounded-lg shadow-2xl py-1 overflow-hidden"
      style={{ top: menu.y, left: menu.x }}
    >
      {menu.node.type === 'directory' && (
        <>
          {item(<FilePlus size={12} />, 'New File', () => onNewFile(menu.node))}
          {item(<FolderPlus size={12} />, 'New Folder', () => onNewFolder(menu.node))}
          <div className="border-t border-[#30363d] my-1" />
        </>
      )}
      {item(<Pencil size={12} />, 'Rename', () => onRename(menu.node))}
      {item(<Trash2 size={12} />, 'Delete', () => onDelete(menu.node), true)}
    </div>
  );
};

// ─── Tree Item ───

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
  renamingPath: string | null;
  onRenameCommit: (node: TreeNode, newName: string) => void;
  onRenameCancel: () => void;
}

const TreeItem: React.FC<TreeItemProps> = ({
  node, depth, onContextMenu, renamingPath, onRenameCommit, onRenameCancel,
}) => {
  const [isExpanded, setIsExpanded] = useState(depth < 1);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const {
    selectedFile,
    setSelectedFile,
    setFileContent,
    contextFiles,
    addContextFile,
    removeContextFile,
    addTerminalOutput,
  } = useAppStore();

  const isDir = node.type === 'directory';
  const isSelected = selectedFile === node.path;
  const isContext = contextFiles.includes(node.path);
  const isRenaming = renamingPath === node.path;
  const filtered = isDir
    ? node.children?.filter((c) => !HIDDEN_DIRS.has(c.name)) || []
    : [];
  const sortedChildren = [...filtered].sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'directory' ? -1 : 1;
  });

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      // Select just the basename, not extension
      const name = node.name;
      const dotIdx = name.lastIndexOf('.');
      renameInputRef.current.setSelectionRange(0, dotIdx > 0 ? dotIdx : name.length);
    }
  }, [isRenaming, node.name]);

  const handleClick = useCallback(async () => {
    if (isRenaming) return;
    if (isDir) {
      setIsExpanded((v) => !v);
    } else {
      setSelectedFile(node.path);
      const res = await api.readFile(node.path);
      if (res.success && res.data) {
        setFileContent(res.data.content);
        addTerminalOutput(`[${new Date().toLocaleTimeString()}] Opened: ${node.path}`);
      } else {
        toast.error(res.error || 'Failed to read file');
        setFileContent(null);
      }
    }
  }, [isDir, isExpanded, node.path, isRenaming]);

  const handleContextToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isContext) {
        removeContextFile(node.path);
      } else {
        addContextFile(node.path);
      }
    },
    [isContext, node.path]
  );

  return (
    <div className="animate-fade-in">
      <div
        onClick={handleClick}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, node); }}
        className={`
          group flex items-center gap-1 px-2 py-[3px] cursor-pointer text-xs
          transition-all duration-150 rounded-[4px] mx-1
          ${isSelected ? 'bg-[#1f6feb33] text-[#e6edf3]' : 'text-[#c9d1d9] hover:bg-[#1c2128]'}
          ${isContext ? 'ring-1 ring-[#58a6ff]/30' : ''}
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isDir ? (
          <>
            <span className="flex-shrink-0 text-[#8b949e]">
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            {isExpanded ? (
              <FolderOpen size={14} className="flex-shrink-0 text-[#58a6ff]" />
            ) : (
              <Folder size={14} className="flex-shrink-0 text-[#8b949e]" />
            )}
          </>
        ) : (
          <>
            <span className="w-3 flex-shrink-0" />
            {getFileIcon(node.name, node.extension)}
          </>
        )}

        {isRenaming ? (
          <input
            ref={renameInputRef}
            defaultValue={node.name}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameCommit(node, (e.target as HTMLInputElement).value.trim());
              if (e.key === 'Escape') onRenameCancel();
            }}
            onBlur={(e) => onRenameCommit(node, e.target.value.trim())}
            className="flex-1 ml-1 bg-[#0d1117] border border-[#58a6ff]/60 rounded px-1 text-[11px] text-[#e6edf3] outline-none"
          />
        ) : (
          <span className="truncate ml-1 select-none">{node.name}</span>
        )}

        {!isDir && !isRenaming && (
          <button
            onClick={handleContextToggle}
            className={`
              ml-auto flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100
              transition-opacity duration-150
              ${isContext ? 'text-[#58a6ff] opacity-100' : 'text-[#8b949e] hover:text-[#58a6ff]'}
            `}
            title={isContext ? 'Remove from context' : 'Add to context'}
          >
            {isContext ? <BookmarkMinus size={12} /> : <BookmarkPlus size={12} />}
          </button>
        )}
      </div>

      {isDir && isExpanded && sortedChildren.length > 0 && (
        <div className="relative">
          {depth > 0 && (
            <div
              className="absolute top-0 bottom-0 border-l border-[#30363d20]"
              style={{ left: `${depth * 16 + 16}px` }}
            />
          )}
          {sortedChildren.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              onContextMenu={onContextMenu}
              renamingPath={renamingPath}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── File Explorer ───

const FileExplorer: React.FC = () => {
  const { projectTree, contextFiles, setProjectTree } = useAppStore();
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);

  async function refreshTree() {
    const res = await api.getProjectTree();
    if (res.success && res.data) {
      setProjectTree((res.data as any).tree);
    }
  }

  function openCtxMenu(e: React.MouseEvent, node: TreeNode) {
    e.preventDefault();
    // Clamp to viewport
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 150);
    setCtxMenu({ x, y, node });
  }

  async function handleDelete(node: TreeNode) {
    const confirmed = window.confirm(`Delete "${node.name}"? This cannot be undone.`);
    if (!confirmed) return;
    const res = await api.deleteFile(node.path);
    if (res.success) {
      toast.success(`Deleted: ${node.name}`);
      await refreshTree();
    } else {
      toast.error(res.error || 'Delete failed');
    }
  }

  function handleRename(node: TreeNode) {
    setRenamingPath(node.path);
  }

  async function handleRenameCommit(node: TreeNode, newName: string) {
    setRenamingPath(null);
    if (!newName || newName === node.name) return;

    // Build new path: replace last segment
    const parts = node.path.replace(/\\/g, '/').split('/');
    parts[parts.length - 1] = newName;
    const newPath = parts.join('/');

    const res = await api.renameFile(node.path, newPath);
    if (res.success) {
      toast.success(`Renamed to ${newName}`);
      await refreshTree();
    } else {
      toast.error(res.error || 'Rename failed');
    }
  }

  async function handleNewFile(dirNode: TreeNode) {
    const name = window.prompt('New file name:');
    if (!name) return;
    const newPath = `${dirNode.path.replace(/\\/g, '/')}/${name}`;
    const res = await api.createFile(newPath, false);
    if (res.success) {
      toast.success(`Created: ${name}`);
      await refreshTree();
    } else {
      toast.error(res.error || 'Create failed');
    }
  }

  async function handleNewFolder(dirNode: TreeNode) {
    const name = window.prompt('New folder name:');
    if (!name) return;
    const newPath = `${dirNode.path.replace(/\\/g, '/')}/${name}`;
    const res = await api.createFile(newPath, true);
    if (res.success) {
      toast.success(`Created folder: ${name}`);
      await refreshTree();
    } else {
      toast.error(res.error || 'Create failed');
    }
  }

  if (!projectTree) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <FolderOpen size={40} className="text-[#30363d] mb-3" />
        <p className="text-xs text-[#8b949e] leading-relaxed">
          Open a project to explore files
        </p>
      </div>
    );
  }

  const filteredChildren =
    projectTree.children?.filter((c) => !HIDDEN_DIRS.has(c.name)) || [];
  const sortedChildren = [...filteredChildren].sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'directory' ? -1 : 1;
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#30363d]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8b949e]">
          Explorer
        </span>
        <div className="flex items-center gap-1">
          {contextFiles.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#1f6feb33] text-[#58a6ff] font-medium">
              {contextFiles.length} ctx
            </span>
          )}
          <button
            onClick={() => handleNewFile(projectTree)}
            title="New file in root"
            className="p-0.5 rounded text-[#8b949e] hover:text-[#00f0ff] hover:bg-[#1c2128] transition-colors"
          >
            <FilePlus size={13} />
          </button>
          <button
            onClick={() => handleNewFolder(projectTree)}
            title="New folder in root"
            className="p-0.5 rounded text-[#8b949e] hover:text-[#00f0ff] hover:bg-[#1c2128] transition-colors"
          >
            <FolderPlus size={13} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
        {sortedChildren.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            depth={0}
            onContextMenu={openCtxMenu}
            renamingPath={renamingPath}
            onRenameCommit={handleRenameCommit}
            onRenameCancel={() => setRenamingPath(null)}
          />
        ))}
      </div>

      {ctxMenu && (
        <ContextMenu
          menu={ctxMenu}
          onClose={() => setCtxMenu(null)}
          onRename={handleRename}
          onDelete={handleDelete}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
        />
      )}
    </div>
  );
};

export default FileExplorer;
