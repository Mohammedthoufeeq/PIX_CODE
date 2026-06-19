import React, { useState, useEffect, useRef } from 'react';
import { Folder, Monitor, ChevronDown, Plus, Cpu, Zap, Power, Disc, Loader2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import * as api from '../api/client';
import toast from 'react-hot-toast';

const CenteredDashboard: React.FC = () => {
  const {
    currentProject,
    recentProjects,
    setCurrentProject,
    setProjectTree,
    setRecentProjects,
    addTerminalOutput,
  } = useAppStore();

  const [scratchName, setScratchName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Load recent projects list
    api.getRecentProjects().then((res) => {
      if (res.success && res.data) {
        setRecentProjects(res.data);
      }
    });
  }, [setRecentProjects]);

  async function openProject(path: string) {
    if (!path.trim()) return;
    setIsProcessing(true);
    addTerminalOutput(`[${new Date().toLocaleTimeString()}] Opening workspace: ${path}`);
    try {
      const res = await api.selectProject(path.trim());
      if (res.success) {
        setCurrentProject(path.trim());
        toast.success('Workspace connected');
        addTerminalOutput(`[${new Date().toLocaleTimeString()}] ✓ Workspace connected`);

        const treeRes = await api.getProjectTree();
        if (treeRes.success && treeRes.data) {
          setProjectTree((treeRes.data as any).tree);
        }
        
        const recentRes = await api.getRecentProjects();
        if (recentRes.success && recentRes.data) {
          setRecentProjects(recentRes.data);
        }

        api.indexProject();
      } else {
        toast.error(res.error || 'Failed to open workspace');
      }
    } catch {
      toast.error('Network error opening workspace');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleBrowse() {
    setIsProcessing(true);
    try {
      const res = await api.browseProject();
      if (res.success && res.data?.path) {
        await openProject(res.data.path);
      }
    } catch {
      toast.error('Failed to open directory browser');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleCreateScratch() {
    const name = scratchName.trim() || `nexus_${Date.now()}`;
    setIsProcessing(true);
    addTerminalOutput(`[${new Date().toLocaleTimeString()}] Spawning sandbox: ${name}`);

    try {
      const createRes = await api.createProject(name);
      if (!createRes.success || !createRes.data) {
        toast.error(createRes.error || 'Failed to initialize sandbox');
        setIsProcessing(false);
        return;
      }

      setCurrentProject(createRes.data.workspace);
      
      const treeRes = await api.getProjectTree();
      if (treeRes.success && treeRes.data) {
        setProjectTree((treeRes.data as any).tree);
      }

      const recentRes = await api.getRecentProjects();
      if (recentRes.success && recentRes.data) {
        setRecentProjects(recentRes.data);
      }
      
      toast.success('Sandbox instantiated');
    } catch (err: any) {
      toast.error(`Spawn failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateScratch();
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-center items-center py-12 px-6 w-full text-[#e6edf3] select-none relative z-10">
      
      {/* Glow Centerpiece */}
      <div className="relative mb-12 animate-float flex flex-col items-center">
        <div className="absolute inset-0 bg-[#00f0ff] blur-[100px] opacity-20 rounded-full w-48 h-48 -z-10 mix-blend-screen" />
        <div className="absolute inset-0 bg-[#b026ff] blur-[120px] opacity-20 rounded-full w-56 h-56 -z-10 mix-blend-screen translate-y-8" />
        
        <div className="w-24 h-24 rounded-full glass-panel flex items-center justify-center neon-border-cyan mb-6 relative">
          <Cpu size={40} className="text-[#00f0ff] animate-pulse" />
          <div className="absolute inset-0 rounded-full border border-[#00f0ff]/30 animate-[spin_4s_linear_infinite]" />
        </div>
        
        <h1 className="text-4xl font-bold tracking-tighter mb-2 font-['Space_Grotesk']">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00f0ff] to-[#b026ff]">
            PIX COMMAND NEXUS
          </span>
        </h1>
        <p className="text-[#8b949e] font-code text-xs uppercase tracking-[0.2em] opacity-70">
          Awaiting Neural Link Initialization
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl animate-slide-up delay-100 relative z-20">
        
        {/* Action 1: Open Workspace */}
        <button
          onClick={handleBrowse}
          disabled={isProcessing}
          className="group flex flex-col items-center justify-center p-8 glass-card hover:neon-border-cyan transition-all duration-300 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#00f0ff]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="w-14 h-14 rounded-2xl bg-[#00f0ff]/10 flex items-center justify-center mb-5 group-hover:bg-[#00f0ff]/20 transition-colors border border-[#00f0ff]/20">
            <Disc size={28} className="text-[#00f0ff]" />
          </div>
          <h3 className="text-white font-bold mb-2 font-['Space_Grotesk'] tracking-wide">INITIALIZE LINK</h3>
          <p className="text-[#8b949e] text-xs text-center font-code opacity-80">Mount existing local directory</p>
        </button>

        {/* Action 2: Create Scratch */}
        <div className="flex flex-col p-6 glass-card hover:neon-border-violet transition-all duration-300 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-bl from-[#b026ff]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <div className="flex items-center gap-4 mb-6 relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-[#b026ff]/10 flex items-center justify-center border border-[#b026ff]/20">
              <Zap size={24} className="text-[#b026ff]" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm tracking-wide font-['Space_Grotesk']">SPAWN SANDBOX</h3>
              <p className="text-[#8b949e] text-[10px] font-code uppercase mt-1 opacity-80">Create isolated instance</p>
            </div>
          </div>
          
          <div className="relative mt-auto z-10">
            <input
              type="text"
              value={scratchName}
              onChange={(e) => setScratchName(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isProcessing}
              placeholder="instance_name (optional)"
              className="w-full bg-[#050505]/50 text-[#e5e5e5] text-xs font-code px-4 py-3 rounded-xl border border-[#ffffff10] focus:border-[#b026ff] focus:ring-1 focus:ring-[#b026ff]/50 outline-none placeholder:text-[#484f58] transition-all"
            />
            <button
              onClick={handleCreateScratch}
              disabled={isProcessing}
              className="absolute right-2 top-2 bottom-2 px-4 bg-[#b026ff]/20 hover:bg-[#b026ff]/40 border border-[#b026ff]/50 disabled:opacity-40 disabled:cursor-not-allowed text-[#e6edf3] text-xs font-bold rounded-lg transition-all flex items-center gap-2 font-['Space_Grotesk']"
            >
              {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
              EXECUTE
            </button>
          </div>
        </div>

      </div>

      {/* Recent Workspaces List */}
      {recentProjects.length > 0 && (
        <div className="mt-12 w-full max-w-3xl animate-slide-up delay-200">
          <div className="flex items-center gap-2 mb-4 px-2 opacity-70">
            <div className="w-2 h-2 rounded-full bg-[#00f0ff] animate-pulse" />
            <h3 className="text-[10px] font-bold text-[#00f0ff] uppercase tracking-[0.15em] font-code">
              Known Instances
            </h3>
          </div>
          
          <div className="glass-panel rounded-2xl overflow-hidden divide-y divide-[#ffffff0a]">
            {recentProjects.map((proj, idx) => (
              <button
                key={idx}
                onClick={() => openProject(proj)}
                disabled={isProcessing}
                className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-[#ffffff05] transition-all disabled:opacity-50 group"
              >
                <Monitor size={16} className="text-[#8b949e] group-hover:text-[#00f0ff] transition-colors flex-shrink-0" />
                <div className="truncate flex-1">
                  <span className="text-[#e6edf3] text-sm font-semibold tracking-wide font-['Space_Grotesk'] block truncate">{proj.split(/[/\\]/).pop()}</span>
                  <span className="text-[10px] text-[#484f58] group-hover:text-[#8b949e] transition-colors truncate block font-code mt-1">{proj}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

export default CenteredDashboard;
