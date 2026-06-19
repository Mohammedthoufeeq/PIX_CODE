import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare, Code, Plus, ChevronDown, Network, Trash2, Download,
  Terminal, Search, Tag, Archive, ArchiveRestore, GitBranch, X, Hash,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { SessionRecord } from '../api/client';
import ProjectSelector from './ProjectSelector';
import FileExplorer from './FileExplorer';
import * as api from '../api/client';
import toast from 'react-hot-toast';

// ─── Tag badge ───────────────────────────────────────────────────────────────

const TAG_COLORS: Record<string, string> = {
  '#bug':      'bg-red-500/15 text-red-400 border-red-500/30',
  '#feature':  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  '#refactor': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  '#docs':     'bg-amber-500/15 text-amber-400 border-amber-500/30',
  '#test':     'bg-violet-500/15 text-violet-400 border-violet-500/30',
};

const TagBadge: React.FC<{ tag: string; onRemove?: () => void }> = ({ tag, onRemove }) => {
  const colorCls = TAG_COLORS[tag] ?? 'bg-[#ffffff0a] text-[#8b949e] border-[#ffffff10]';
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold border ${colorCls} font-code`}>
      {tag}
      {onRemove && (
        <button onClick={onRemove} className="hover:opacity-70 transition-opacity ml-0.5">
          <X size={8} />
        </button>
      )}
    </span>
  );
};

// ─── Tag editor popover ───────────────────────────────────────────────────────

const PRESET_TAGS = ['#bug', '#feature', '#refactor', '#docs', '#test'];

const TagEditor: React.FC<{
  session: SessionRecord;
  onClose: () => void;
  onSave: (tags: string[]) => void;
}> = ({ session, onClose, onSave }) => {
  const [tags, setTags] = useState<string[]>(session.tags ?? []);
  const [custom, setCustom] = useState('');

  function toggle(tag: string) {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  }

  function addCustom() {
    const t = custom.trim().toLowerCase();
    if (!t) return;
    const tag = t.startsWith('#') ? t : `#${t}`;
    if (!tags.includes(tag)) setTags((prev) => [...prev, tag]);
    setCustom('');
  }

  return (
    <div className="absolute z-50 left-full top-0 ml-2 w-52 glass-panel rounded-xl p-3 shadow-2xl shadow-[#00f0ff]/10 border border-[#00f0ff]/20"
      onClick={(e) => e.stopPropagation()}>
      <p className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider mb-2 font-['Space_Grotesk']">Tags</p>
      <div className="flex flex-wrap gap-1 mb-2">
        {PRESET_TAGS.map((t) => (
          <button key={t}
            onClick={() => toggle(t)}
            className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${
              tags.includes(t) ? (TAG_COLORS[t] ?? 'bg-[#ffffff15] text-white border-white/20') : 'bg-transparent text-[#484f58] border-[#484f58]/30 hover:text-[#8b949e]'
            }`}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex gap-1 mb-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCustom()}
          placeholder="custom tag..."
          className="flex-1 bg-[#ffffff08] text-[#e6edf3] text-[10px] px-2 py-1 rounded border border-[#ffffff10] outline-none font-code placeholder:text-[#484f58]"
        />
        <button onClick={addCustom} className="px-2 py-1 rounded bg-[#00f0ff]/10 text-[#00f0ff] text-[10px] border border-[#00f0ff]/20 hover:bg-[#00f0ff]/20 transition-all">
          +
        </button>
      </div>
      <div className="flex gap-1 justify-end">
        <button onClick={onClose} className="px-2 py-1 rounded text-[10px] text-[#8b949e] hover:text-[#e6edf3] transition-colors">Cancel</button>
        <button onClick={() => { onSave(tags); onClose(); }} className="px-2 py-1 rounded bg-[#00f0ff]/10 text-[#00f0ff] text-[10px] border border-[#00f0ff]/20 hover:bg-[#00f0ff]/20 transition-all">Save</button>
      </div>
    </div>
  );
};

// ─── Session item ─────────────────────────────────────────────────────────────

const SessionItem: React.FC<{
  session: SessionRecord;
  isActive: boolean;
  depth?: number;
  onSelect: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onExport: (id: string, e: React.MouseEvent) => void;
  onArchive: (id: string) => void;
  onFork: (id: string) => void;
  onSaveTags: (id: string, tags: string[]) => void;
}> = ({ session, isActive, depth = 0, onSelect, onDelete, onExport, onArchive, onFork, onSaveTags }) => {
  const [showTagEditor, setShowTagEditor] = useState(false);
  const isBranch = Boolean(session.parentId);

  return (
    <div style={{ paddingLeft: depth * 12 }}>
      {isBranch && (
        <div className="flex items-center gap-1 pl-1 mb-0.5">
          <div className="w-px h-3 bg-[#b026ff]/40" />
          <div className="w-2 h-px bg-[#b026ff]/40" />
          <GitBranch size={9} className="text-[#b026ff]/60" />
        </div>
      )}
      <div
        onClick={() => onSelect(session.id)}
        className={`group relative flex flex-col px-3 py-2 rounded-xl border cursor-pointer transition-all duration-300 ${
          isActive
            ? 'bg-[#00f0ff]/5 border-[#00f0ff]/30 text-[#00f0ff]'
            : session.archived
            ? 'bg-transparent border-transparent hover:bg-[#ffffff03] text-[#484f58] hover:text-[#8b949e]'
            : 'bg-transparent border-transparent hover:bg-[#ffffff05] text-[#8b949e] hover:text-[#e6edf3]'
        }`}
      >
        {/* Title row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 truncate flex-grow min-w-0">
            <Terminal size={12} className={isActive ? 'text-[#00f0ff] shrink-0' : 'text-[#8b949e]/60 shrink-0'} />
            <span className="text-xs truncate font-['Space_Grotesk'] font-medium">
              {session.archived && <span className="text-[#484f58] mr-1">[arc]</span>}
              {session.title}
            </span>
          </div>

          {/* Action buttons (hover) */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={(e) => { e.stopPropagation(); setShowTagEditor((v) => !v); }}
              title="Tags" className="p-1 hover:bg-[#ffffff0a] text-[#8b949e] hover:text-[#00f0ff] rounded transition-all">
              <Tag size={10} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onFork(session.id); }}
              title="Fork session" className="p-1 hover:bg-[#ffffff0a] text-[#8b949e] hover:text-[#b026ff] rounded transition-all">
              <GitBranch size={10} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onArchive(session.id); }}
              title={session.archived ? 'Unarchive' : 'Archive'}
              className="p-1 hover:bg-[#ffffff0a] text-[#8b949e] hover:text-[#d29922] rounded transition-all">
              {session.archived ? <ArchiveRestore size={10} /> : <Archive size={10} />}
            </button>
            <button onClick={(e) => onExport(session.id, e)}
              title="Export" className="p-1 hover:bg-[#ffffff0a] text-[#8b949e] hover:text-[#00f0ff] rounded transition-all">
              <Download size={10} />
            </button>
            <button onClick={(e) => onDelete(session.id, e)}
              title="Delete" className="p-1 hover:bg-[#ffffff0a] text-[#8b949e] hover:text-red-400 rounded transition-all">
              <Trash2 size={10} />
            </button>
          </div>
        </div>

        {/* Tags row */}
        {(session.tags ?? []).length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-1 ml-[20px]">
            {(session.tags ?? []).map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </div>
        )}

        {/* Tag editor popover */}
        {showTagEditor && (
          <TagEditor
            session={session}
            onClose={() => setShowTagEditor(false)}
            onSave={(tags) => onSaveTags(session.id, tags)}
          />
        )}
      </div>
    </div>
  );
};

// ─── Main sidebar ─────────────────────────────────────────────────────────────

const Sidebar: React.FC = () => {
  const {
    sidebarTab,
    setSidebarTab,
    setCurrentProject,
    setSelectedFile,
    setFileContent,
    setProjectTree,
    clearChatMessages,
    addChatMessage,
    currentProject,
    chatSessions,
    currentSessionId,
    setChatSessions,
    setCurrentSessionId,
    updateSessionInList,
    addSessionToList,
  } = useAppStore();

  const [username, setUsername] = useState(() => localStorage.getItem('pix_username') || 'Mohamed');
  const [quote, setQuote] = useState('First, solve the problem. Then, write the code.');

  useEffect(() => {
    // Fetch quote on mount
    api.getMotivationalQuote().then((res) => {
      if (res.success && res.data?.quote) {
        setQuote(res.data.quote);
      }
    });

    // Poll every 5 minutes (300000ms) to check for hourly update
    const interval = setInterval(() => {
      api.getMotivationalQuote().then((res) => {
        if (res.success && res.data?.quote) {
          setQuote(res.data.quote);
        }
      });
    }, 300000);

    return () => clearInterval(interval);
  }, []);

  const handleProfileClick = () => {
    const newName = prompt('Enter your username:', username);
    if (newName && newName.trim()) {
      const trimmed = newName.trim();
      setUsername(trimmed);
      localStorage.setItem('pix_username', trimmed);
      toast.success(`Username updated to ${trimmed}`);
    }
  };

  const [searchQuery, setSearchQuery]     = useState('');
  const [showArchived, setShowArchived]   = useState(false);
  const [isSearching, setIsSearching]     = useState(false);
  const [searchResults, setSearchResults] = useState<SessionRecord[] | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (currentProject) {
      api.getSessions().then((res) => {
        if (res.success && res.data?.sessions) {
          setChatSessions(res.data.sessions as SessionRecord[]);
        }
      });
    }
  }, [currentProject, setChatSessions]);

  // Debounced search
  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      const res = await api.searchSessions(searchQuery);
      setSearchResults(res.success && res.data ? (res.data.sessions as SessionRecord[]) : []);
      setIsSearching(false);
    }, 300);
  }, [searchQuery]);

  async function refreshSessions() {
    const res = await api.getSessions();
    if (res.success && res.data?.sessions) {
      setChatSessions(res.data.sessions as SessionRecord[]);
    }
  }

  async function handleNewSession() {
    if (!currentProject) { toast.error('Initialize a workspace first!'); return; }
    const newId    = `session-${Date.now()}`;
    const newTitle = 'Untitled Neural Session';
    const res      = await api.createSession(newId, newTitle, []);
    if (res.success) {
      setCurrentSessionId(newId);
      clearChatMessages();
      await refreshSessions();
      toast.success('New channel opened');
    }
  }

  async function handleSelectSession(id: string) {
    setCurrentSessionId(id);
    const res = await api.getSession(id);
    if (res.success && res.data?.session) {
      clearChatMessages();
      res.data.session.history.forEach((msg: any) => addChatMessage(msg));
      toast.success(`Connected: ${res.data.session.title}`);
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Close and delete this session?')) return;
    const res = await api.deleteSession(id);
    if (res.success) {
      if (currentSessionId === id) { setCurrentSessionId(null); clearChatMessages(); }
      await refreshSessions();
      toast.success('Channel terminated');
    }
  }

  async function handleExport(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const res = await api.exportSession(id);
    if (res.success && res.data?.file) {
      toast.success(`Exported: ${res.data.file.split(/[/\\]/).pop()}`);
    } else {
      toast.error('Export failed');
    }
  }

  async function handleArchive(id: string) {
    const session = chatSessions.find((s) => s.id === id);
    if (!session) return;
    if (session.archived) {
      const res = await api.unarchiveSession(id);
      if (res.success) { updateSessionInList(id, { archived: false }); toast.success('Unarchived'); }
    } else {
      const res = await api.archiveSession(id);
      if (res.success) { updateSessionInList(id, { archived: true }); toast.success('Archived'); }
    }
  }

  async function handleFork(id: string) {
    const res = await api.forkSession(id, -1);
    if (res.success && res.data?.session) {
      addSessionToList(res.data.session as SessionRecord);
      toast.success('Session forked');
    } else {
      toast.error('Fork failed');
    }
  }

  async function handleSaveTags(id: string, tags: string[]) {
    const res = await api.updateSessionTags(id, tags);
    if (res.success) {
      updateSessionInList(id, { tags });
      toast.success('Tags saved');
    }
  }

  // Determine which sessions to show
  const displaySessions = (searchResults ?? chatSessions).filter((s) =>
    showArchived ? true : !s.archived
  );

  // Group into root sessions and their forks for the branch tree
  const roots  = displaySessions.filter((s) => !s.parentId);
  const byParent = displaySessions.reduce<Record<string, SessionRecord[]>>((acc, s) => {
    if (s.parentId) {
      (acc[s.parentId] ??= []).push(s);
    }
    return acc;
  }, {});

  function renderSession(session: SessionRecord, depth = 0): React.ReactNode {
    const children = byParent[session.id] ?? [];
    return (
      <React.Fragment key={session.id}>
        <SessionItem
          session={session}
          isActive={currentSessionId === session.id}
          depth={depth}
          onSelect={handleSelectSession}
          onDelete={handleDelete}
          onExport={handleExport}
          onArchive={handleArchive}
          onFork={handleFork}
          onSaveTags={handleSaveTags}
        />
        {children.map((child) => renderSession(child, depth + 1))}
      </React.Fragment>
    );
  }

  const archivedCount = chatSessions.filter((s) => s.archived).length;

  return (
    <div className="flex flex-col w-[280px] min-w-[280px] glass-panel border-r border-[#ffffff0a] h-full text-[#e6edf3] select-none z-20 shadow-2xl shadow-[#00f0ff]/5 relative">
      {/* Top gradient accent */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00f0ff]/50 to-transparent" />

      {/* Tab bar */}
      <div className="p-3 border-b border-[#ffffff0a] flex gap-1 bg-[#ffffff02]">
        {(['chat', 'cowork', 'code'] as const).map((tab) => {
          const isActive = sidebarTab === tab;
          const icons = {
            chat:   <MessageSquare size={14} className={isActive ? 'text-[#00f0ff]' : ''} />,
            cowork: <Network size={14}       className={isActive ? 'text-[#00f0ff]' : ''} />,
            code:   <Code size={14}          className={isActive ? 'text-[#00f0ff]' : ''} />,
          };
          return (
            <button key={tab} onClick={() => setSidebarTab(tab)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-semibold font-['Space_Grotesk'] transition-all duration-300 ${
                isActive
                  ? 'bg-[#00f0ff]/10 text-[#00f0ff] neon-border-cyan'
                  : 'hover:bg-[#ffffff05] text-[#8b949e] hover:text-[#e6edf3]'
              }`}>
              {icons[tab]}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          );
        })}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">

        {/* ── Chat tab ── */}
        {sidebarTab === 'chat' && (
          <div className="space-y-3 animate-fade-in flex flex-col h-full">

            {/* New session button */}
            <button onClick={handleNewSession}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-[#ffffff0a] text-left text-xs font-semibold text-[#00f0ff] font-['Space_Grotesk'] transition-all border border-transparent hover:border-[#00f0ff]/20">
              <Plus size={14} className="text-[#00f0ff]" />
              New Neural Channel
            </button>

            {/* Search bar */}
            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#484f58]" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sessions & tags…"
                className="w-full bg-[#ffffff05] text-[#e6edf3] text-[11px] pl-7 pr-3 py-2 rounded-lg border border-[#ffffff08] outline-none font-code placeholder:text-[#484f58] focus:border-[#00f0ff]/30 transition-colors"
              />
              {isSearching && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 border border-[#00f0ff]/30 border-t-[#00f0ff] rounded-full animate-spin" />
              )}
            </div>

            {/* Archive toggle */}
            {archivedCount > 0 && (
              <button onClick={() => setShowArchived((v) => !v)}
                className="flex items-center gap-2 text-[10px] text-[#8b949e] hover:text-[#e6edf3] transition-colors px-1">
                <Archive size={11} className={showArchived ? 'text-[#d29922]' : ''} />
                {showArchived ? `Hide archived (${archivedCount})` : `Show archived (${archivedCount})`}
              </button>
            )}

            {/* Sessions list header */}
            <div className="flex items-center gap-1.5 px-1 opacity-70">
              <div className="w-1.5 h-1.5 rounded-full bg-[#b026ff] animate-pulse" />
              <span className="text-[9px] font-bold text-[#b026ff] uppercase tracking-wider font-code">
                {searchResults ? 'Search Results' : 'Active Channels'}
              </span>
              {searchResults && (
                <span className="ml-auto text-[9px] text-[#484f58]">{searchResults.length} found</span>
              )}
            </div>

            {/* Sessions tree */}
            <div className="flex-1 space-y-0.5 overflow-y-auto scrollbar-none">
              {displaySessions.length === 0 ? (
                <div className="text-[10px] text-[#484f58] italic p-2 text-center font-code">
                  {searchResults ? 'No sessions match your query.' : 'No active channels.'}
                </div>
              ) : (
                roots.map((s) => renderSession(s))
              )}
            </div>
          </div>
        )}

        {/* ── Cowork tab ── */}
        {sidebarTab === 'cowork' && (
          <div className="text-center py-8 text-xs text-[#8b949e] space-y-3 animate-fade-in">
            <Network size={24} className="mx-auto text-[#00f0ff]/50 animate-pulse" />
            <p className="font-code uppercase tracking-widest text-[10px]">P2P Network Offline</p>
            <button className="px-4 py-2 bg-[#00f0ff]/10 hover:bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/30 rounded-lg font-bold font-['Space_Grotesk'] transition-all glow-blue">
              Broadcast Signal
            </button>
          </div>
        )}

        {/* ── Code tab ── */}
        {sidebarTab === 'code' && (
          <div className="space-y-3 h-full flex flex-col animate-fade-in">
            <ProjectSelector />
            <div className="flex-1 overflow-y-auto scrollbar-none mt-2 glass-card border-none bg-black/20 p-2">
              <FileExplorer />
            </div>
          </div>
        )}
      </div>

      {/* Bottom profile section */}
      <div className="p-3 border-t border-[#ffffff0a] bg-black/40">
        <div onClick={handleProfileClick} className="flex items-center justify-between p-2 rounded-xl hover:bg-[#ffffff0a] cursor-pointer transition-all border border-transparent hover:border-[#b026ff]/30 group">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#00f0ff] to-[#b026ff] flex items-center justify-center text-white text-xs font-bold shadow-[0_0_15px_rgba(176,38,255,0.4)]">
              {username.charAt(0).toUpperCase() || '?'}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-[#e6edf3] font-['Space_Grotesk'] group-hover:text-[#00f0ff] transition-colors">{username}</span>
              <span className="text-[10px] text-[#8b949e]/80 italic mt-0.5 max-w-[175px] truncate block" title={quote}>
                "{quote}"
              </span>
            </div>
          </div>
          <ChevronDown size={14} className="text-[#8b949e] group-hover:text-[#b026ff] transition-colors" />
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
