import React, { useState, useRef, useEffect } from 'react';
import { FolderOpen, Folder, ChevronDown, Zap } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import * as api from '../api/client';
import toast from 'react-hot-toast';

const ProjectSelector: React.FC = () => {
  const {
    currentProject,
    recentProjects,
    setCurrentProject,
    setProjectTree,
    setRecentProjects,
    addTerminalOutput,
  } = useAppStore();

  const [inputPath, setInputPath] = useState(currentProject || '');
  const [showRecent, setShowRecent] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadRecentProjects();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowRecent(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function loadRecentProjects() {
    const res = await api.getRecentProjects();
    if (res.success && res.data) {
      setRecentProjects(res.data);
    }
  }

  async function handleBrowse() {
    try {
      const res = await api.browseProject();
      if (res.success && res.data?.path) {
        setInputPath(res.data.path);
        openProject(res.data.path);
      }
    } catch (err) {
      toast.error('Failed to open folder picker');
    }
  }

  async function openProject(path: string) {
    if (!path.trim()) {
      toast.error('Please enter a project path');
      return;
    }

    setIsOpening(true);
    addTerminalOutput(`[${new Date().toLocaleTimeString()}] Opening project: ${path}`);

    try {
      const selectRes = await api.selectProject(path.trim());
      if (!selectRes.success) {
        toast.error(selectRes.error || 'Failed to open project');
        addTerminalOutput(`[${new Date().toLocaleTimeString()}] ✗ Failed: ${selectRes.error}`);
        return;
      }

      setCurrentProject(path.trim());
      setInputPath(path.trim());
      toast.success('Project opened successfully');
      addTerminalOutput(`[${new Date().toLocaleTimeString()}] ✓ Project opened`);

      // Load tree
      const treeRes = await api.getProjectTree();
      if (treeRes.success && treeRes.data) {
        setProjectTree((treeRes.data as any).tree);
        addTerminalOutput(`[${new Date().toLocaleTimeString()}] ✓ File tree loaded`);
      }

      // Refresh recent
      await loadRecentProjects();

      // Index
      api.indexProject().then((res) => {
        if (res.success) {
          addTerminalOutput(`[${new Date().toLocaleTimeString()}] ✓ Project indexed`);
        }
      });
    } catch (err) {
      toast.error('Network error opening project');
    } finally {
      setIsOpening(false);
      setShowRecent(false);
    }
  }

  return (
    <div className="p-3 border-b border-[#30363d]">
      <div className="flex items-center gap-2 mb-2">
        <Zap size={16} className="text-[#58a6ff]" />
        <span className="text-xs font-semibold uppercase tracking-wider text-[#8b949e]">
          Project
        </span>
      </div>

      <div className="relative" ref={dropdownRef}>
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <input
              type="text"
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') openProject(inputPath);
              }}
              placeholder="/path/to/project"
              className="w-full bg-[#1c2128] text-[#e6edf3] text-xs px-3 py-2 rounded-md border border-[#30363d] focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 outline-none transition-all duration-200 placeholder:text-[#484f58] font-mono"
            />
            {recentProjects.length > 0 && (
              <button
                onClick={() => setShowRecent(!showRecent)}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-[#30363d] transition-colors"
              >
                <ChevronDown size={12} className="text-[#8b949e]" />
              </button>
            )}
          </div>
          <button
            onClick={handleBrowse}
            disabled={isOpening}
            className="px-2.5 py-2 bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] text-xs font-medium rounded-md border border-[#30363d] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center whitespace-nowrap"
            title="Browse Folder"
          >
            <Folder size={14} className="text-[#8b949e]" />
          </button>
          <button
            onClick={() => openProject(inputPath)}
            disabled={isOpening}
            className="px-3 py-2 bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-medium rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
          >
            {isOpening ? (
              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <FolderOpen size={12} />
            )}
            Open
          </button>
        </div>

        {showRecent && recentProjects.length > 0 && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-[#1c2128] border border-[#30363d] rounded-lg shadow-xl overflow-hidden animate-slide-down">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-[#8b949e] font-semibold border-b border-[#30363d]">
              Recent Projects
            </div>
            {recentProjects.map((p, i) => (
              <button
                key={i}
                onClick={() => {
                  setInputPath(p);
                  openProject(p);
                }}
                className="w-full text-left px-3 py-2 text-xs text-[#e6edf3] hover:bg-[#30363d] transition-colors font-mono truncate flex items-center gap-2"
              >
                <FolderOpen size={11} className="text-[#8b949e] flex-shrink-0" />
                <span className="truncate">{p}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {currentProject && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" />
          <span className="text-[10px] text-[#8b949e] truncate font-mono">
            {currentProject.split(/[/\\]/).pop()}
          </span>
        </div>
      )}
    </div>
  );
};

export default ProjectSelector;
