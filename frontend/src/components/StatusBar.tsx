import React, { useState, useEffect } from 'react';
import {
  Terminal,
  GitBranch,
  Cpu,
  Wifi,
  WifiOff,
  ChevronUp,
  Zap,
  FolderOpen,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

const StatusBar: React.FC = () => {
  const {
    currentProject,
    gitBranch,
    selectedModel,
    showTerminal,
    setShowTerminal,
    contextFiles,
    isLoading,
  } = useAppStore();

  const [isConnected, setIsConnected] = useState(true);

  // Simple connectivity check
  useEffect(() => {
    async function checkConnection() {
      try {
        const res = await fetch('/api/project/recent', { method: 'GET' });
        setIsConnected(res.ok);
      } catch {
        setIsConnected(false);
      }
    }

    checkConnection();
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-between px-3 py-[5px] bg-[#161b22] border-t border-[#30363d] select-none">
      {/* Left */}
      <div className="flex items-center gap-3">
        {/* Connection Status */}
        <div className="flex items-center gap-1.5">
          {isConnected ? (
            <>
              <Wifi size={11} className="text-[#3fb950]" />
              <span className="text-[10px] text-[#3fb950]">Connected</span>
            </>
          ) : (
            <>
              <WifiOff size={11} className="text-[#f85149]" />
              <span className="text-[10px] text-[#f85149]">Disconnected</span>
            </>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-3 bg-[#30363d]" />

        {/* Workspace */}
        {currentProject && (
          <div className="flex items-center gap-1.5 text-[10px] text-[#8b949e]">
            <FolderOpen size={11} />
            <span className="font-mono max-w-[200px] truncate">
              {currentProject.split(/[/\\]/).pop()}
            </span>
          </div>
        )}

        {/* Branch */}
        {gitBranch && (
          <>
            <div className="w-px h-3 bg-[#30363d]" />
            <div className="flex items-center gap-1.5 text-[10px] text-[#8b949e]">
              <GitBranch size={11} className="text-[#3fb950]" />
              <span className="font-mono">{gitBranch}</span>
            </div>
          </>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#58a6ff] pulse-badge" />
            <span className="text-[10px] text-[#58a6ff]">Processing</span>
          </div>
        )}

        {/* Context Files */}
        {contextFiles.length > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-[#8b949e]">
            <Zap size={10} className="text-[#d29922]" />
            <span>{contextFiles.length} context</span>
          </div>
        )}

        {/* Model */}
        <div className="flex items-center gap-1.5 text-[10px] text-[#8b949e]">
          <Cpu size={11} />
          <span className="font-mono">{selectedModel}</span>
        </div>

        {/* Separator */}
        <div className="w-px h-3 bg-[#30363d]" />

        {/* Terminal Toggle */}
        <button
          onClick={() => setShowTerminal(!showTerminal)}
          className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
            showTerminal
              ? 'text-[#58a6ff] bg-[#1f6feb22]'
              : 'text-[#8b949e] hover:text-[#c9d1d9]'
          }`}
        >
          {showTerminal ? <ChevronUp size={10} /> : <Terminal size={10} />}
          Terminal
        </button>
      </div>
    </div>
  );
};

export default StatusBar;
