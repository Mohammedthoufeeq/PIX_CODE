import React, { useState, useEffect } from 'react';
import { X, Folder, ArrowUp, HardDrive, Home, Search, Loader2 } from 'lucide-react';
import * as api from '../api/client';
import toast from 'react-hot-toast';

interface FolderBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

const FolderBrowserModal: React.FC<FolderBrowserModalProps> = ({ isOpen, onClose, onSelect }) => {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [dirs, setDirs] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [pathInput, setPathInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Quick Links
  const quickLinks = [
    { label: 'Gemini Scratch', path: 'C:\\Users\\MohamedThoufeeq\\.gemini\\antigravity\\scratch', icon: <HardDrive size={13} className="text-[#b026ff]" /> },
    { label: 'User Home', path: 'C:\\Users\\MohamedThoufeeq', icon: <Home size={13} className="text-[#00f0ff]" /> },
    { label: 'C Drive', path: 'C:\\', icon: <HardDrive size={13} className="text-[#8b949e]" /> }
  ];

  const loadPath = async (targetPath: string) => {
    setIsLoading(true);
    try {
      const res = await api.listDirs(targetPath);
      if (res.success && res.data) {
        setCurrentPath(res.data.current_path);
        setParentPath(res.data.parent_path);
        setDirs(res.data.dirs || []);
        setPathInput(res.data.current_path);
        setSearchQuery('');
      } else {
        toast.error(res.error || 'Failed to open directory');
      }
    } catch {
      toast.error('Network error loading folder');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPath('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredDirs = dirs.filter((d) =>
    d.split(/[/\\]/).pop()?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleGoUp = () => {
    if (parentPath) {
      loadPath(parentPath);
    }
  };

  const handleSelect = () => {
    if (currentPath) {
      onSelect(currentPath);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="glass-panel w-full max-w-3xl h-[520px] rounded-2xl border border-[#ffffff0a] flex flex-col overflow-hidden shadow-2xl relative">
        
        {/* Glow Accent */}
        <div className="absolute -top-[100px] -right-[100px] w-64 h-64 bg-[#00f0ff]/10 rounded-full blur-[80px] -z-10 mix-blend-screen pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#ffffff0a] bg-black/20">
          <div className="flex items-center gap-2">
            <Folder size={18} className="text-[#00f0ff] animate-pulse" />
            <h2 className="text-sm font-bold font-['Space_Grotesk'] text-white uppercase tracking-wider">
              Initialize Neural Link Location
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[#8b949e] hover:text-[#00f0ff] hover:bg-[#ffffff05] transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Quick Links Sidebar */}
          <div className="w-[180px] bg-black/45 border-r border-[#ffffff0a] p-3 flex flex-col gap-1.5 overflow-y-auto">
            <span className="text-[9px] font-bold text-[#b026ff] uppercase tracking-wider px-2 mb-2 font-code">Quick Links</span>
            {quickLinks.map((link, idx) => (
              <button
                key={idx}
                onClick={() => loadPath(link.path)}
                className="w-full flex items-center gap-2 px-2.5 py-2 text-left rounded-lg text-xs text-[#8b949e] hover:text-white hover:bg-[#ffffff05] border border-transparent hover:border-[#ffffff05] transition-all font-['Space_Grotesk'] font-medium"
              >
                {link.icon}
                <span className="truncate">{link.label}</span>
              </button>
            ))}
          </div>

          {/* Directory Content Area */}
          <div className="flex-1 flex flex-col p-4 overflow-hidden bg-black/10">
            
            {/* Path Input and Up Button */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={handleGoUp}
                disabled={!parentPath || isLoading}
                className="p-2.5 bg-[#ffffff02] border border-[#ffffff10] text-[#8b949e] hover:text-[#00f0ff] hover:border-[#00f0ff]/30 disabled:opacity-30 rounded-xl transition-all"
                title="Go up a directory"
              >
                <ArrowUp size={14} />
              </button>
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={pathInput}
                  onChange={(e) => setPathInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') loadPath(pathInput);
                  }}
                  placeholder="Enter custom path..."
                  className="w-full bg-black/40 text-[#e6edf3] text-xs font-code px-4 py-2.5 rounded-xl border border-[#ffffff10] focus:border-[#00f0ff]/50 focus:ring-0 outline-none transition-all"
                />
              </div>
            </div>

            {/* Folder Filter Search */}
            <div className="relative mb-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter directories..."
                className="w-full bg-black/25 text-[#8b949e] text-[11px] font-['Space_Grotesk'] pl-8 pr-4 py-1.5 rounded-lg border border-[#ffffff05] focus:border-[#00f0ff]/30 focus:ring-0 outline-none transition-all"
              />
              <Search size={11} className="absolute left-2.5 top-2.5 text-[#484f58]" />
            </div>

            {/* Directory List */}
            <div className="flex-grow overflow-y-auto scrollbar-thin space-y-1 bg-black/15 border border-[#ffffff05] rounded-xl p-2">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <Loader2 size={24} className="text-[#00f0ff] animate-spin" />
                  <span className="text-[10px] text-[#8b949e] font-code uppercase">Accessing Filesystem...</span>
                </div>
              ) : filteredDirs.length === 0 ? (
                <div className="text-[10px] text-[#484f58] italic p-6 text-center font-code">
                  No child directories found.
                </div>
              ) : (
                filteredDirs.map((dir, idx) => {
                  const dirName = dir.split(/[/\\]/).pop() || dir;
                  return (
                    <button
                      key={idx}
                      onDoubleClick={() => loadPath(dir)}
                      onClick={() => setPathInput(dir)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-all border ${
                        pathInput === dir
                          ? 'bg-[#00f0ff]/5 border-[#00f0ff]/20 text-[#00f0ff]'
                          : 'bg-transparent border-transparent hover:bg-[#ffffff05] text-[#8b949e] hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Folder size={13} className={pathInput === dir ? 'text-[#00f0ff]' : 'text-[#8b949e]'} />
                        <span className="truncate font-['Space_Grotesk'] font-medium">{dirName}</span>
                      </div>
                      <span className="text-[9px] font-code text-[#484f58] uppercase opacity-0 group-hover:opacity-100 transition-opacity">
                        Double-Click to Enter
                      </span>
                    </button>
                  );
                })
              )}
            </div>

          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-[#ffffff0a] bg-black/20 flex justify-between items-center">
          <div className="text-[10px] text-[#8b949e] font-code truncate max-w-[400px]">
            Selected: <span className="text-[#00f0ff]">{pathInput || currentPath}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-[#ffffff10] bg-[#ffffff02] hover:bg-[#ffffff05] text-xs font-bold font-['Space_Grotesk'] text-[#8b949e] hover:text-white rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSelect}
              disabled={isLoading}
              className="px-4 py-2 bg-[#00f0ff]/20 hover:bg-[#00f0ff]/40 text-[#00f0ff] border border-[#00f0ff]/50 text-xs font-bold font-['Space_Grotesk'] rounded-lg transition-all glow-blue flex items-center gap-2"
            >
              Confirm Workspace Link
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default FolderBrowserModal;
